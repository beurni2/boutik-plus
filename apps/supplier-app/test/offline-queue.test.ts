import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DurableQueue, PoisonError, type QueueEntry, type QueueStore } from '../src/offline/queue';

/**
 * WO-6.5 · B2.1 — the durable queue proven BY EXECUTION, not by assertion.
 *
 * The store here is a REAL on-disk file (Node fs): a fresh DurableQueue.open()
 * over the same path is a genuine COLD BOOT — it reads bytes another instance
 * wrote to disk, exactly as the app's Expo document store reads across an
 * app-kill/reboot. Nothing is shared in memory between "runs"; the durability
 * is the file. (The Expo adapter's write/read-string contract is type-proven
 * in src/offline/expoStore.ts — the SAME logic runs over it.)
 */

const dirs: string[] = [];
function diskStore(): { store: QueueStore; path: string } {
  const dir = mkdtempSync(join(tmpdir(), 'oq-'));
  dirs.push(dir);
  const path = join(dir, 'queue.json');
  // a brand-new store instance each call — no in-memory sharing, only the file.
  const store: QueueStore = {
    async read() {
      return existsSync(path) ? readFileSync(path, 'utf8') : null;
    },
    async write(data) {
      writeFileSync(path, data);
    },
  };
  return { store, path };
}
/** A fresh store over an existing path — the "reboot" reads the same file. */
function reopenStore(path: string): QueueStore {
  return {
    async read() {
      return existsSync(path) ? readFileSync(path, 'utf8') : null;
    },
    async write(data) {
      writeFileSync(path, data);
    },
  };
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe('WO-6.5 B2.1 — survival across app-kill + reboot (EXECUTED)', () => {
  it('actions queued offline survive an app-kill and are STILL PENDING (in order) on cold boot, then deliver', async () => {
    const { store, path } = diskStore();

    // ── run 1: the seller confirms three products while offline, then the OS
    //    kills the app before the network ever returns. Nothing was delivered. ──
    const q1 = await DurableQueue.open(store);
    await q1.enqueue('ready:p1', 'fulfillment.ready.v1', { productId: 'p1' });
    await q1.enqueue('ready:p2', 'fulfillment.ready.v1', { productId: 'p2' });
    await q1.enqueue('ready:p3', 'fulfillment.ready.v1', { productId: 'p3' });
    // (the app is now "killed" — q1 is dropped; the file on disk is all that survives)
    expect(existsSync(path)).toBe(true);

    // ── run 2: COLD BOOT — a fresh queue over the same file ──
    const q2 = await DurableQueue.open(reopenStore(path));
    expect(q2.pending().map((e) => e.commandId)).toEqual(['ready:p1', 'ready:p2', 'ready:p3']); // STILL PENDING, in order
    expect(q2.snapshot().every((e) => e.status === 'pending')).toBe(true); // none faked as done

    const sent: string[] = [];
    const res = await q2.deliver(async (e) => void sent.push(e.commandId));
    expect(sent).toEqual(['ready:p1', 'ready:p2', 'ready:p3']); // delivered in insertion order
    expect(res).toEqual({ delivered: 3, failed: 0, remaining: 0 });
  });

  it('a kill AFTER a partial delivery: the undelivered action survives; the delivered one is NOT re-sent', async () => {
    const { store, path } = diskStore();

    // run 1: p1 delivers; p2 hits a transient error and stays pending; the
    // resilient queue still tries p3, which delivers. Then the app is killed.
    const q1 = await DurableQueue.open(store);
    await q1.enqueue('ready:p1', 'fulfillment.ready.v1', { productId: 'p1' });
    await q1.enqueue('ready:p2', 'fulfillment.ready.v1', { productId: 'p2' });
    await q1.enqueue('ready:p3', 'fulfillment.ready.v1', { productId: 'p3' });
    const sent1: string[] = [];
    await q1.deliver(async (e) => {
      if (e.commandId === 'ready:p2') throw new Error('network blipped on p2');
      sent1.push(e.commandId);
    });
    expect(sent1).toEqual(['ready:p1', 'ready:p3']); // p2 failed transiently, did not block p3

    // run 2: cold boot — only p2 is still pending; p1 and p3 stay delivered.
    const q2 = await DurableQueue.open(reopenStore(path));
    expect(q2.pending().map((e) => e.commandId)).toEqual(['ready:p2']);
    const sent2: string[] = [];
    const res = await q2.deliver(async (e) => void sent2.push(e.commandId));
    expect(sent2).toEqual(['ready:p2']); // ONLY the survivor — p1/p3 never re-sent (idempotent)
    expect(res).toEqual({ delivered: 1, failed: 0, remaining: 0 });
  });

  it('an EMPTY store opens to an empty queue; a corrupt blob refuses into empty, never crashes', async () => {
    const { store, path } = diskStore();
    const fresh = await DurableQueue.open(store);
    expect(fresh.pending()).toEqual([]);
    writeFileSync(path, '{not json at all');
    const q = await DurableQueue.open(reopenStore(path));
    expect(q.pending()).toEqual([]);
  });
});

describe('WO-6.5 B2.1 — idempotent replay (command_id, the E1 pattern)', () => {
  it('a duplicate enqueue is a no-op; delivery twice sends ONCE; re-open + deliver does not re-send', async () => {
    const { store, path } = diskStore();
    const q = await DurableQueue.open(store);
    await q.enqueue('ready:p1', 'fulfillment.ready.v1', { productId: 'p1' });
    await q.enqueue('ready:p1', 'fulfillment.ready.v1', { productId: 'p1' }); // same command_id
    expect(q.snapshot()).toHaveLength(1); // deduped

    const sends: string[] = [];
    await q.deliver(async (e) => void sends.push(e.commandId));
    await q.deliver(async (e) => void sends.push(e.commandId)); // replay
    expect(sends).toEqual(['ready:p1']); // delivered exactly ONCE

    const rebooted = await DurableQueue.open(reopenStore(path));
    const afterReboot: string[] = [];
    await rebooted.deliver(async (e) => void afterReboot.push(e.commandId));
    expect(afterReboot).toEqual([]); // a delivered command never sends again
  });
});

describe('WO-6.5 B2.1 — a poisoned entry cannot block the queue forever', () => {
  it('a PoisonError → NAMED failed state (never a silent drop); entries behind it still deliver, in order', async () => {
    const { store } = diskStore();
    const q = await DurableQueue.open(store);
    await q.enqueue('good:1', 'fulfillment.ready.v1', { i: 1 });
    await q.enqueue('poison', 'fulfillment.ready.v1', { i: 2 });
    await q.enqueue('good:2', 'fulfillment.ready.v1', { i: 3 });

    const sent: string[] = [];
    const res = await q.deliver(async (e) => {
      if (e.commandId === 'poison') throw new PoisonError('payload rejected by the server');
      sent.push(e.commandId);
    });

    expect(sent).toEqual(['good:1', 'good:2']); // ordering preserved, poison did not block
    expect(res).toEqual({ delivered: 2, failed: 1, remaining: 0 });
    const poison = q.snapshot().find((e) => e.commandId === 'poison')!;
    expect(poison.status).toBe('failed'); // a designed terminal, not a generic drop
    expect(poison.failureReason).toBe('payload rejected by the server'); // honest reason
    // it is STILL in the snapshot — nothing was silently dropped
    expect(q.snapshot().map((e) => e.commandId)).toContain('poison');
  });

  it('a transient failure retries up to maxAttempts, then fails honestly (never an infinite block)', async () => {
    const { store } = diskStore();
    const q = await DurableQueue.open(store, { maxAttempts: 3 });
    await q.enqueue('flaky', 'fulfillment.ready.v1', {});
    const alwaysFails = async () => {
      throw new Error('network down');
    };
    await q.deliver(alwaysFails); // attempt 1
    expect(q.pending().map((e) => e.commandId)).toEqual(['flaky']); // still pending
    await q.deliver(alwaysFails); // attempt 2
    expect(q.pending()).toHaveLength(1);
    await q.deliver(alwaysFails); // attempt 3 → maxAttempts → failed
    expect(q.pending()).toHaveLength(0);
    expect(q.snapshot()[0]!.status).toBe('failed');
    expect(q.snapshot()[0]!.failureReason).toBe('network down');
  });
});

describe('WO-6.5 B2.1 — the honesty law: queued NEVER shows success', () => {
  it('a pending entry is never delivered; it stays pending across a reboot until it actually delivers', async () => {
    const { store, path } = diskStore();
    const q = await DurableQueue.open(store);
    await q.enqueue('ready:p9', 'fulfillment.ready.v1', { productId: 'p9' });

    // the surfaced state while offline: pending, never 'delivered'
    const shown = (entries: readonly QueueEntry[]) => entries.map((e) => e.status);
    expect(shown(q.snapshot())).toEqual(['pending']);

    // reboot without ever delivering → STILL pending (no success was invented)
    const q2 = await DurableQueue.open(reopenStore(path));
    expect(shown(q2.snapshot())).toEqual(['pending']);
    expect(q2.snapshot().some((e) => e.status === 'delivered')).toBe(false);

    // only an actual successful send flips it to delivered
    await q2.deliver(async () => {});
    expect(shown(q2.snapshot())).toEqual(['delivered']);
  });
});
