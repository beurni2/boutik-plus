import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FulfillmentDO } from '../worker/fulfillment-do.js';
import { StockageCompteur } from './doubles/stockage-compteur.js';

/**
 * A FAULT THE PLATFORM HANDS BACK GIVES ONE LINE, AND CHANGES NOTHING ELSE.
 *
 * Two faults cannot be provoked on real workerd: a refused alarm re-arm and a
 * refused outbox write. So these drive the REAL `FulfillmentDO` over the
 * counting storage double (its bounds are at its top), with ONE method made to
 * reject — no app code is stubbed. Each case asserts:
 *   · the one line, key by key, at its level — and never the error's message;
 *   · the supplier's answer and the order's stored rows, against the same accept
 *     with nothing failing.
 *
 * One case per kind of site. The other sites go through the same helper:
 *   · a refused re-arm — the Séra readiness re-arm and arm, the Shop+ progress
 *     re-arm of a stranded row, the alarm's own re-arm at the end of a drain,
 *     the door refusal that gives a unit back, and the return check's re-arm;
 *   · a refused outbox write — the Séra readiness write, which has its own
 *     case below as well, driven through « prêt ».
 * The last test pins that list to the source.
 */

const ORDER = 'ord-quote-5e471e11-0000-4000-8000-00000000b9f1';
const SUPPLIER = 'supplier-journal-fautes';
const T = Date.parse('2026-11-28T08:00:00.000Z');
// What the platform's error says must never reach a line.
const MESSAGE = 'sentinelle-message-de-la-plateforme';

class AlarmeRefusee extends StockageCompteur {
  override async setAlarm(): Promise<void> {
    throw new Error(MESSAGE);
  }
}

class FileRefusee extends StockageCompteur {
  override async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    const cles = typeof keyOrEntries === 'string' ? [keyOrEntries] : Object.keys(keyOrEntries);
    if (cles.some((k) => k.startsWith('progressoutbox:'))) throw new Error(MESSAGE);
    return super.put(keyOrEntries, value);
  }
}

/** Refuses only the Séra leg's row: the Shop+ fact of the same « prêt » still lands. */
class FileSeraRefusee extends StockageCompteur {
  override async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    const cles = typeof keyOrEntries === 'string' ? [keyOrEntries] : Object.keys(keyOrEntries);
    if (cles.some((k) => k.startsWith('progressoutbox:') && k.endsWith(':sera_ready'))) throw new Error(MESSAGE);
    return super.put(keyOrEntries, value);
  }
}

/** The readiness photo, in the shape the media Worker mints. */
const PHOTO = 'media/3c9e1f20-5a6b-4c7d-8e9f-a0b1c2d3e4f5';

