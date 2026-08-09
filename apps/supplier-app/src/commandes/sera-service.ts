/**
 * RB-2 — the Commandes tab's port to the SÉRA logistics Worker: the founder
 * composes the delivery task (SE-LIVE-2c, his ruling: option 1 — HE supplies
 * the address; nothing is fabricated), reads the board, and confies a task to
 * a free rider. Séra's gate still governs his own hand: an unfunded or
 * unprepared order refuses 422 WITH ITS REASON, and this port carries that
 * reason to the screen instead of flattening it into « échec ».
 *
 * SAME KEY, SAME SLOT as the « Coursiers » zone (`boutik.coursiers.cle`):
 * `SERA_OPS_SECRET`, typed by the founder, never bundled. The base is the
 * public workers.dev URL already inlined for that zone.
 *
 * The wire shapes below MIRROR sera's own e2e
 * (`logistics-door.e2e.test.ts`, SE-LIVE-2c · `/ops/assign` handler) — the
 * contract-certification for this cross-repo port: same field names, same
 * refusal names, proven against the real Worker there.
 */

import { COURSIERS_TIMEOUT_MS, type CoursierAnswer } from '../coursiers/service';

export interface TacheEnFile {
  readonly taskId: string;
  readonly orderId: string;
  readonly admittedAt: string;
}

export interface CoursierLibre {
  readonly riderId: string;
  readonly displayName: string;
  readonly assignable: boolean;
  /** WHY a rider is not offered (SE1: certified + on-shift). The board has
   *  always sent both facts; the screen read only `assignable` and could say
   *  nothing but « aucun coursier libre » — the founder's dead end. */
  readonly certified: boolean;
  readonly enService: boolean;
}

/** One LIVE assignment off the board — who is carrying which order. Séra's
 *  own vocabulary (`assignments` on `/ops/board`, statuses
 *  active_unacknowledged | ack_pending_offline | acknowledged). */
export interface AffectationSera {
  readonly taskId: string;
  readonly orderId: string;
  readonly riderId: string;
  readonly status: string;
}

export interface BoardSera {
  readonly queued: readonly TacheEnFile[];
  readonly riders: readonly CoursierLibre[];
  readonly affectations: readonly AffectationSera[];
}

export interface AdresseTache {
  /** Canon v3.11.0 (founder ruling 2026-08-08): the pin is OPTIONAL — the
   *  rider navigates landmark-first, and an absence beats a fabricated
   *  coordinate. When given it must have parsed through `lirePin`. */
  readonly pin?: { readonly lat: number; readonly lng: number };
  readonly zone: string;
  readonly landmark: string;
  readonly directions: string;
  readonly maskedRelay: string;
}

/**
 * COURSE-BRIEF (founder order 2026-08-09) — what the rider is briefed with,
 * beside the address: the buyer's recorded repère and the supplier's readiness
 * proof. Media POINTERS only (`media/…`), never URLs; both optional, because
 * a buyer who typed their repère and a supplier whose proof predates the photo
 * step must still be dispatchable.
 */
export interface BriefTache {
  readonly repereAudioRef?: string;
  readonly preuvePhotoRefs?: readonly string[];
}

export interface SeraDispatchPort {
  board(cle: string): Promise<CoursierAnswer<BoardSera>>;
  composerTache(
    cle: string,
    orderId: string,
    adresse: AdresseTache,
    fenetre: { start: string; end: string },
    brief?: BriefTache,
  ): Promise<CoursierAnswer<{ taskId: string }>>;
  /**
   * RAMASSAGE (founder order 2026-08-09) — the supplier's half of the
   * two-party pickup: send what the RIDER SAID, receive a VERDICT and
   * nothing else. The Worker never answers the expected code.
   */
  verifierRamassage(cle: string, orderId: string, code: string): Promise<CoursierAnswer<{ verdict: 'confirme' | 'non_confirme' }>>;
  confier(cle: string, taskId: string, riderId: string): Promise<CoursierAnswer<null>>;
}

/**
 * « 12.3714, -1.5197 » → a pin, or null. The founder pastes this from a maps
 * app; a slip of the thumb must refuse HERE, before it could ever reach a
 * rider (the Worker re-checks the same bounds — belt and braces, his side).
 */
export function lirePin(saisie: string): { lat: number; lng: number } | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(saisie);
  if (m === null) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
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

