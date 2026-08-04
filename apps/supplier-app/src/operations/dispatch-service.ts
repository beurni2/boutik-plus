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

/* ─────────── SP6.3 — recording ONE doorstep refusal (§6.4), key C ─────────── */

/**
 * §6.4's classification vocabulary, in the order the founder should meet it.
 *
 * ORDINARY FIRST, GRAVE LAST, and that ordering is a design decision rather
 * than a list: the everyday reasons a delivery fails in Ouagadougou — she was
 * out, the address could not be found, she did not have the money that day —
 * sit at the top where a tired operator taps without thinking. « Abus répété »
 * and « Fraude » are the two that end her access to the door, so they sit apart
 * at the bottom where nobody reaches them by accident.
 *
 * `conformity_mismatch` IS ON THIS LIST and must stay on it. When the article
 * was wrong, that is OUR failure and the ladder must record it as such —
 * §6.4 never counts it against her (asserted in `commerce-core`). Leaving it
 * off would push an honest operator to pick « elle a changé d'avis » for a
 * refusal she was entitled to, which is exactly how a buyer ends up punished
 * for our mistake.
 */
export type MotifRefus =
  | 'honest_absence'
  | 'unusable_location'
  | 'insufficient_balance'
  | 'change_of_mind'
  | 'conformity_mismatch'
  | 'repeated_abuse'
  | 'fraud';

/** The two that END her access to the door. Declared apart because the screen
 *  places them apart, and because « last » must not be a coincidence of how
 *  someone happened to type the list. */
export const MOTIFS_GRAVES: readonly MotifRefus[] = ['repeated_abuse', 'fraud'];

/** The everyday ones, in the order a tired thumb should meet them. */
export const MOTIFS_ORDINAIRES: readonly MotifRefus[] = [
  'honest_absence',
  'unusable_location',
  'insufficient_balance',
  'change_of_mind',
  'conformity_mismatch',
];

/** ORDINARY, then GRAVE — composed, so the two blocks cannot interleave. */
export const MOTIFS_REFUS: readonly MotifRefus[] = [...MOTIFS_ORDINAIRES, ...MOTIFS_GRAVES];

/** Where the screen opens its gap. Derived, so it can never point at the
 *  wrong row after someone reorders the list. */
export const PREMIER_GRAVE: MotifRefus = MOTIFS_GRAVES[0]!;

/** The catalog key for one reason — strings never inline (Ten Laws #6). */
export function libelleMotif(motif: MotifRefus): string {
  return `refus.${motif}`;
}

export type RefusResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' | 'sans_contact' };

/**
 * Record one refusal against the buyer of ONE ORDER.
 *
 * THE BUYER IS NOT A PARAMETER, and that is the point: the Shop+ route reads
 * her number off the order itself, server-side. This client cannot name her
 * even if it wanted to — a console typo can pick the wrong ORDER (visible on
 * screen, and correctable) but can never reach a stranger's history.
 */
export interface RefusServicePort {
  signalerRefus(cleC: string, orderId: string, motif: MotifRefus): Promise<RefusResult>;
}

