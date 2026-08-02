/**
 * CONSOLE-1 — the operator's client to the LIVE fulfillment book
 * (`GET /fulfillment/orders` on offer-service, ORDER-PAID-WIRE-1c).
 *
 * ═══ THE KEY IS TYPED BY THE FOUNDER, NEVER BUNDLED ═══
 *
 * Every other credential this app presents ships inside the published bundle
 * (the write key — a scanner-stopper, not a secret). THIS one is different in
 * kind: `FULFILLMENT_OPS_SECRET` unlocks supplier identities and every paid
 * order on the platform, it exists in exactly two places — the Worker's
 * encrypted store and the founder's head — and it must never become a third.
 * So there is NO `EXPO_PUBLIC_*` for it, deliberately: the resolver takes the
 * key as an argument from the screen that asked the founder for it, and the
 * only persistence is the founder's own browser (`localStorage`, his device,
 * his choice to save it there). An attacker with the public bundle holds
 * nothing.
 *
 * UNSET RESOLVES TO NOTHING, NEVER TO DEMO — the standing law of this app's
 * outbound ports (`supply/service.ts` states the scar in full). There is no
 * demo book and no import of one.
 *
 * RN-safe: no `@platform/*` runtime import (Metro law). The record shape is
 * mirrored locally; the SERVICE validated the canon event at intake, so what
 * this port reads is already refused-or-true.
 */

/**
 * CONSOLE-2 — the operator's own chase mark, merged onto the row by the book.
 * « J'ai appelé le fournisseur », with the SERVER's clock. Never readiness:
 * canon readiness (B+I-06 — photo + `sellerReadinessChallenge`) is the
 * supplier's evidenced act and gates custody; this is a phone call.
 */
export interface RelanceMark {
  readonly at: string;
  readonly count: number;
}

/**
 * READINESS-WIRE-1a — the REAL preparation signal, merged onto the row by the
 * book: the supplier ACCEPTED (B6.1) and/or confirmed « Produit prêt » with
 * evidence + the challenge (B6.2). Server clocks both. This is the signal the
 * founder's 10-minute rule was always waiting for — a relance is his phone
 * call; THIS is the supplier's own act.
 */
export interface FulfillmentMark {
  readonly acceptedAt?: string;
  readonly readyAt?: string;
}

/** Mirrors `PaidOrderRecord` (offer-service `worker/fulfillment-do.ts`). */
export interface PaidOrderRow {
  readonly orderId: string;
  readonly productVersionId: string;
  /** Enriched at intake from the offer store's own entry; '' when unknown. */
  readonly productName: string;
  readonly offerVersion: string;
  readonly paymentMode: string;
  readonly paidAt: string;
  readonly zoneTo: string;
  readonly sellerBasePrice: number;
  readonly supplierId: string;
  readonly supplierResolved: boolean;
  readonly registeredAt: string;
  /** Absent until the operator has called about this order. */
  readonly relance?: RelanceMark;
  /** Absent until the supplier has accepted or confirmed ready. */
  readonly fulfillment?: FulfillmentMark;
}

export type PaidOrdersResult =
  | { readonly ok: true; readonly orders: readonly PaidOrderRow[] }
  /** The key was REFUSED — a different honest sentence from « unreachable »:
   *  one asks the founder to re-check what he typed, the other to retry. */
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

export type RelanceResult =
  | { readonly ok: true }
  /** `unknown_order`: the book has no such order — the board is stale, so the
   *  screen re-reads rather than pretending the call was logged. */
  | { readonly ok: false; readonly reason: 'bad_key' | 'unknown_order' | 'unreachable' };

export interface OperationsServicePort {
  listPaidOrders(opsKey: string): Promise<PaidOrdersResult>;
  /** Records « j'ai appelé le fournisseur ». NO timestamp crosses the wire —
   *  the Worker stamps its own clock. */
  recordRelance(opsKey: string, orderId: string): Promise<RelanceResult>;
}

/**
 * Dot access on `process.env.EXPO_PUBLIC_*` (member expression), the same
 * Metro-inlining rule `supply/service.ts` documents: a computed access is
 * invisible to the inliner and ships `undefined` forever.
 */
export function resolveOperationsService(): OperationsServicePort | null {
  const base = process.env.EXPO_PUBLIC_OFFER_BASE;
  if (base === undefined || base === '') return null;
  const trimmed = base.replace(/\/$/, '');
  return {
    async listPaidOrders(opsKey: string): Promise<PaidOrdersResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/orders`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${opsKey}` },
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      const body = (await res.json().catch(() => null)) as { ok?: boolean; orders?: unknown } | null;
      if (body?.ok !== true || !Array.isArray(body.orders)) return { ok: false, reason: 'unreachable' };
      // Shape-READ row by row: a record the book never wrote is DROPPED, never
      // rendered half-formed — the console's whole worth is that every line on
      // it is true. Reading (not just guarding) matters for the two fields
      // records written BEFORE the productName enrichment lack: they normalize
      // to '', so the screen's fallback-to-pv-id renders instead of a blank
      // title on precisely the oldest rows.
      const orders: PaidOrderRow[] = [];
      for (const raw of body.orders) {
        const row = readPaidOrderRow(raw);
        if (row !== null) orders.push(row);
      }
      return { ok: true, orders };
    },

    async recordRelance(opsKey: string, orderId: string): Promise<RelanceResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/relance`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opsKey}`,
          },
          // ONLY the id. The Worker stamps the time — a client-claimed clock
          // is exactly the class of defect the emitter's `paidAt` round taught.
          body: JSON.stringify({ orderId }),
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      if (res.status === 404) return { ok: false, reason: 'unknown_order' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      return { ok: true };
    },
  };
}

