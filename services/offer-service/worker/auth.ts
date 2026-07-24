import {
  WRITE_KEY_HEADER,
  isWrite,
  keyAuthorizedAgainst,
  rejectUnauthorizedWriteAgainst,
  unauthorized,
} from '@boutik/service-auth';

/**
 * SERVICE-WRITE-AUTH — offer-service's binding of THE shared write gate.
 *
 * The implementation moved to `@boutik/service-auth` (MEDIA-UPLOAD-ROUTE-1,
 * founder ruling: reuse the module rather than write a second one). This file is
 * now a THIN ADAPTER that binds it to THIS service's own secret,
 * `OFFER_WRITE_SECRET` — so the two services stay independently revocable (one
 * leaked secret does not open the other) while the constant-time comparison, the
 * fail-closed rule and the single identical 401 exist exactly once.
 *
 * The exported surface is UNCHANGED, deliberately: `worker/index.ts` and the
 * combined-Worker e2e import the same names with the same signatures, so this
 * extraction is a no-op at every call site — which is what makes it safe to do to
 * a live, deployed gate.
 *
 * THE FINDING it closes (unchanged): the one write endpoint on the live Worker
 * (POST /offers) would otherwise be reachable with NO credential. The gate sits at
 * the ONE deployed entry BEFORE any dispatch, so a rejected write never reaches a
 * Durable Object or an existence lookup.
 */

/** The env the gate reads its configured secret from — a wrangler SECRET, NEVER a
 * `[vars]` entry (all five repos are public; a var there would be published). */
export interface WriteAuthEnv {
  readonly OFFER_WRITE_SECRET?: string;
}

export { WRITE_KEY_HEADER, isWrite, unauthorized };

/** Fail-closed shared-key check against offer-service's secret. */
export async function keyAuthorized(request: Request, env: WriteAuthEnv): Promise<boolean> {
  return keyAuthorizedAgainst(request, env.OFFER_WRITE_SECRET);
}

/** WRITE gate for offer-service. `null` iff authorised; else the one identical 401. */
export async function rejectUnauthorizedWrite(request: Request, env: WriteAuthEnv): Promise<Response | null> {
  return rejectUnauthorizedWriteAgainst(request, env.OFFER_WRITE_SECRET);
}
