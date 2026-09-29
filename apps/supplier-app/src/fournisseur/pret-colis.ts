import type { MediaRefInput } from '../supply/assets';
import type { FournisseurServicePort } from './service';
import { pretIssue, type CommandeVue, type PretIssue } from './view';

/**
 * COLIS-FOURNISSEUR-1 — « Colis prêt », the part after the photo is uploaded:
 * ONE short-TTL challenge for the parcel (CODE-COLIS-1, founder ruling
 * 2026-09-29, canon 3.26.0: « one code per parcel »), then for every article
 * still to make ready the strict canon confirmation repeating THAT article's
 * locked terms, under that one challenge and the one photo. Kept apart from
 * the screen because the capture pipeline in front of it cannot be walked;
 * this half can be driven whole.
 *
 * An article the book already holds as ready is not a stop: after a send that
 * failed half-way, the card still lists the confirmed ones (it refreshes only
 * on success), and the next tap must finish the bag in one go. The challenge
 * is asked naming the first article still to prepare; one the book answers
 * `already_ready` for is passed over — named for no code and sent no « prêt » —
 * and the next is named. A ready article the card lists AFTER the named one
 * is sent its « prêt » and answers `already_ready`, which moves on too. Any
 * other refusal stops with its own sentence.
 */
export async function pretColis(
  service: Pick<FournisseurServicePort, 'challenge' | 'ready'>,
  code: string,
  packageId: string,
  articles: readonly CommandeVue[],
  photoRef: MediaRefInput,
  /** The photo on his card — kept through a refusal a retry can cure (F-22). */
  previewUri?: string,
): Promise<PretIssue> {
  let issue = pretIssue(packageId, { ok: false, reason: 'unreachable' }, previewUri);
  const aPreparer = articles.filter((x) => x.etape === 'a_preparer');
  let challenge: string | null = null;
  const dejaPrets = new Set<string>();
  for (const a of aPreparer) {
    const ch = await service.challenge(code, a.orderId);
    if (ch.ok) {
      challenge = ch.challenge;
      break;
    }
    issue = pretIssue(packageId, { ok: false, reason: ch.reason }, previewUri);
    if (ch.reason !== 'already_ready') return issue;
    dejaPrets.add(a.orderId);
  }
  // every article was already ready: the bag is done, and the card re-reads it
  if (challenge === null) return issue;
  for (const a of aPreparer) {
    if (dejaPrets.has(a.orderId)) continue;
    issue = pretIssue(
      packageId,
      await service.ready(code, {
        orderId: a.orderId,
        photoRef,
        readinessChallenge: challenge,
        qty: 1,
        variant: a.productVersionId,
        availableConfirmed: true,
        at: new Date().toISOString(),
      }),
      previewUri,
    );
    if (issue.then !== 'refresh') return issue;
  }
  return issue;
}