function readPaidOrderRow(value: unknown): PaidOrderRow | null {
  if (value === null || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const ok =
    typeof r['orderId'] === 'string' &&
    r['orderId'] !== '' &&
    typeof r['productVersionId'] === 'string' &&
    typeof r['paymentMode'] === 'string' &&
    typeof r['paidAt'] === 'string' &&
    typeof r['zoneTo'] === 'string' &&
    typeof r['sellerBasePrice'] === 'number' &&
    Number.isSafeInteger(r['sellerBasePrice']) &&
    typeof r['supplierId'] === 'string' &&
    typeof r['supplierResolved'] === 'boolean' &&
    typeof r['registeredAt'] === 'string' &&
    (r['productName'] === undefined || typeof r['productName'] === 'string') &&
    (r['offerVersion'] === undefined || typeof r['offerVersion'] === 'string');
  if (!ok) return null;
  const relance = readRelance(r['relance']);
  const fulfillment = readFulfillment(r['fulfillment']);
  return {
    ...(relance !== null ? { relance } : {}),
    ...(fulfillment !== null ? { fulfillment } : {}),
    orderId: r['orderId'] as string,
    productVersionId: r['productVersionId'] as string,
    productName: typeof r['productName'] === 'string' ? r['productName'] : '',
    offerVersion: typeof r['offerVersion'] === 'string' ? r['offerVersion'] : '',
    paymentMode: r['paymentMode'] as string,
    paidAt: r['paidAt'] as string,
    zoneTo: r['zoneTo'] as string,
    sellerBasePrice: r['sellerBasePrice'] as number,
    supplierId: r['supplierId'] as string,
    supplierResolved: r['supplierResolved'] as boolean,
    registeredAt: r['registeredAt'] as string,
  };
}

/** A malformed mark is DROPPED, never rendered as a call that may not have
 *  happened — « vous avez appelé » must be true or absent. */
function readRelance(value: unknown): RelanceMark | null {
  if (value === null || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (typeof r['at'] !== 'string' || r['at'] === '') return null;
  // An UNPARSEABLE instant is dropped too: `ageMinutes` reads a non-date as 0,
  // which would render the very specific false claim « Appelé à l'instant »
  // about a call whose time this app cannot actually know.
  if (Number.isNaN(Date.parse(r['at']))) return null;
  if (typeof r['count'] !== 'number' || !Number.isSafeInteger(r['count']) || r['count'] < 1) return null;
  return { at: r['at'], count: r['count'] };
}

/** A malformed preparation mark is DROPPED — « Accepté »/« Prêt » must be
 *  true or absent (the same law as the relance mark). A mark with NEITHER
 *  clock is nothing and reads as absent. */
function readFulfillment(value: unknown): FulfillmentMark | null {
  if (value === null || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const validIso = (v: unknown): v is string =>
    typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v));
  const acceptedAt = validIso(r['acceptedAt']) ? r['acceptedAt'] : undefined;
  const readyAt = validIso(r['readyAt']) ? r['readyAt'] : undefined;
  if (acceptedAt === undefined && readyAt === undefined) return null;
  return {
    ...(acceptedAt !== undefined ? { acceptedAt } : {}),
    ...(readyAt !== undefined ? { readyAt } : {}),
  };
}

/* ─────────────────── the founder's key, on HIS device only ─────────────────── */

const OPS_KEY_STORAGE = 'boutik.operateur.cle';

/** Web: his browser's localStorage. Native: nowhere — the console is a webapp
 *  surface by founder ruling, and the parked native app never shows it. */
export function readStoredOpsKey(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(OPS_KEY_STORAGE);
    return v !== null && v !== '' ? v : null;
  } catch {
    return null;
  }
}

export function storeOpsKey(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(OPS_KEY_STORAGE, key);
  } catch {
    // storage refused (private mode) — the session keeps the key in memory only.
  }
}

export function clearStoredOpsKey(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(OPS_KEY_STORAGE);
  } catch {
    // nothing to clear
  }
}

/** The web-only door to the key screen: boutik-plus-web.pages.dev/#operateur */
export function operateurHashPresent(): boolean {
  try {
    // RN's TS lib has no DOM `window`; on web the global exists at runtime.
    const w = (globalThis as { window?: { location?: { hash?: string } } }).window;
    return w?.location?.hash === '#operateur';
  } catch {
    return false;
  }
}