let imprime: string[];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T);
  imprime = [];
  for (const voie of ['log', 'info', 'warn', 'error'] as const) {
    vi.spyOn(console, voie).mockImplementation((...args: unknown[]) => {
      imprime.push(args.map(String).join(' '));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** The book over this storage, his code, and the paid order. */
async function ouvrir(storage: StockageCompteur) {
  const book = new FulfillmentDO({ storage } as unknown as DurableObjectState);
  const post = (path: string, body: unknown) =>
    book.fetch(new Request(`https://do${path}`, { method: 'POST', body: JSON.stringify(body) }));
  const { code } = (await (await post('/code/mint', { supplierId: SUPPLIER })).json()) as { code: string };
  await storage.put(`order:${ORDER}`, {
    orderId: ORDER,
    productVersionId: 'pv-journal',
    offerVersion: '1',
    paymentMode: 'A',
    paidAt: new Date(T).toISOString(),
    zoneTo: 'Gounghin',
    sellerBasePrice: 5_000,
    productName: 'Pagne tissé',
    supplierId: SUPPLIER,
    supplierResolved: true,
    correlationId: 'corr-de-shop-plus',
    registeredAt: new Date(T).toISOString(),
  });
  return { post, code };
}

async function accepter(storage: StockageCompteur) {
  const { post, code } = await ouvrir(storage);
  imprime.length = 0;
  const reponse = await post('/accept', { code, orderId: ORDER });
  const rangees = Object.fromEntries([...storage.data].filter(([k]) => k.includes(ORDER)));
  return {
    statut: reponse.status,
    corps: await reponse.json(),
    rangees,
    alarme: await storage.getAlarm(),
    lignes: imprime.map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe('a fault the platform hands back gives one line, and the act is what it is without it', () => {
  it('a refused alarm re-arm: one error line, and the accept, its row and its pointer unchanged', async () => {
    const sans = await accepter(new StockageCompteur());
    expect(sans.lignes, 'nothing failing, nothing printed').toEqual([]);
    expect(sans.alarme).toBe(T);

    const avec = await accepter(new AlarmeRefusee());
    expect(avec.alarme, 'the re-arm really was refused').toBeNull();
    expect(avec.lignes).toEqual([
      {
        ts: new Date(T).toISOString(),
        level: 'error',
        correlation_id: `corr-${ORDER}`,
        service: 'offer-service',
        msg: 'alarm_rearm_failed',
        orderId: ORDER,
        error: 'Error',
      },
    ]);
    for (const l of imprime) expect(l).not.toContain(MESSAGE);
    expect(avec.statut).toBe(sans.statut);
    expect(avec.corps).toEqual(sans.corps);
    expect(avec.rangees).toEqual(sans.rangees);
    expect(Object.keys(avec.rangees).sort()).toEqual([
      `accept:${ORDER}`,
      `order:${ORDER}`,
      `progressoutbox:${ORDER}:accepted`,
      `progresspending:${ORDER}:accepted`,
    ]);
  });

  it('a refused outbox write: one error line naming the outbox, and the accept answered and kept', async () => {
    const sans = await accepter(new StockageCompteur());
    const avec = await accepter(new FileRefusee());
    expect(avec.lignes).toEqual([
      {
        ts: new Date(T).toISOString(),
        level: 'error',
        correlation_id: `corr-${ORDER}`,
        service: 'offer-service',
        msg: 'outbox_enqueue_failed',
        outbox: 'storefront',
        orderId: ORDER,
        error: 'Error',
      },
    ]);
    for (const l of imprime) expect(l).not.toContain(MESSAGE);
    expect(avec.statut).toBe(sans.statut);
    expect(avec.corps).toEqual(sans.corps);
    // the same rows, less the outbox row and its pointer the refused write never made
    const attendues = { ...sans.rangees };
    delete attendues[`progressoutbox:${ORDER}:accepted`];
    delete attendues[`progresspending:${ORDER}:accepted`];
    expect(avec.rangees).toEqual(attendues);
    expect(avec.rangees[`accept:${ORDER}`], 'the supplier’s act is kept').toBeDefined();
  });

  it('a refused Séra outbox write on « prêt »: one error line naming the Séra outbox, the class only, and « prêt » answered', async () => {
    const storage = new FileSeraRefusee();
    const { post, code } = await ouvrir(storage);
    expect((await post('/accept', { code, orderId: ORDER })).status).toBe(200);
    const defi = (await (await post('/ready/challenge', { code, orderId: ORDER })).json()) as { challenge: string };
    imprime.length = 0;
    const reponse = await post('/ready', {
      code,
      confirmation: {
        orderId: ORDER,
        photoRef: { ref: PHOTO, sha256: 'a'.repeat(64), mimeType: 'image/jpeg' },
        readinessChallenge: defi.challenge,
        qty: 1,
        variant: 'pv-journal',
        availableConfirmed: true,
        at: new Date(T).toISOString(),
      },
    });
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toMatchObject({ ok: true, status: 'ready' });
    expect(imprime.map((l) => JSON.parse(l) as unknown)).toEqual([
      {
        ts: new Date(T).toISOString(),
        level: 'error',
        correlation_id: `corr-${ORDER}`,
        service: 'offer-service',
        msg: 'outbox_enqueue_failed',
        outbox: 'sera',
        orderId: ORDER,
        error: 'Error',
      },
    ]);
    for (const l of imprime) expect(l).not.toContain(MESSAGE);
    expect(storage.data.has(`ready:${ORDER}`), 'his « prêt » is kept').toBe(true);
    expect(storage.data.has(`progressoutbox:${ORDER}:ready`), 'the Shop+ fact is still queued').toBe(true);
    expect(storage.data.has(`progressoutbox:${ORDER}:sera_ready`), 'the refused write wrote nothing').toBe(false);
  });

  it('every re-arm and every outbox write in the book goes through the same line', () => {
    const source = readFileSync(new URL('../worker/fulfillment-do.ts', import.meta.url), 'utf8');
    const rearmes = source.split('\n').filter((l) => l.includes('.setAlarm('));
    expect(rearmes, 'enqueueSeraReadiness ×2, enqueueProgress ×2, alarm, door refusal, return check').toHaveLength(7);
    for (const l of rearmes) expect(l).toContain('.catch(rearmEchoue(');
    expect(source.match(/journalFaute\('error', 'outbox_enqueue_failed', orderId, \{ outbox: '(sera|storefront)'/g)).toEqual([
      "journalFaute('error', 'outbox_enqueue_failed', orderId, { outbox: 'sera'",
      "journalFaute('error', 'outbox_enqueue_failed', orderId, { outbox: 'storefront'",
    ]);
  });
});
