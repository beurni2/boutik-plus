import type { MediaRefInput } from '../supply/assets';
import type { FournisseurServicePort } from './service';
import { pretIssue, type CommandeVue, type PretIssue } from './view';

/**
 * COLIS-FOURNISSEUR-1 — « Colis prêt », the part after the photo is uploaded:
 * for every article still to make ready, a fresh short-TTL challenge and the
 * strict canon confirmation repeating THAT article's locked terms, with the
 * one photo as evidence. Kept apart from the screen because the capture
 * pipeline in front of it cannot be walked; this half can be driven whole.
 *
 * An article the book already holds as ready is skipped, not a stop: after a
 * send that failed half-way, the card still lists the confirmed ones (it
 * refreshes only on success), and the next tap must finish the bag in one go.
 * Any other refusal stops the loop with its own sentence.
 */
export async function pretColis(
  service: Pick<FournisseurServicePort, 'challenge' | 'ready'>,
  code: string,
  packageId: string,
  articles: readonly CommandeVue[],
  photoRef: MediaRefInput,
): Promise<PretIssue> {
  let issue = pretIssue(packageId, { ok: false, reason: 'unreachable' });
  for (const a of articles.filter((x) => x.etape === 'a_preparer')) {
    const ch = await service.challenge(code, a.orderId);
    if (!ch.ok) {
      issue = pretIssue(packageId, { ok: false, reason: ch.reason });
      if (ch.reason === 'already_ready') continue;
      return issue;
    }
    issue = pretIssue(
      packageId,
      await service.ready(code, {
        orderId: a.orderId,
        photoRef,
        readinessChallenge: ch.challenge,
        qty: 1,
        variant: a.productVersionId,
        availableConfirmed: true,
        at: new Date().toISOString(),
      }),
    );
    if (issue.then !== 'refresh') return issue;
  }
  return issue;
}
