import { rejectUnauthorizedWriteAgainst } from '@boutik/service-auth';

/**
 * MEDIA-UPLOAD-ROUTE-1 — media-service's binding of THE shared write gate
 * (`@boutik/service-auth`). Same implementation offer-service uses: fail-closed on
 * an unset secret, constant-time comparison, one identical 401 computed before any
 * storage touch.
 *
 * ITS OWN SECRET, deliberately: `MEDIA_WRITE_SECRET`, not offer-service's. The two
 * services are independently revocable — rotating one does not disturb the other,
 * and a leak of one does not open the other. Set with `wrangler secret put`, NEVER
 * `[vars]` (all five repos are public) and never the dashboard.
 *
 * UNTIL THE SECRET IS SET, EVERY UPLOAD IS 401 BY DESIGN. That is the fail-closed
 * rule working, not a broken deploy — a Worker deployed before its secret exists
 * is shut, not open.
 */

export interface MediaWriteAuthEnv {
  readonly MEDIA_WRITE_SECRET?: string;
  /**
   * MEDIA-KEY-SPLIT (verifier M1 follow-through, founder-ordered 2026-08-02):
   * `/media/revoke` is DESTRUCTIVE and answers to ITS OWN secret, never the
   * upload key. The upload key ships inside app bundles (a scanner-stopper,
   * not a credential) — before this split, anyone who read a bundle held a
   * delete client for the founder's product photographs. The revoke secret
   * rides ONLY the founder's own surface. Same header (`X-Write-Key`), same
   * constant-time primitive, different value per capability — and the same
   * fail-closed rule: unset ⇒ every revoke is 401, upload untouched.
   */
  readonly MEDIA_REVOKE_SECRET?: string;
}

/** WRITE gate for media-service. `null` iff authorised; else the one identical 401. */
export async function rejectUnauthorizedWrite(
  request: Request,
  env: MediaWriteAuthEnv,
): Promise<Response | null> {
  return rejectUnauthorizedWriteAgainst(request, env.MEDIA_WRITE_SECRET);
}

/** REVOKE gate — the founder-only secret. `null` iff authorised. The upload
 *  key answers the same identical 401 as no key at all: the compare is
 *  against MEDIA_REVOKE_SECRET alone, so holding the upload credential
 *  reveals nothing about the revoke one. */
export async function rejectUnauthorizedRevoke(
  request: Request,
  env: MediaWriteAuthEnv,
): Promise<Response | null> {
  return rejectUnauthorizedWriteAgainst(request, env.MEDIA_REVOKE_SECRET);
}
