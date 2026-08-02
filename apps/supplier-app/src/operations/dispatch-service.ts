/**
 * BC-1c — the founder's client to the Shop+ DISPATCH read
 * (`GET /checkout/dispatch`, BC-1a; founder-approved proposal 2026-08-02).
 *
 * ═══ ONE CONSOLE, TWO DOORS, TWO KEYS ═══
 * The board's key (FULFILLMENT_OPS_SECRET, « value B ») opens the Boutik+
 * paid-order book. THIS key (CHECKOUT_OPS_SECRET, « value C ») opens buyer
 * contact on the SHOP+ Worker — a different Worker, a different capability,
 * deliberately never one credential. Same discipline as the board's key: NO
 * `EXPO_PUBLIC_*` carries it; typed once at its own door, persisted only in
 * the founder's browser. An attacker with the public bundle holds nothing.
 *
 * The BASE is config, not a credential: `EXPO_PUBLIC_SHOP_CHECKOUT_BASE`
 * (the Shop+ storefront Worker's URL), inlined at bundle time like its
 * siblings. UNSET RESOLVES TO NOTHING, NEVER TO DEMO.
 */

/** Mirrors OrderDO's /entry/dispatch ALLOWLIST projection — nothing else
 *  arrives, and the reader drops anything malformed. */
export interface LivraisonRow {
  readonly orderId: string;
  readonly state: string;
  readonly createdAt: string;
  readonly contact: { readonly phone: string; readonly quartier: string; readonly repere: string } | null;
  readonly productVersionId: string;
  readonly zoneTo: string;
}

export type LivraisonsResult =
  | { readonly ok: true; readonly rows: readonly LivraisonRow[] }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

export interface DispatchServicePort {
  listLivraisons(cleC: string): Promise<LivraisonsResult>;
}

/**
 * THE WAIT IS BOUNDED, AND THAT IS A HONESTY PROPERTY, NOT A PERFORMANCE ONE
 * (founder-found, 2026-08-02: he typed his key and the section sat on
 * « Lecture des livraisons… » with nothing behind it).
 *
 * This read crosses to ANOTHER Worker, through a browser, over a Ouaga link.
 * A request that never answers leaves an unbounded promise, and an unbounded
 * promise leaves the screen claiming « we are reading » forever — a sentence
 * that becomes false the moment it stops being true, with no way for the
 * screen to ever learn that. Bounded, the same act ends in a NAMED failure he
 * can act on (« Réessayez »). Twelve seconds: long enough for a slow 2G
 * round-trip, short enough that nobody stares at a lie.
 */
export const DISPATCH_TIMEOUT_MS = 12_000;

export function resolveDispatchService(): DispatchServicePort | null {
  const base = process.env.EXPO_PUBLIC_SHOP_CHECKOUT_BASE;
  if (base === undefined || base === '') return null;
  const trimmed = base.replace(/\/+$/, '');
  return {
    async listLivraisons(cleC: string): Promise<LivraisonsResult> {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), DISPATCH_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(`${trimmed}/checkout/dispatch`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${cleC}` },
          signal: ctl.signal,
        });
      } catch {
        // a refused connection, a blocked CORS answer, or OUR OWN abort — all
        // the same honest sentence: we could not read, try again
        return { ok: false, reason: 'unreachable' };
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      const body = (await res.json().catch(() => null)) as { ok?: boolean; orders?: unknown } | null;
      if (body?.ok !== true || !Array.isArray(body.orders)) return { ok: false, reason: 'unreachable' };
      const rows: LivraisonRow[] = [];
      for (const raw of body.orders) {
        const row = readLivraisonRow(raw);
        if (row !== null) rows.push(row);
      }
      return { ok: true, rows };
    },
  };
}

/** Strict rows, the console's standing law: whole or nothing. A malformed
 *  CONTACT drops the row too — a half phone number dispatched to a rider is
 *  worse than a row that says to check the order. */
function readLivraisonRow(value: unknown): LivraisonRow | null {
  if (value === null || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (typeof r['orderId'] !== 'string' || r['orderId'] === '') return null;
  if (typeof r['state'] !== 'string' || r['state'] === '') return null;
  if (typeof r['createdAt'] !== 'string' || Number.isNaN(Date.parse(r['createdAt']))) return null;
  if (typeof r['productVersionId'] !== 'string') return null;
  if (typeof r['zoneTo'] !== 'string') return null;
  let contact: LivraisonRow['contact'] = null;
  const c = r['contact'];
  if (c !== null && c !== undefined) {
    if (typeof c !== 'object') return null;
    const cr = c as Record<string, unknown>;
    if (typeof cr['phone'] !== 'string' || cr['phone'] === '') return null;
    if (typeof cr['quartier'] !== 'string' || cr['quartier'] === '') return null;
    if (typeof cr['repere'] !== 'string') return null;
    contact = { phone: cr['phone'], quartier: cr['quartier'], repere: cr['repere'] };
  }
  return {
    orderId: r['orderId'],
    state: r['state'],
    createdAt: r['createdAt'],
    contact,
    productVersionId: r['productVersionId'],
    zoneTo: r['zoneTo'],
  };
}

/* ────────────── the founder's SECOND key, on HIS device only ────────────── */

const CLE_C_STORAGE = 'boutik.livraisons.cle';

export function readStoredCleC(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(CLE_C_STORAGE);
    return v !== null && v !== '' ? v : null;
  } catch {
    return null;
  }
}

export function storeCleC(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CLE_C_STORAGE, key);
  } catch {
    // storage refused (private mode) — the session keeps the key in memory only.
  }
}

export function clearStoredCleC(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CLE_C_STORAGE);
  } catch {
    // nothing to clear
  }
}
