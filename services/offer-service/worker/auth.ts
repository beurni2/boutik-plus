import {
  BEARER_HEADER,
  BEARER_PREFIX,
  isWrite,
  rejectUnauthorizedBearer,
  unauthorized,
} from '@boutik/service-auth';

/**
 * The Worker's credential adapters, bound to THIS service's secrets over the
 * one shared implementation in `@boutik/service-auth` (one constant-time
 * compare, one fail-closed rule, one identical 401).
 *
 * CLE-FONDATEUR-1 (AUDIT-B+2 F-01) retired the product WRITE key
 * (`OFFER_WRITE_SECRET`, sent as `X-Write-Key`), which was built into the
 * founder's console page. Those doors now read his typed operations key (`FULFILLMENT_OPS_SECRET`,
 * Bearer) at the composition root.
 */

/**
 * SUPPLY-READ-AUTH — the SERVICE-TO-SERVICE credential the supply read requires,
 * a wrangler SECRET on both Workers and never a `[vars]` entry. It never leaves
 * two Workers, and it must never be reused as any other credential: naming each
 * separately is what keeps them independently rotatable.
 */
export interface SupplyReadAuthEnv {
  readonly SUPPLY_READ_SECRET?: string;
}

export { BEARER_HEADER, BEARER_PREFIX, isWrite, unauthorized, rejectUnauthorizedBearer };

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
