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
   * THIS IS A JOIN OF TWO ROUTES, NOT A FIELD. `GET /ops/riders` carries the
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
  /** CODE-REVU (2026-08-09): « Voir le code » can answer — false for codes
   *  minted before the plaintext was kept. Absent reads FALSE. */
  readonly revelable: boolean;
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

/**
 * PURGE-ESSAI-COURSES (founder, 2026-08-10) — ONE COURSE ON SÉRA'S BOARD, as
 * this console needs to name it. Deliberately thin: what he must see to
 * decide is WHICH order, and whether a rider is already carrying it.
 *
 * WHY THIS DESK AND NOT SÉRA'S OWN. The retire was built into the Séra
 * dispatch console first — and that console has NO deploy workflow: it is
 * built and browser-tested in CI and published nowhere, so the button had no
 * screen to appear on. He chose this desk, which already holds
 * `SERA_OPS_SECRET` and is deployed. Same door, same key, no authority moves:
 * `logistics-service` remains the only book that owns a course.
 */
export interface CourseRow {
  readonly orderId: string;
  readonly taskId: string;
  /** Named when a rider is CARRYING it — absent when it is merely queued. The
   *  distinction is the whole safety of the decision below. */
  readonly coursier?: string | undefined;
  /** True when an assignment is live: retiring one of these takes the course
   *  off a rider's phone, so the screen must say so before he taps. */
  readonly confiee: boolean;
}

