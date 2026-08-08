/**
 * SE-LIVE-4e-B+ — the founder's client to the LIVE rider registry
 * (`logistics-service` in the SÉRA repo — one singleton LogisticsDO).
 *
 * ═══ WHY THIS LIVES IN THE BOUTIK+ CONSOLE ═══
 *
 * FOUNDER ORDER (2026-08-06, verbatim, and it was already on the record when I
 * got this wrong): « i do not want a separate url for that, put in boutik+'s
 * ops console ». I first built this desk in the Séra dispatch console — a
 * local-only Vite app he has never run — and justified it with the 2026-08-07
 * ruling « rider identity stays in logistics; custody asks ». **That ruling is
 * about where identity is STORED and who may mint, not about which screen the
 * founder opens.** He asked where it was, twice. This is the correction.
 *
 * The REGISTRY stays where it is: `logistics-service` remains the only place
 * that mints, revokes and resolves a rider code. This console is a **second
 * client of the same key-gated door** — exactly what the Fonds zone is to
 * `protection-service`. No authority moves here.
 *
 * ═══ THE KEY IS TYPED BY THE FOUNDER, NEVER BUNDLED ═══
 *
 * `SERA_OPS_SECRET` is his alone — the same law as the ops key, key C and the
 * fund key: NO `EXPO_PUBLIC_*` for it, ever. It opens the rider registry AND
 * the SOS board for every rider in the system. The resolver takes it as an
 * argument from the screen that asked for it; the only persistence is his own
 * browser's localStorage, his device, his choice, and it is CLEARED ON 401 like
 * every other key here. The BASE is config, not a credential:
 * `EXPO_PUBLIC_SERA_LOGISTICS_BASE` is a public workers.dev URL.
 *
 * UNSET RESOLVES TO NOTHING, NEVER TO DEMO — the standing law of this app's
 * outbound ports. There is no demo rider registry and no import of one: a
 * console showing invented riders would send him minting codes for people who
 * do not exist.
 *
 * RN-safe: no `@platform/*` runtime import (Metro law). Wire shapes are
 * mirrored locally; the SERVICE validates at its door, so what this port reads
 * is already refused-or-true.
 */

export const COURSIERS_TIMEOUT_MS = 12_000;

export interface CoursierRow {
  readonly riderId: string;
  readonly displayName: string;
  /**
   * True iff a live code exists. The plaintext is NEVER here — the server hands
   * it over exactly once, at the mint.
   *
   * ⚠ THIS IS A JOIN OF TWO ROUTES, NOT A FIELD. `GET /ops/riders` carries the
   * registry; `GET /ops/rider-codes` carries who holds a live code and since
   * when. I assumed a `hasCode` field on the first, read the Worker, and found
   * it absent — caught by the seam test in the Séra repo before any UI existed.
   */
  readonly hasCode: boolean;
  readonly mintedAt?: string | undefined;
  readonly certified: boolean;
  /** SE1: assignable = certified AND on-shift, server-confirmed. The roster
   *  carries both facts so the desk can say WHICH one is missing — the founder
   *  spent a day on « aucun coursier libre » with no reason on any screen. */
  readonly enService: boolean;
  readonly assignable: boolean;
}

export type CoursierAnswer<T> =
  | { readonly kind: 'ok'; readonly value: T }
  /** The key was refused. One door, one sentence — the zone escalates whole. */
  | { readonly kind: 'bad_key' }
  /** The server answered and said no BY NAME (`unknown_rider`,
   *  `already_registered`). A refusal is a fact, not a failure. */
  | { readonly kind: 'refused'; readonly reason: string }
  /** Nothing came back. Never confused with a refusal. */
  | { readonly kind: 'unreachable' };

export interface CoursiersServicePort {
  liste(): Promise<CoursierAnswer<readonly CoursierRow[]>>;
  inscrire(r: { riderId: string; displayName: string; phoneAlias: string }): Promise<CoursierAnswer<null>>;
  donnerCode(riderId: string): Promise<CoursierAnswer<string>>;
  retirerCode(riderId: string): Promise<CoursierAnswer<null>>;
  /** The founder's certification act (SE1) — the registry route existed from
   *  SE-LIVE-4b and NO CLIENT EVER CALLED IT, so every rider stayed
   *  uncertified and none could ever be assigned. */
  certifier(riderId: string): Promise<CoursierAnswer<null>>;
}

const CLE_COURSIERS_STORAGE = 'boutik.coursiers.cle';

export function readStoredCleCoursiers(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(CLE_COURSIERS_STORAGE);
    return v === null || v.trim() === '' ? null : v;
  } catch {
    return null;
  }
}

export function storeCleCoursiers(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(CLE_COURSIERS_STORAGE, key);
  } catch {
    // A browser that refuses storage is not a reason to refuse the session.
  }
}

export function clearStoredCleCoursiers(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(CLE_COURSIERS_STORAGE);
  } catch {
    // Nothing to clear.
  }
}

type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

