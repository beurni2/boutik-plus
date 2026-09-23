import { PackageGroupingRequestSchema, type PackageGroupingAnswer } from '@platform/contracts';
import type { OfferStore } from './offer-store.js';

/**
 * ═══ COLIS-FOURNISSEUR-1 — WHICH ARTICLES LEAVE TOGETHER ═══
 *
 * Founder ruling 2026-09-23 (« build option 1 », canon 3.20.0): one package
 * and one delivery fee per supplier inside a grouped payment. Shop+ asks this
 * door, for ONE panier, which of its products leave from the same supplier —
 * so the buyer can read « 1 livraison » BEFORE she pays.
 *
 * ═══ THE PRIVACY RULE, KEPT ═══ Supplier identity never crosses to Shop+
 * (the confirmed-order wire's own rule). The answer is groups of the ASKED
 * product ids and nothing else: no supplier id, no name, no count of anything
 * outside the question. The pv → supplier join happens HERE, on the same
 * internal entry the confirmed-order intake reads, and its result stays home.
 * A product this store does not know is a group of its own — it simply
 * travels alone, never a guess.
 *
 * Behind SUPPLY_READ_SECRET, the credential Shop+ already holds for the
 * supply reads (gated at the router, before any store is touched).
 */
export async function handleSupplyGrouping(request: Request, store: OfferStore): Promise<Response> {
  const parsed = PackageGroupingRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
  const ids = parsed.data.productVersionIds;
  const fournisseurs = await Promise.all(ids.map(async (pv) => (await store.getEntryByProductVersion(pv))?.product.supplierId ?? ''));
  const groupes = new Map<string, string[]>();
  const seuls: string[][] = [];
  ids.forEach((pv, i) => {
    const f = fournisseurs[i] ?? '';
    if (f === '') {
      seuls.push([pv]);
      return;
    }
    const g = groupes.get(f);
    if (g === undefined) groupes.set(f, [pv]);
    else g.push(pv);
  });
  // In the order the panier asked, the unknown ones after: the answer's shape
  // carries nothing but the grouping itself.
  const answer: PackageGroupingAnswer = { groups: [...groupes.values(), ...seuls] };
  return Response.json(answer);
}
