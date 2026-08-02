/**
 * READINESS-WIRE-1b-ii — the FOURNISSEUR surface's one outbound port.
 *
 * FOUNDER RULING (2026-08-02): suppliers' webapps are fulfillment-only —
 * accept commandes, upload the readiness photo proof, follow until delivery.
 * This module is the WHOLE of what their surface can say to the platform, and
 * the personal code (1b-i) is the WHOLE of its credential: presented as
 * Bearer, identity derived server-side, never claimed here.
 *
 * ═══ THE CODE LIVES IN THEIR BROWSER, NEVER IN THE BUNDLE ═══
 * Exactly the operator-console discipline: no `EXPO_PUBLIC_*` carries any
 * code; it is typed once at the door and persisted in the supplier's own
 * localStorage. And this bundle carries NO offers write key — the fournisseur
 * export never receives it, and the artifact gate proves its absence.
 *
 * UNSET RESOLVES TO NOTHING, NEVER TO DEMO — the standing law of this app's
 * outbound ports.
 */

import type { MediaRefInput } from '../supply/assets';

/** Mirrors the /mine ALLOWLIST (offer-service fulfillment-do.ts) — nothing
 *  else ever arrives, and the reader drops anything malformed. */
export interface CommandeRow {
  readonly orderId: string;
  readonly productName: string;
  readonly productVersionId: string;
  readonly offerVersion: string;
  readonly paymentMode: string;
  readonly paidAt: string;
  readonly zoneTo: string;
  readonly sellerBasePrice: number;
  readonly fulfillment?: { readonly acceptedAt?: string; readonly readyAt?: string };
}

export type MineResult =
  | { readonly ok: true; readonly orders: readonly CommandeRow[] }
  /** `bad_code`: the door refused — its own sentence, distinct from the road
   *  being down; the screen returns to the code door. */
  | { readonly ok: false; readonly reason: 'bad_code' | 'unreachable' };

/**
 * LISTER-POUR-1c — ONE of his products, as `GET /offers/mine` serves it
 * (offer-service supplier-list.ts, the founder-ruled PRODUITS-READ-1 shape,
 * scoped by the identity his CODE derives — never by anything this app says).
 * READ-ONLY BY CONSTRUCTION: this port exposes no write for it, and the
 * service refuses a personal code on every offer write anyway (1a pins it).
 */
export interface ProduitRow {
  readonly offerId: string;
  readonly productVersionId: string;
  readonly name: string;
  readonly category: string;
  readonly basePrice: number;
  readonly available: number;
  readonly assetRefs: readonly string[];
  readonly variantsNote?: string;
  /** ABSENT means live to resellers right now; present names WHY it is not —
   *  the refusal ladder's own reason, never a local re-derivation. */
  readonly hiddenReason?: 'product_not_active' | 'product_not_approved' | 'offer_not_active' | 'offer_not_effective';
}

export type ProduitsResult =
  | { readonly ok: true; readonly produits: readonly ProduitRow[] }
  | { readonly ok: false; readonly reason: 'bad_code' | 'unreachable' };

export type ActResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'bad_code' | 'not_yours_or_unknown' | 'unreachable' };

export type ChallengeResult =
  | { readonly ok: true; readonly challenge: string; readonly expiresAt: string }
  | { readonly ok: false; readonly reason: 'bad_code' | 'not_accepted' | 'already_ready' | 'not_yours_or_unknown' | 'unreachable' };

/** The named server refusals « Produit prêt » can answer — surfaced, never
 *  collapsed into a generic failure (each asks a DIFFERENT act of the
 *  supplier: re-fetch a challenge vs call the founder vs retry). */
export type ReadyRefusal =
  | 'not_canonical_or_foreign_secret'
  | 'not_accepted'
  | 'challenge_missing_or_mismatched'
  | 'challenge_expired'
  | 'challenge_already_used'
  | 'locked_terms_mismatch'
  | 'already_ready'
  | 'not_yours_or_unknown';

export type ReadyResult =
  | { readonly ok: true; readonly status: 'ready' | 'already_ready'; readonly confirmedAt: string }
  | { readonly ok: false; readonly reason: 'bad_code' | 'unreachable' | ReadyRefusal };