async function within(fetchFn: FetchFn, url: string, init: RequestInit, ms: number): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function reasonOf(body: unknown): string {
  if (body === null || typeof body !== 'object') return 'unknown';
  const r = (body as Record<string, unknown>)['reason'];
  return typeof r === 'string' && r !== '' ? r : 'unknown';
}

/** Defensive: this crosses the network into the only rider surface there is,
 *  and a malformed row must not blank the desk or invent a ghost. */
export function coursierRows(ridersBody: unknown, codesBody: unknown): readonly CoursierRow[] {
  const minted = new Map<string, string>();
  if (codesBody !== null && typeof codesBody === 'object') {
    const raw = (codesBody as Record<string, unknown>)['codes'];
    if (Array.isArray(raw)) {
      for (const e of raw) {
        if (e === null || typeof e !== 'object') continue;
        const c = e as Record<string, unknown>;
        if (typeof c['riderId'] === 'string' && c['riderId'] !== '') {
          minted.set(c['riderId'], typeof c['mintedAt'] === 'string' ? c['mintedAt'] : '');
        }
      }
    }
  }
  if (ridersBody === null || typeof ridersBody !== 'object') return [];
  const raw = (ridersBody as Record<string, unknown>)['riders'];
  if (!Array.isArray(raw)) return [];
  const out: CoursierRow[] = [];
  for (const e of raw) {
    if (e === null || typeof e !== 'object') continue;
    const r = e as Record<string, unknown>;
    const riderId = typeof r['riderId'] === 'string' ? r['riderId'] : '';
    if (riderId === '') continue;
    const at = minted.get(riderId);
    const shift = r['shift'];
    out.push({
      riderId,
      displayName: typeof r['displayName'] === 'string' && r['displayName'] !== '' ? r['displayName'] : riderId,
      // Absent from the codes projection is FALSE, never « probably yes » —
      // the « a new code kills the old one » warning depends on this.
      hasCode: at !== undefined,
      ...(at !== undefined && at !== '' ? { mintedAt: at } : {}),
      certified: r['certified'] === true,
      // Same conservatism as `assignable` on the dispatch board: absent or
      // unrecognised is FALSE — a desk must never claim service it cannot see.
      enService:
        shift !== null && typeof shift === 'object' &&
        (shift as Record<string, unknown>)['status'] === 'on_shift',
      assignable: r['assignable'] === true,
    });
  }
  return out;
}

export function httpCoursiersService(
  base: string,
  cle: string,
  fetchFn: FetchFn = globalThis.fetch,
  timeoutMs: number = COURSIERS_TIMEOUT_MS,
): CoursiersServicePort {
  const root = base.replace(/\/+$/, '');

  async function call<T>(path: string, init: RequestInit, take: (b: unknown) => T): Promise<CoursierAnswer<T>> {
    const res = await within(
      fetchFn,
      `${root}${path}`,
      {
        ...init,
        // The key rides the Authorization header and NOWHERE else — never a
        // query string, which lands in logs and browser history.
        headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' },
      },
      timeoutMs,
    );
    if (res === null) return { kind: 'unreachable' };
    if (res.status === 401 || res.status === 403) return { kind: 'bad_key' };
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { kind: 'refused', reason: reasonOf(body) };
    return { kind: 'ok', value: take(body) };
  }

  return {
    /** Two reads, joined. A failure of EITHER is a failed desk — a roster with
     *  every code silently marked absent would tell him minting is safe when it
     *  destroys a working rider's code. */
    async liste(): Promise<CoursierAnswer<readonly CoursierRow[]>> {
      const roster = await call('/ops/riders', { method: 'GET' }, (b) => b);
      if (roster.kind !== 'ok') return roster;
      const codes = await call('/ops/rider-codes', { method: 'GET' }, (b) => b);
      if (codes.kind !== 'ok') return codes;
      return { kind: 'ok', value: coursierRows(roster.value, codes.value) };
    },
    inscrire: (r) => call('/ops/riders', { method: 'POST', body: JSON.stringify(r) }, () => null),
    donnerCode: (riderId) =>
      call('/ops/rider-code/mint', { method: 'POST', body: JSON.stringify({ riderId }) }, (b) => {
        const code = b !== null && typeof b === 'object' ? (b as Record<string, unknown>)['code'] : null;
        // A 200 that names no code is not a minted code. '' would put an empty
        // card on screen and lose the real one.
        return typeof code === 'string' ? code : '';
      }),
    retirerCode: (riderId) =>
      call('/ops/rider-code/revoke', { method: 'POST', body: JSON.stringify({ riderId }) }, () => null),
    certifier: (riderId) =>
      call('/ops/riders/certify', { method: 'POST', body: JSON.stringify({ riderId, certified: true }) }, () => null),
  };
}

/** UNSET ⇒ nothing, never a demo registry. */
export function resolveCoursiersService(cle: string): CoursiersServicePort | null {
  const base = process.env.EXPO_PUBLIC_SERA_LOGISTICS_BASE;
  const trimmed = typeof base === 'string' ? base.trim() : '';
  if (trimmed === '' || cle.trim() === '') return null;
  return httpCoursiersService(trimmed, cle.trim());
}