export function resolveRefusService(): RefusServicePort | null {
  const base = process.env.EXPO_PUBLIC_SHOP_CHECKOUT_BASE;
  if (base === undefined || base === '') return null;
  const trimmed = base.replace(/\/+$/, '');
  return {
    async signalerRefus(cleC: string, orderId: string, motif: MotifRefus): Promise<RefusResult> {
      // The same bound the dispatch read carries, for the same reason: a write
      // that never answers leaves the screen claiming « un instant » forever.
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), DISPATCH_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(`${trimmed}/checkout/dispatch/${encodeURIComponent(orderId)}/refusal`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${cleC}`,
          },
          // EXACTLY ONE FIELD. The route's allowlist refuses anything else BY
          // NAME — including a `phone`, which is the whole point of its shape.
          body: JSON.stringify({ reason: motif }),
          signal: ctl.signal,
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      // 422 IS THE ROUTE'S « THIS ORDER HAS NO USABLE NUMBER » — both of its
      // reasons (`no_contact_on_order`, `phone_not_keyable`) mean the same
      // thing to a console: there is nobody to key a ladder to, retrying will
      // not change that, and saying « your network » about it would be false.
      if (res.status === 422) return { ok: false, reason: 'sans_contact' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      return { ok: true };
    },
  };
}

/* ───── ACCESS-GATE-1 — reseller ACCESS codes, on the Shop+ Worker, key C ───── */

/**
 * FOUNDER ORDER, 2026-08-04: « a new reseller will [have] a code access that i
 * will mint on the console and give so it can have access to the app ».
 *
 * ═══ WHY THIS LIVES BESIDE THE DISPATCH CLIENT AND NOT BESIDE THE OTHER CODES ═══
 *
 * The console already mints SUPPLIER codes (CONSOLE-3) — but those are Boutik+
 * codes, on the OFFER service, behind the fulfilment key (value B). A reseller
 * access code is a SHOP+ credential on the storefront Worker behind key C, the
 * same door the Livraisons section opens. Two different Workers, two different
 * capabilities, two different keys: the client for each lives with its key, and
 * that separation is why one leaked key never opens both.
 *
 * ═══ THE PLAINTEXT EXISTS EXACTLY ONCE ═══
 *
 * The Worker stores only the SHA-256. `mintAcces` is the one moment the code is
 * readable by anyone, including him — which is why the screen holds it until he
 * dismisses it, and why re-minting is also the revocation story: one active
 * code per reseller, replaced atomically.
 */

export interface AccesCodeRow {
  readonly resellerId: string;
  readonly mintedAt: string;
}

export type AccesListResult =
  | { readonly ok: true; readonly codes: readonly AccesCodeRow[] }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

export type AccesMintResult =
  | { readonly ok: true; readonly resellerId: string; readonly code: string }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

export type AccesRevokeResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' | 'no_code' };

export interface AccesServicePort {
  listAcces(cleC: string): Promise<AccesListResult>;
  mintAcces(cleC: string, resellerId: string): Promise<AccesMintResult>;
  revokeAcces(cleC: string, resellerId: string): Promise<AccesRevokeResult>;
}

/** Mirrors the DO's row projection; anything malformed is DROPPED rather than
 *  rendered half-formed — a row whose id we cannot read is a row he cannot act
 *  on, and showing it would offer him a « couper » that does nothing. */
function readAccesRow(raw: unknown): AccesCodeRow | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const resellerId = r['resellerId'];
  const mintedAt = r['mintedAt'];
  if (typeof resellerId !== 'string' || resellerId === '') return null;
  if (typeof mintedAt !== 'string' || mintedAt === '') return null;
  return { resellerId, mintedAt };
}

export function resolveAccesService(): AccesServicePort | null {
  const base = process.env.EXPO_PUBLIC_SHOP_CHECKOUT_BASE;
  if (base === undefined || base === '') return null;
  const trimmed = base.replace(/\/+$/, '');

  async function appel(
    chemin: string,
    cleC: string,
    init: RequestInit = {},
  ): Promise<{ status: number; body: unknown } | null> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), DISPATCH_TIMEOUT_MS);
    try {
      const res = await fetch(`${trimmed}${chemin}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
          Authorization: `Bearer ${cleC}`,
        },
        signal: ctl.signal,
      });
      return { status: res.status, body: await res.json().catch(() => null) };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async listAcces(cleC: string): Promise<AccesListResult> {
      const res = await appel('/reseller/codes', cleC);
      if (res === null) return { ok: false, reason: 'unreachable' };
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      const body = res.body as { ok?: boolean; codes?: unknown } | null;
      if (body?.ok !== true || !Array.isArray(body.codes)) return { ok: false, reason: 'unreachable' };
      const codes: AccesCodeRow[] = [];
      for (const row of body.codes) {
        const parsed = readAccesRow(row);
        if (parsed !== null) codes.push(parsed);
      }
      return { ok: true, codes };
    },

    async mintAcces(cleC: string, resellerId: string): Promise<AccesMintResult> {
      // EXACTLY ONE FIELD — the DO refuses any body with a second key, which is
      // how a client that thinks it may set `code` or `mintedAt` learns it may not.
      const res = await appel('/reseller/code', cleC, {
        method: 'POST',
        body: JSON.stringify({ resellerId }),
      });
      if (res === null) return { ok: false, reason: 'unreachable' };
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      const body = res.body as { ok?: boolean; code?: unknown; resellerId?: unknown } | null;
      if (body?.ok !== true || typeof body.code !== 'string' || typeof body.resellerId !== 'string') {
        return { ok: false, reason: 'unreachable' };
      }
      return { ok: true, resellerId: body.resellerId, code: body.code };
    },

    async revokeAcces(cleC: string, resellerId: string): Promise<AccesRevokeResult> {
      const res = await appel('/reseller/code/revoke', cleC, {
        method: 'POST',
        body: JSON.stringify({ resellerId }),
      });
      if (res === null) return { ok: false, reason: 'unreachable' };
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      const body = res.body as { ok?: boolean; reason?: unknown } | null;
      if (body?.ok === true) return { ok: true };
      // « she had no code » is an HONEST answer, not a failure: the list said
      // she did, the book says she does not, and the row must leave the screen.
      if (body?.reason === 'no_code') return { ok: false, reason: 'no_code' };
      return { ok: false, reason: 'unreachable' };
    },
  };
}