export interface FournisseurServicePort {
  listMine(code: string): Promise<MineResult>;
  /** LISTER-POUR-1c — his own products, same door, same Bearer. */
  listProduits(code: string): Promise<ProduitsResult>;
  accept(code: string, orderId: string): Promise<ActResult>;
  challenge(code: string, orderId: string): Promise<ChallengeResult>;
  /** The strict canon confirmation travels whole; the Worker re-parses it. */
  ready(code: string, confirmation: {
    orderId: string;
    photoRef: MediaRefInput;
    readinessChallenge: string;
    qty: number;
    variant: string;
    availableConfirmed: boolean;
    at: string;
  }): Promise<ReadyResult>;
}

const READY_REFUSALS: readonly ReadyRefusal[] = [
  'not_canonical_or_foreign_secret', 'not_accepted', 'challenge_missing_or_mismatched',
  'challenge_expired', 'challenge_already_used', 'locked_terms_mismatch',
  'already_ready', 'not_yours_or_unknown',
];

export function resolveFournisseurService(): FournisseurServicePort | null {
  const base = process.env.EXPO_PUBLIC_OFFER_BASE;
  if (base === undefined || base === '') return null;
  const trimmed = base.replace(/\/$/, '');

  const post = async (path: string, code: string, body: unknown): Promise<{ status: number; json: Record<string, unknown> } | null> => {
    try {
      const res = await fetch(`${trimmed}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: `Bearer ${code}` },
        body: JSON.stringify(body),
      });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      return { status: res.status, json };
    } catch {
      return null;
    }
  };

  return {
    async listMine(code: string): Promise<MineResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/mine`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${code}` },
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_code' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      const body = (await res.json().catch(() => null)) as { ok?: boolean; orders?: unknown } | null;
      if (body?.ok !== true || !Array.isArray(body.orders)) return { ok: false, reason: 'unreachable' };
      const orders: CommandeRow[] = [];
      for (const raw of body.orders) {
        const row = readCommandeRow(raw);
        if (row !== null) orders.push(row);
      }
      return { ok: true, orders };
    },

    async listProduits(code: string): Promise<ProduitsResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/offers/mine`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${code}` },
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_code' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      const body = (await res.json().catch(() => null)) as { items?: unknown } | null;
      if (body === null || !Array.isArray(body.items)) return { ok: false, reason: 'unreachable' };
      const produits: ProduitRow[] = [];
      for (const raw of body.items) {
        const row = readProduitRow(raw);
        if (row !== null) produits.push(row);
      }
      return { ok: true, produits };
    },

    async accept(code: string, orderId: string): Promise<ActResult> {
      const res = await post('/fulfillment/accept', code, { orderId });
      if (res === null) return { ok: false, reason: 'unreachable' };
      if (res.status === 401) return { ok: false, reason: 'bad_code' };
      if (res.status === 404) return { ok: false, reason: 'not_yours_or_unknown' };
      if (res.json['ok'] !== true) return { ok: false, reason: 'unreachable' };
      return { ok: true };
    },

    async challenge(code: string, orderId: string): Promise<ChallengeResult> {
      const res = await post('/fulfillment/ready/challenge', code, { orderId });
      if (res === null) return { ok: false, reason: 'unreachable' };
      if (res.status === 401) return { ok: false, reason: 'bad_code' };
      if (res.status === 404) return { ok: false, reason: 'not_yours_or_unknown' };
      const reason = res.json['reason'];
      if (reason === 'not_accepted' || reason === 'already_ready') return { ok: false, reason };
      const challenge = res.json['challenge'];
      const expiresAt = res.json['expiresAt'];
      if (res.json['ok'] !== true || typeof challenge !== 'string' || typeof expiresAt !== 'string') {
        return { ok: false, reason: 'unreachable' };
      }
      return { ok: true, challenge, expiresAt };
    },

    async ready(code, confirmation): Promise<ReadyResult> {
      const res = await post('/fulfillment/ready', code, confirmation);
      if (res === null) return { ok: false, reason: 'unreachable' };
      if (res.status === 401) return { ok: false, reason: 'bad_code' };
      const status = res.json['status'];
      const confirmedAt = res.json['confirmedAt'];
      if (res.json['ok'] === true && (status === 'ready' || status === 'already_ready') && typeof confirmedAt === 'string') {
        return { ok: true, status, confirmedAt };
      }
      const reason = res.json['reason'];
      if (typeof reason === 'string' && (READY_REFUSALS as readonly string[]).includes(reason)) {
        return { ok: false, reason: reason as ReadyRefusal };
      }
      return { ok: false, reason: 'unreachable' };
    },
  };
}

const HIDDEN_REASONS = ['product_not_active', 'product_not_approved', 'offer_not_active', 'offer_not_effective'] as const;

/** Strict, like `readCommandeRow`: a malformed row is DROPPED WHOLE — a
 *  product with an unreadable price must not render a wrong one. */
function readProduitRow(value: unknown): ProduitRow | null {
  if (value === null || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const ok =
    typeof r['offerId'] === 'string' && r['offerId'] !== '' &&
    typeof r['productVersionId'] === 'string' && r['productVersionId'] !== '' &&
    typeof r['name'] === 'string' && r['name'] !== '' &&
    typeof r['category'] === 'string' &&
    typeof r['basePrice'] === 'number' && Number.isSafeInteger(r['basePrice']) &&
    typeof r['available'] === 'number' && Number.isSafeInteger(r['available']) &&
    Array.isArray(r['assetRefs']) && (r['assetRefs'] as unknown[]).every((a) => typeof a === 'string') &&
    (r['variantsNote'] === undefined || typeof r['variantsNote'] === 'string') &&
    (r['hiddenReason'] === undefined || (HIDDEN_REASONS as readonly string[]).includes(r['hiddenReason'] as string));
  if (!ok) return null;
  return {
    offerId: r['offerId'] as string,
    productVersionId: r['productVersionId'] as string,
    name: r['name'] as string,
    category: r['category'] as string,
    basePrice: r['basePrice'] as number,
    available: r['available'] as number,
    assetRefs: r['assetRefs'] as readonly string[],
    ...(r['variantsNote'] === undefined ? {} : { variantsNote: r['variantsNote'] as string }),
    ...(r['hiddenReason'] === undefined ? {} : { hiddenReason: r['hiddenReason'] as Exclude<ProduitRow['hiddenReason'], undefined> }),
  };
}

function readCommandeRow(value: unknown): CommandeRow | null {
  if (value === null || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const ok =
    typeof r['orderId'] === 'string' && r['orderId'] !== '' &&
    typeof r['productName'] === 'string' &&
    typeof r['productVersionId'] === 'string' &&
    typeof r['offerVersion'] === 'string' &&
    typeof r['paymentMode'] === 'string' &&
    typeof r['paidAt'] === 'string' &&
    typeof r['zoneTo'] === 'string' &&
    typeof r['sellerBasePrice'] === 'number' && Number.isSafeInteger(r['sellerBasePrice']);
  if (!ok) return null;
  // A MALFORMED fulfillment mark drops the WHOLE ROW (verifier N4): demoting
  // it to « no mark » would re-render a live « Accepter » button on an order
  // the book already holds as accepted — a half-formed line asking for a
  // duplicate act. Same strictness as every other malformed field.
  const f = r['fulfillment'];
  let fulfillment: CommandeRow['fulfillment'];
  if (f !== undefined) {
    if (f === null || typeof f !== 'object') return null;
    const fr = f as Record<string, unknown>;
    const validIso = (v: unknown): v is string => typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v));
    const acceptedAt = validIso(fr['acceptedAt']) ? fr['acceptedAt'] : undefined;
    const readyAt = validIso(fr['readyAt']) ? fr['readyAt'] : undefined;
    if ((fr['acceptedAt'] !== undefined && acceptedAt === undefined) || (fr['readyAt'] !== undefined && readyAt === undefined)) {
      return null;
    }
    if (acceptedAt === undefined && readyAt === undefined) return null;
    fulfillment = { ...(acceptedAt !== undefined ? { acceptedAt } : {}), ...(readyAt !== undefined ? { readyAt } : {}) };
  }
  return {
    orderId: r['orderId'] as string,
    productName: r['productName'] as string,
    productVersionId: r['productVersionId'] as string,
    offerVersion: r['offerVersion'] as string,
    paymentMode: r['paymentMode'] as string,
    paidAt: r['paidAt'] as string,
    zoneTo: r['zoneTo'] as string,
    sellerBasePrice: r['sellerBasePrice'] as number,
    ...(fulfillment !== undefined ? { fulfillment } : {}),
  };
}

/* ─────────────── the supplier's code, on THEIR device only ─────────────── */

const CODE_STORAGE = 'boutik.fournisseur.code';

export function readStoredCode(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(CODE_STORAGE);
    return v !== null && v !== '' ? v : null;
  } catch {
    return null;
  }
}

export function storeCode(code: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CODE_STORAGE, code);
  } catch {
    // storage refused (private mode) — the session keeps the code in memory only.
  }
}

export function clearStoredCode(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CODE_STORAGE);
  } catch {
    // nothing to clear
  }
}
