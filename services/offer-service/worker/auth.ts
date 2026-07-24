import {
  BEARER_HEADER,
  BEARER_PREFIX,
  WRITE_KEY_HEADER,
  isWrite,
  keyAuthorizedAgainst,
  rejectUnauthorizedBearer,
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

/**
 * SUPPLY-READ-AUTH — the SERVICE-TO-SERVICE credential the supply read requires,
 * a wrangler SECRET on both Workers and never a `[vars]` entry.
 *
 * A DIFFERENT KIND OF THING FROM `OFFER_WRITE_SECRET`, and the two must never be
 * reused as one another: the write key ships inside the supplier app's bundle
 * (readable by anyone who downloads it — it stops scanners, not attackers); this
 * one never leaves two Workers, so it is a real credential. Naming them
 * separately is what keeps them independently rotatable.
 */
export interface SupplyReadAuthEnv {
  readonly SUPPLY_READ_SECRET?: string;
}

export { WRITE_KEY_HEADER, BEARER_HEADER, BEARER_PREFIX, isWrite, unauthorized };

/** Fail-closed shared-key check against offer-service's secret. */
export async function keyAuthorized(request: Request, env: WriteAuthEnv): Promise<boolean> {
  return keyAuthorizedAgainst(request, env.OFFER_WRITE_SECRET);
}

/** WRITE gate for offer-service. `null` iff authorised; else the one identical 401. */
export async function rejectUnauthorizedWrite(request: Request, env: WriteAuthEnv): Promise<Response | null> {
  return rejectUnauthorizedWriteAgainst(request, env.OFFER_WRITE_SECRET);
}

/**
 * SUPPLY READ gate for offer-service. `null` iff authorised; else the one
 * identical 401 — which the composition root returns BEFORE resolving the store,
 * so it can never become an existence oracle for product version ids.
 *
 * FAIL CLOSED: a Worker deployed before `SUPPLY_READ_SECRET` is set refuses every
 * supply read. **That is the correct failure and it is a LOUD one on this wire:**
 * shop-plus treats any non-2xx as `undefined` → the product is simply omitted from
 * the vitrine, silently. So an unset or mismatched secret does not error anywhere —
 * it empties the shop. The post-deploy live probe is what catches that, not CI.
 */
export async function rejectUnauthorizedSupplyRead(
  request: Request,
  env: SupplyReadAuthEnv,
): Promise<Response | null> {
  return rejectUnauthorizedBearer(request, env.SUPPLY_READ_SECRET);
}
