/**
 * ═══ COLIS-PERDU — the founder declares a parcel lost on the road ═══
 *
 * Sera-Build-Spec §6.5 (canon 3.28.0): only the founder declares it, from his
 * Boutik+ console, and only while a courier is the current custodian; it is
 * final and covers the whole parcel, at the amount he types for each order.
 * Séra closes custody, files the claim and tells Shop+; this port only asks.
 *
 * Another client of the same key-gated Séra door as the SOS strip and
 * « Coursiers »: the same base, the same key (typed in « Coursiers », kept on
 * this browser, cleared on 401), the same time limit.
 *
 * RN-safe: no `@platform/*` runtime import (Metro law). Wire shapes are
 * mirrored locally and read defensively: only Séra's own « declare » or
 * « deja_declare » is ever said as declared; anything this port cannot read
 * is « not known », never success.
 */

import { fetchBorne } from '../reseau';
import { COURSIERS_TIMEOUT_MS } from '../coursiers/service';

/** One live course whose every order custody places with its rider. No price. */
export interface ColisEnMain {
  /** The course's order on Séra's board: the `orderId` the door is called with. */
  readonly orderId: string;
  /** Every order the parcel carries, this one included, each needing its amount. */
  readonly commandes: readonly string[];
  readonly riderId: string;
  /** The name he typed on the roster; the rider id when Séra gave none. */
  readonly nom: string;
}

export type LectureColis =
  | { kind: 'ok'; colis: readonly ColisEnMain[] }
  | { kind: 'unreachable' }
  | { kind: 'bad_key' };

export type ReponseColis =
  | { kind: 'declare' }
  | { kind: 'deja_declare' }
  | { kind: 'no_active_course' }
  | { kind: 'pas_chez_le_livreur' }
  | { kind: 'montants_incomplets' }
  | { kind: 'malformed' }
  /** Séra said nothing moved because custody could not be asked: the same command may be sent again. */
  | { kind: 'custody' }
  | { kind: 'bad_key' }
  /** No answer, or one this port cannot read: nobody knows whether it was declared. */
  | { kind: 'non_su' };

export interface Montant {
  readonly orderId: string;
  readonly amount: number;
}

export interface ColisPerduPort {
  lire(): Promise<LectureColis>;
  declarer(commandId: string, orderId: string, montants: readonly Montant[]): Promise<ReponseColis>;
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

const texte = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);
const objet = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * The courses a rider holds, from Séra's board. A course is offered only when
 * a live assignment names a rider AND that rider's manifest reads `coursier`
 * for every order it carries: « confiée » alone includes a course accepted
 * while the parcel is still at the stall, and a missing or unknown reading is
 * no reading. Séra still decides at its door (`pas_chez_le_livreur`).
 */
export function colisEnMain(body: unknown): readonly ColisEnMain[] | null {
  const board = objet(objet(body)?.['board']);
  if (board === null || !Array.isArray(board['assignments'])) return null;
  const noms = new Map<string, string>();
  if (Array.isArray(board['riders'])) {
    for (const brut of board['riders']) {
      const r = objet(brut);
      const id = texte(r?.['riderId']);
      const nom = texte(r?.['displayName']);
      if (id !== null && nom !== null) noms.set(id, nom);
    }
  }
  const manifestes = objet(board['manifestes']) ?? {};
  const colis = objet(board['colisEnCourse']) ?? {};
  const out: ColisEnMain[] = [];
  for (const brut of board['assignments']) {
    const a = objet(brut);
    const orderId = texte(a?.['orderId']);
    const riderId = texte(a?.['riderId']);
    if (a === null || orderId === null || riderId === null) continue;
    const assignmentId = texte(a['assignmentId']);
    const ids = assignmentId === null ? undefined : objet(colis[assignmentId])?.['orderIds'];
    const autres = Array.isArray(ids) ? ids.filter((x): x is string => texte(x) !== null) : [];
    const commandes = autres.includes(orderId) ? autres : [orderId, ...autres];
    const lectures = objet(manifestes[riderId])?.['custodyReadings'];
    if (!Array.isArray(lectures)) continue;
    const tenues = new Set(
      lectures.flatMap((l) => {
        const o = objet(l);
        return o !== null && o['reading'] === 'coursier' && texte(o['orderId']) !== null ? [texte(o['orderId'])!] : [];
      }),
    );
    if (!commandes.every((id) => tenues.has(id))) continue;
    out.push({ orderId, commandes, riderId, nom: noms.get(riderId) ?? riderId });
  }
  return out.sort((x, y) => (x.orderId < y.orderId ? -1 : 1));
}

