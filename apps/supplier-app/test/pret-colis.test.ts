import { describe, expect, it } from 'vitest';
import type { ChallengeResult, CommandeRow, ReadyResult } from '../src/fournisseur/service';
import { etapeOf, type CommandeVue } from '../src/fournisseur/view';
import { pretColis } from '../src/fournisseur/pret-colis';

/**
 * COLIS-FOURNISSEUR-1 — « Colis prêt » after the one photo is uploaded, by
 * value. The capture pipeline in front of it cannot be walked on the screen
 * harness (no image picker double), so this half is driven here through the
 * app's own port shape: every article still to make ready gets ITS OWN fresh
 * challenge and ITS OWN confirmation repeating ITS locked terms, all under the
 * SAME photo; a refusal stops with its own sentence; an article the book
 * already holds as ready is skipped, never a stop.
 */

const PHOTO = { assetId: 'asset-colis-1', role: 'readiness' } as never;

function article(orderId: string, pv: string, fulfillment: CommandeRow['fulfillment']): CommandeVue {
  const r: CommandeRow = {
    orderId, productName: `Produit ${orderId}`, productVersionId: pv, offerVersion: 'ov-1',
    paymentMode: 'FULL_PREPAY', paidAt: '2026-09-23T07:00:00.000Z', sellerBasePrice: 5_000,
    ...(fulfillment === undefined ? {} : { fulfillment }),
    colis: { packageId: 'pkg-1', orderIds: ['o1', 'o2', 'o3'] },
  };
  return { ...r, etape: etapeOf(r) };
}

const ACCEPTE = { acceptedAt: '2026-09-23T07:05:00.000Z' };

interface Appel { acte: 'challenge' | 'ready'; code: string; orderId: string; body?: Record<string, unknown> }

function port(opts: {
  challenge?: (orderId: string) => ChallengeResult;
  ready?: (orderId: string) => ReadyResult;
} = {}) {
  const appels: Appel[] = [];
  return {
    appels,
    service: {
      async challenge(code: string, orderId: string): Promise<ChallengeResult> {
        appels.push({ acte: 'challenge', code, orderId });
        return opts.challenge?.(orderId) ?? { ok: true, challenge: `defi-${orderId}`, expiresAt: '2026-09-23T07:20:00.000Z' };
      },
      async ready(code: string, body: Parameters<import('../src/fournisseur/service').FournisseurServicePort['ready']>[1]): Promise<ReadyResult> {
        appels.push({ acte: 'ready', code, orderId: body.orderId, body: body as unknown as Record<string, unknown> });
        return opts.ready?.(body.orderId) ?? { ok: true, status: 'ready', confirmedAt: '2026-09-23T07:10:00.000Z' };
      },
    },
  };
}

describe('COLIS-FOURNISSEUR-1 — one photo, one confirmation per article', () => {
  it('readies EVERY article still to prepare: its own challenge, its own terms, the same photo — then refreshes', async () => {
    const { service, appels } = port();
    const articles = [article('o1', 'pv-a', ACCEPTE), article('o2', 'pv-b', ACCEPTE)];
    const issue = await pretColis(service, 'CODE-F', 'pkg-1', articles, PHOTO);
    expect(issue.then).toBe('refresh');
    expect(appels.map((a) => `${a.acte}:${a.orderId}`)).toEqual(['challenge:o1', 'ready:o1', 'challenge:o2', 'ready:o2']);
    expect(appels.every((a) => a.code === 'CODE-F')).toBe(true);
    const readies = appels.filter((a) => a.acte === 'ready');
    // Each confirmation repeats ITS article's locked terms and ITS challenge.
    expect(readies[0]!.body).toMatchObject({ orderId: 'o1', variant: 'pv-a', readinessChallenge: 'defi-o1', qty: 1, availableConfirmed: true });
    expect(readies[1]!.body).toMatchObject({ orderId: 'o2', variant: 'pv-b', readinessChallenge: 'defi-o2', qty: 1, availableConfirmed: true });
    // One photo, the same evidence under both.
    expect(readies[0]!.body!['photoRef']).toBe(PHOTO);
    expect(readies[1]!.body!['photoRef']).toBe(PHOTO);
  });

  it('skips articles not waiting for the photo (already ready, still to accept, refused)', async () => {
    const { service, appels } = port();
    const articles = [
      article('o1', 'pv-a', { ...ACCEPTE, readyAt: '2026-09-23T07:08:00.000Z' }),
      article('o2', 'pv-b', ACCEPTE),
      article('o3', 'pv-c', { refusedAt: '2026-09-23T07:06:00.000Z' }),
    ];
    const issue = await pretColis(service, 'CODE-F', 'pkg-1', articles, PHOTO);
    expect(issue.then).toBe('refresh');
    expect(appels.map((a) => `${a.acte}:${a.orderId}`)).toEqual(['challenge:o2', 'ready:o2']);
  });

  it('the first refusal STOPS the bag with its own sentence, named on the colis', async () => {
    const { service, appels } = port({ ready: (o) => (o === 'o1' ? { ok: false, reason: 'locked_terms_mismatch' } : { ok: true, status: 'ready', confirmedAt: 'x' }) });
    const issue = await pretColis(service, 'CODE-F', 'pkg-1', [article('o1', 'pv-a', ACCEPTE), article('o2', 'pv-b', ACCEPTE)], PHOTO);
    expect(issue).toEqual({ ui: { etat: 'refus', orderId: 'pkg-1', messageKey: 'fournisseur.pret_termes' }, then: 'none' });
    expect(appels.map((a) => a.orderId)).toEqual(['o1', 'o1']);
  });

  it('a refused challenge stops too, with its own sentence; a dead code goes back to the door', async () => {
    const a = port({ challenge: () => ({ ok: false, reason: 'unreachable' }) });
    expect(await pretColis(a.service, 'C', 'pkg-1', [article('o1', 'pv-a', ACCEPTE), article('o2', 'pv-b', ACCEPTE)], PHOTO))
      .toEqual({ ui: { etat: 'refus', orderId: 'pkg-1', messageKey: 'fournisseur.pret_echec' }, then: 'none' });
    expect(a.appels).toHaveLength(1);
    const b = port({ challenge: () => ({ ok: false, reason: 'bad_code' }) });
    expect((await pretColis(b.service, 'C', 'pkg-1', [article('o1', 'pv-a', ACCEPTE), article('o2', 'pv-b', ACCEPTE)], PHOTO)).then).toBe('bad_code');
    expect(b.appels).toHaveLength(1);
  });

  it('AFTER A HALF-DONE SEND, the next tap finishes the bag: « already ready » is skipped, not a stop', async () => {
    // o1 was confirmed on the first try; the card still lists it as to prepare
    // because a failure never refreshes.
    const { service, appels } = port({ challenge: (o) => (o === 'o1' ? { ok: false, reason: 'already_ready' } : { ok: true, challenge: `defi-${o}`, expiresAt: 'x' }) });
    const issue = await pretColis(service, 'CODE-F', 'pkg-1', [article('o1', 'pv-a', ACCEPTE), article('o2', 'pv-b', ACCEPTE)], PHOTO);
    expect(issue.then).toBe('refresh');
    expect(appels.map((a) => `${a.acte}:${a.orderId}`)).toEqual(['challenge:o1', 'challenge:o2', 'ready:o2']);
  });
});