export function httpSeraDispatch(
  base: string,
  fetchFn: FetchFn = globalThis.fetch,
  timeoutMs: number = COURSIERS_TIMEOUT_MS,
): SeraDispatchPort {
  const root = base.replace(/\/+$/, '');

  async function call<T>(
    cle: string,
    path: string,
    init: RequestInit,
    take: (b: unknown) => T,
  ): Promise<CoursierAnswer<T>> {
    const res = await within(
      fetchFn,
      `${root}${path}`,
      { ...init, headers: { Authorization: `Bearer ${cle}`, 'Content-Type': 'application/json' } },
      timeoutMs,
    );
    if (res === null) return { kind: 'unreachable' };
    if (res.status === 401 || res.status === 403) return { kind: 'bad_key' };
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return { kind: 'refused', reason: reasonOf(body) };
    return { kind: 'ok', value: take(body) };
  }

  return {
    async board(cle: string): Promise<CoursierAnswer<BoardSera>> {
      return call(cle, '/ops/board', { method: 'GET' }, (b) => {
        const board =
          b !== null && typeof b === 'object' ? ((b as Record<string, unknown>)['board'] ?? null) : null;
        const raw = board !== null && typeof board === 'object' ? (board as Record<string, unknown>) : {};
        const queued: TacheEnFile[] = [];
        if (Array.isArray(raw['queued'])) {
          for (const e of raw['queued']) {
            if (e === null || typeof e !== 'object') continue;
            const q = e as Record<string, unknown>;
            if (typeof q['taskId'] !== 'string' || typeof q['orderId'] !== 'string') continue;
            queued.push({
              taskId: q['taskId'],
              orderId: q['orderId'],
              admittedAt: typeof q['admittedAt'] === 'string' ? q['admittedAt'] : '',
            });
          }
        }
        const riders: CoursierLibre[] = [];
        if (Array.isArray(raw['riders'])) {
          for (const e of raw['riders']) {
            if (e === null || typeof e !== 'object') continue;
            const r = e as Record<string, unknown>;
            if (typeof r['riderId'] !== 'string' || r['riderId'] === '') continue;
            const shift = r['shift'];
            riders.push({
              riderId: r['riderId'],
              displayName:
                typeof r['displayName'] === 'string' && r['displayName'] !== ''
                  ? r['displayName']
                  : r['riderId'],
              // Absent is NOT assignable — an over-eager default here would
              // offer him a rider who is off shift or already carrying.
              assignable: r['assignable'] === true,
              certified: r['certified'] === true,
              enService:
                shift !== null && typeof shift === 'object' &&
                (shift as Record<string, unknown>)['status'] === 'on_shift',
            });
          }
        }
        const affectations: AffectationSera[] = [];
        if (Array.isArray(raw['assignments'])) {
          for (const e of raw['assignments']) {
            if (e === null || typeof e !== 'object') continue;
            const a = e as Record<string, unknown>;
            if (typeof a['taskId'] !== 'string' || a['taskId'] === '') continue;
            if (typeof a['orderId'] !== 'string' || a['orderId'] === '') continue;
            if (typeof a['riderId'] !== 'string' || a['riderId'] === '') continue;
            affectations.push({
              taskId: a['taskId'],
              orderId: a['orderId'],
              riderId: a['riderId'],
              status: typeof a['status'] === 'string' ? a['status'] : '',
            });
          }
        }
        return { queued, riders, affectations };
      });
    },

    async composerTache(
      cle: string,
      orderId: string,
      adresse: AdresseTache,
      fenetre: { start: string; end: string },
      brief: BriefTache = {},
    ): Promise<CoursierAnswer<{ taskId: string }>> {
      return call(
        cle,
        '/ops/task',
        {
          method: 'POST',
          body: JSON.stringify({
            // Deterministic per order: a double-tap replays his own compose
            // (the Worker absorbs it as duplicate) instead of a second task.
            command_id: `cmd-boutik-tache-${orderId}`,
            orderId,
            location: {
              // An absent pin stays absent on the wire — never {0,0}.
              ...(adresse.pin !== undefined ? { pin: { lat: adresse.pin.lat, lng: adresse.pin.lng } } : {}),
              zone: adresse.zone,
              landmark: adresse.landmark,
              directions: adresse.directions,
              maskedRelay: adresse.maskedRelay,
            },
            window: fenetre,
            // COURSE-BRIEF: absent stays ABSENT on the wire — never an empty
            // string standing in for a recording nobody made.
            ...(brief.repereAudioRef !== undefined ? { repereAudioRef: brief.repereAudioRef } : {}),
            ...(brief.preuvePhotoRefs !== undefined && brief.preuvePhotoRefs.length > 0
              ? { preuvePhotoRefs: brief.preuvePhotoRefs }
              : {}),
          }),
        },
        (b) => {
          const t = b !== null && typeof b === 'object' ? (b as Record<string, unknown>)['taskId'] : null;
          return { taskId: typeof t === 'string' ? t : '' };
        },
      );
    },

    async verifierRamassage(
      cle: string,
      orderId: string,
      code: string,
    ): Promise<CoursierAnswer<{ verdict: 'confirme' | 'non_confirme' }>> {
      return call(
        cle,
        '/ops/ramassage/verify',
        {
          method: 'POST',
          body: JSON.stringify({
            // Deterministic per (order, typed code) — the file's idiom, no
            // clock. Safe because the verify door DEDUPES NOTHING: every
            // attempt is judged fresh against the course that is active NOW.
            command_id: `cmd-boutik-ramassage-${orderId}-${code.toUpperCase().replace(/[^A-Z0-9]/g, '')}`,
            orderId,
            code,
          }),
        },
        (b) => {
          const v = b !== null && typeof b === 'object' ? (b as Record<string, unknown>)['verdict'] : null;
          return { verdict: v === 'confirme' ? ('confirme' as const) : ('non_confirme' as const) };
        },
      );
    },

    async confier(cle: string, taskId: string, riderId: string): Promise<CoursierAnswer<null>> {
      return call(
        cle,
        '/ops/assign',
        {
          method: 'POST',
          body: JSON.stringify({
            // Per (task, rider): his own retry replays; a different rider
            // after a refusal is a new command, as it should be.
            command_id: `cmd-boutik-confier-${taskId}-${riderId}`,
            taskId,
            riderId,
          }),
        },
        () => null,
      );
    },
  };
}

/** UNSET ⇒ nothing, never a demo board — the standing law. */
export function resolveSeraDispatch(): SeraDispatchPort | null {
  const base = process.env.EXPO_PUBLIC_SERA_LOGISTICS_BASE;
  const trimmed = typeof base === 'string' ? base.trim() : '';
  if (trimmed === '') return null;
  return httpSeraDispatch(trimmed);
}