const REFUS: Readonly<Record<string, ReponseColis>> = {
  no_active_course: { kind: 'no_active_course' },
  pas_chez_le_livreur: { kind: 'pas_chez_le_livreur' },
  montants_incomplets: { kind: 'montants_incomplets' },
  malformed: { kind: 'malformed' },
  custody_non_relie: { kind: 'custody' },
  custody_unreachable: { kind: 'custody' },
};

/** Each refusal belongs to one status: a reason under another status is not Séra's word. */
const STATUT_DU_REFUS: Readonly<Record<string, number>> = {
  no_active_course: 409,
  pas_chez_le_livreur: 409,
  montants_incomplets: 400,
  malformed: 400,
  custody_non_relie: 503,
  custody_unreachable: 503,
};

export function httpColisPerdu(
  base: string,
  cle: string,
  fetchFn: FetchFn = globalThis.fetch,
  timeoutMs: number = COURSIERS_TIMEOUT_MS,
): ColisPerduPort {
  const root = base.replace(/\/+$/, '');

  async function call(path: string, init: RequestInit): Promise<{ status: number; body: unknown } | null> {
    try {
      // The key rides the Authorization header and nowhere else.
      const res = await fetchBorne(`${root}${path}`, { ...init, headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' } }, timeoutMs, fetchFn);
      return { status: res.status, body: await res.json().catch(() => undefined) };
    } catch {
      return null;
    }
  }

  return {
    async lire() {
      const r = await call('/ops/board', { method: 'GET' });
      if (r === null) return { kind: 'unreachable' };
      if (r.status === 401 || r.status === 403) return { kind: 'bad_key' };
      const colis = r.status === 200 ? colisEnMain(r.body) : null;
      return colis === null ? { kind: 'unreachable' } : { kind: 'ok', colis };
    },

    async declarer(commandId, orderId, montants) {
      const r = await call('/ops/colis/perdu', {
        method: 'POST',
        body: JSON.stringify({ command_id: commandId, orderId, montants: montants.map((m) => ({ orderId: m.orderId, amount: m.amount })) }),
      });
      if (r === null) return { kind: 'non_su' };
      if (r.status === 401 || r.status === 403) return { kind: 'bad_key' };
      const body = objet(r.body);
      if (r.status === 200) {
        if (body?.['ok'] !== true) return { kind: 'non_su' };
        if (body['status'] === 'declare') return { kind: 'declare' };
        if (body['status'] === 'deja_declare') return { kind: 'deja_declare' };
        return { kind: 'non_su' };
      }
      const reason = texte(body?.['reason']);
      if (reason !== null && STATUT_DU_REFUS[reason] === r.status) return REFUS[reason]!;
      return { kind: 'non_su' };
    },
  };
}

/** UNSET ⇒ nothing, never a demo desk. */
export function resolveColisPerdu(cle: string): ColisPerduPort | null {
  const base = process.env.EXPO_PUBLIC_SERA_LOGISTICS_BASE;
  const trimmed = typeof base === 'string' ? base.trim() : '';
  if (trimmed === '' || cle.trim() === '') return null;
  return httpColisPerdu(trimmed, cle.trim());
}
