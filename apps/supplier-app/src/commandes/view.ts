import type { PaidOrderRow, SupplierContact } from '../operations/service';

/**
 * RB-1 — the Commandes tab's PURE decisions (founder direction 2026-08-08:
 * « if a buyer buys a product it comes on commandes… I see the À traiter,
 * Terminées and incident »). No DOM, no fetch, no clock of its own — `now` is
 * always an argument, so every duration on the screen is testable to the
 * minute. Strings are CATALOG KEYS.
 *
 * THE SEGMENTS ARE A PARTITION — the order's whole road, in the founder's own
 * stages (his order, 2026-08-09: « rename actual terminées to prêt à livrer,
 * another screen en route for product in transit, and another Terminées for
 * product delivered and all completed »). Precedence:
 *   · `incidents`  — the order has a protection-fund claim (any state): a
 *     signaled order is an incident FIRST, whatever its stage says, because
 *     the founder must never see a contested order filed as settled work.
 *   · `terminees`  — DELIVERED: Séra validated the drop and the settlement
 *     records folded (the gains read's own `livree`, never inferred).
 *   · `en_route`   — a LIVE Séra assignment carries it (the board's active
 *     set): relayed to a rider, not yet delivered.
 *   · `pret`       — the supplier confirmed « Produit prêt » (readyAt set):
 *     ready to relay — the confier act lives HERE.
 *   · `a_traiter`  — everything else: paid, waiting on the supplier.
 */

export type SegmentCommandes = 'a_traiter' | 'pret' | 'en_route' | 'terminees' | 'incidents';

export interface CommandesSegments {
  readonly a_traiter: readonly PaidOrderRow[];
  readonly pret: readonly PaidOrderRow[];
  readonly en_route: readonly PaidOrderRow[];
  readonly terminees: readonly PaidOrderRow[];
  readonly incidents: readonly PaidOrderRow[];
}

export function segmenter(
  orders: readonly PaidOrderRow[],
  claimedOrderIds: ReadonlySet<string>,
  /** OrderIds a live Séra assignment carries (board `assignments`). Absent
   *  keys (no Séra key typed, board unreachable) degrade rows to `pret` —
   *  true-but-colder, and the confier door re-refuses a double relay anyway. */
  enRouteOrderIds: ReadonlySet<string>,
  /** OrderIds whose gains row says `livree` — the settlement's own word. */
  livreeOrderIds: ReadonlySet<string>,
): CommandesSegments {
  const a_traiter: PaidOrderRow[] = [];
  const pret: PaidOrderRow[] = [];
  const en_route: PaidOrderRow[] = [];
  const terminees: PaidOrderRow[] = [];
  const incidents: PaidOrderRow[] = [];
  for (const o of orders) {
    if (claimedOrderIds.has(o.orderId)) incidents.push(o);
    else if (livreeOrderIds.has(o.orderId)) terminees.push(o);
    else if (enRouteOrderIds.has(o.orderId)) en_route.push(o);
    else if (o.fulfillment?.readyAt !== undefined) pret.push(o);
    else a_traiter.push(o);
  }
  return { a_traiter, pret, en_route, terminees, incidents };
}

/**
 * « Depuis combien de temps ? » — the founder's first question on a waiting
 * order, in market French, largest honest unit only: a figure like
 * « 2 j 3 h » reads as a logline; « 2 jours » reads as a fact he can act on.
 * Sub-minute is « à l'instant » — a just-paid order is news, not a delay.
 */
export function attenteDepuis(paidAt: string, nowMs: number): string {
  const t = Date.parse(paidAt);
  if (Number.isNaN(t)) return '';
  const mins = Math.floor((nowMs - t) / 60_000);
  if (mins < 1) return 'commandes.instant';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return hours === 1 ? '1 heure' : `${hours} heures`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 jour' : `${days} jours`;
}

/** The waiting tone: calm under 4 h, insistent under 24 h, loud beyond — the
 *  trust test says the screen states urgency, it never manufactures it. */
export function tonAttente(paidAt: string, nowMs: number): 'calme' | 'appuye' | 'fort' {
  const t = Date.parse(paidAt);
  if (Number.isNaN(t)) return 'calme';
  const hours = (nowMs - t) / 3_600_000;
  if (hours < 4) return 'calme';
  if (hours < 24) return 'appuye';
  return 'fort';
}

/**
 * THE SUPPLIER'S NAME, « very noticeably visible » (founder's words). The
 * founder-entered card names them; without a card the supplierId is shown —
 * true, never invented — with `carteAbsente` so the screen can invite him to
 * name them once, right there.
 */
export interface NomFournisseur {
  readonly nom: string;
  readonly telephone: string;
  readonly carteAbsente: boolean;
}

export function nomFournisseur(
  supplierId: string,
  contacts: readonly SupplierContact[],
): NomFournisseur {
  const card = contacts.find((c) => c.supplierId === supplierId);
  if (card === undefined) return { nom: supplierId, telephone: '', carteAbsente: true };
  return { nom: card.name, telephone: card.phone, carteAbsente: false };
}

/** One pill per row — where the order stands, in one word he can read in sun. */
export function pilluleCommande(
  row: PaidOrderRow,
  segment: SegmentCommandes,
): { readonly label: string; readonly ton: 'attente' | 'ok' | 'alerte' } {
  if (segment === 'incidents') return { label: 'commandes.pill_incident', ton: 'alerte' };
  if (segment === 'terminees') return { label: 'commandes.pill_livree', ton: 'ok' };
  if (segment === 'en_route') return { label: 'commandes.pill_en_route', ton: 'ok' };
  if (segment === 'pret') return { label: 'commandes.pill_prete', ton: 'ok' };
  return row.fulfillment?.acceptedAt !== undefined
    ? { label: 'commandes.pill_acceptee', ton: 'attente' }
    : { label: 'commandes.pill_attente', ton: 'attente' };
}