export interface CoursiersServicePort {
  liste(): Promise<CoursierAnswer<readonly CoursierRow[]>>;
  /** PURGE-ESSAI-COURSES — the board, as the founder's own `/ops/board`
   *  read gives it. Queued tasks and live assignments, nothing else. */
  courses(): Promise<CoursierAnswer<readonly CourseRow[]>>;
  /** PURGE-ESSAI-COURSES — retire ONE course. One order per call: the Worker
   *  has no « tout retirer » and must never grow one. */
  retirerCourse(orderId: string, commandId: string): Promise<CoursierAnswer<null>>;
  inscrire(r: { riderId: string; displayName: string; phoneAlias: string }): Promise<CoursierAnswer<null>>;
  donnerCode(riderId: string): Promise<CoursierAnswer<string>>;
  retirerCode(riderId: string): Promise<CoursierAnswer<null>>;
  /** The founder's certification act (SE1) — the registry route existed from
   *  SE-LIVE-4b and NO CLIENT EVER CALLED IT, so every rider stayed
   *  uncertified and none could ever be assigned. */
  certifier(riderId: string): Promise<CoursierAnswer<null>>;
  /** CODE-REVU — reread a code already given. `refused` carries the book's
   *  name: `code_anterieur` for a pre-ruling code. */
  voirCode(riderId: string): Promise<CoursierAnswer<string>>;
  /**
   * RETIRER-COURSIER (founder, 2026-08-12) — take the rider OFF THE ROSTER.
   *
   * The second destructive act on this desk, and the harder one: `retirerCode`
   * locks a rider out and keeps the row, this erases the row. The rider's code
   * dies with it server-side — a one-time code authenticates by hash, so one
   * that outlived its owner would keep working for nobody.
   *
   ⚠ * IT CAN BE REFUSED, and the refusal is the point. A rider CARRYING a
   * parcel answers `rider_carrying` (Law 3, « one current custodian ») — the
   * desk must say so rather than retry, because the fix is his: end the course
   * or hand the custody over first.
   */
  retirerCoursier(riderId: string): Promise<CoursierAnswer<null>>;
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
  const minted = new Map<string, { mintedAt: string; revelable: boolean }>();
  if (codesBody !== null && typeof codesBody === 'object') {
    const raw = (codesBody as Record<string, unknown>)['codes'];
    if (Array.isArray(raw)) {
      for (const e of raw) {
        if (e === null || typeof e !== 'object') continue;
        const c = e as Record<string, unknown>;
        if (typeof c['riderId'] === 'string' && c['riderId'] !== '') {
          minted.set(c['riderId'], {
            mintedAt: typeof c['mintedAt'] === 'string' ? c['mintedAt'] : '',
            revelable: c['revelable'] === true,
          });
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
      ...(at !== undefined && at.mintedAt !== '' ? { mintedAt: at.mintedAt } : {}),
      revelable: at?.revelable === true,
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

/**
 * PURGE-ESSAI-COURSES — the board, read defensively. A course appears ONCE:
 * a live assignment wins over the queued row for the same order, because
 * « confiée à Boss » is the fact that changes what retiring it costs. A row
 * that cannot name its order is dropped rather than shown nameless — this
 * desk offers a destructive act, and it must never offer one on a row it
 * cannot identify.
 */
export function courseRows(boardBody: unknown): readonly CourseRow[] {
  const board =
    boardBody !== null && typeof boardBody === 'object'
      ? ((boardBody as Record<string, unknown>)['board'] as Record<string, unknown> | undefined)
      : undefined;
  if (board === undefined) return [];
  const par = new Map<string, CourseRow>();
  const queued = board['queued'];
  if (Array.isArray(queued)) {
    for (const e of queued) {
      if (e === null || typeof e !== 'object') continue;
      const q = e as Record<string, unknown>;
      const orderId = typeof q['orderId'] === 'string' ? q['orderId'] : '';
      const taskId = typeof q['taskId'] === 'string' ? q['taskId'] : '';
      if (orderId === '') continue;
      par.set(orderId, { orderId, taskId, confiee: false });
    }
  }
  const assignments = board['assignments'];
  if (Array.isArray(assignments)) {
    for (const e of assignments) {
      if (e === null || typeof e !== 'object') continue;
      const a = e as Record<string, unknown>;
      const orderId = typeof a['orderId'] === 'string' ? a['orderId'] : '';
      if (orderId === '') continue;
      const rider = typeof a['riderId'] === 'string' && a['riderId'] !== '' ? a['riderId'] : undefined;
      par.set(orderId, {
        orderId,
        taskId: typeof a['taskId'] === 'string' ? a['taskId'] : (par.get(orderId)?.taskId ?? ''),
        ...(rider !== undefined ? { coursier: rider } : {}),
        confiee: true,
      });
    }
  }
  return [...par.values()].sort((x, y) => (x.orderId < y.orderId ? -1 : 1));
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
    async courses(): Promise<CoursierAnswer<readonly CourseRow[]>> {
      const board = await call('/ops/board', { method: 'GET' }, (b) => b);
      if (board.kind !== 'ok') return board;
      return { kind: 'ok', value: courseRows(board.value) };
    },
    retirerCourse: (orderId, commandId) =>
      call(
        '/ops/order/retirer',
        // ONLY the id and the command — the same envelope discipline every
        // act on this desk follows.
        { method: 'POST', body: JSON.stringify({ command_id: commandId, orderId }) },
        () => null,
      ),
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
    voirCode: (riderId) =>
      call('/ops/rider-code/reveal', { method: 'POST', body: JSON.stringify({ riderId }) }, (b) => {
        const code = b !== null && typeof b === 'object' ? (b as Record<string, unknown>)['code'] : null;
        return typeof code === 'string' ? code : '';
      }),
    retirerCoursier: (riderId) =>
      call('/ops/riders/remove', { method: 'POST', body: JSON.stringify({ riderId }) }, () => null),
  };
}

/** UNSET ⇒ nothing, never a demo registry. */
export function resolveCoursiersService(cle: string): CoursiersServicePort | null {
  const base = process.env.EXPO_PUBLIC_SERA_LOGISTICS_BASE;
  const trimmed = typeof base === 'string' ? base.trim() : '';
  if (trimmed === '' || cle.trim() === '') return null;
  return httpCoursiersService(trimmed, cle.trim());
}
