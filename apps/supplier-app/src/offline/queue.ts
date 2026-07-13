/**
 * WO-6.5 · B2.1 — THE DURABLE OFFLINE QUEUE. D17: every queued action survives
 * APP-KILL AND REBOOT. An in-memory queue is a lie — a seller believes she
 * published and did not. This queue PERSISTS every mutation to an injected
 * store, restores on open, replays IN ORDER, is IDEMPOTENT by command_id (the
 * E1 pattern — `EventEnvelope.command_id`, Execution Contract §3: "every event
 * carries `command_id`… same command_id = same command"), and gives a poisoned
 * entry a NAMED honest failure state (never a silent drop). Storage is INJECTED
 * (QueueStore) so the SAME logic runs on Expo's durable document store (the app)
 * and on a real on-disk store (the survival test) — durability is proven by
 * execution across instances, not asserted.
 */

export interface QueueStore {
  /** The persisted blob, or null if nothing has been written yet. */
  read(): Promise<string | null>;
  /** Persist the blob (create-or-overwrite; durable across process death). */
  write(data: string): Promise<void>;
}

export type QueueStatus = 'pending' | 'delivered' | 'failed';

export interface QueueEntry {
  /** The E1 idempotency key (EventEnvelope.command_id). */
  readonly commandId: string;
  /** The event name (e.g. 'fulfillment.ready.v1'). */
  readonly name: string;
  /** The action data (JSON-serializable). */
  readonly payload: unknown;
  status: QueueStatus;
  attempts: number;
  readonly enqueuedAt: number;
  /** Set when status becomes 'failed' — the honest reason, never a silent drop. */
  failureReason?: string;
}

/** A PERMANENT failure — the entry is poison and must not be retried. */
export class PoisonError extends Error {
  override readonly name = 'PoisonError';
}

/**
 * The outcome of an enqueue — the caller MUST handle it; enqueue never no-ops
 * by silence (verifier concern / founder ruling). A dedupe that is correct for
 * a TRUE replay is SILENT DATA LOSS for a colliding-but-different command, and
 * the command_id is the only thing between them — so the two are distinct:
 *   'enqueued'  — a new command was appended.
 *   'duplicate' — this exact command (same id, same name+payload) is already
 *                 queued: an idempotent replay, safely a no-op.
 *   'collision' — this command_id already exists with a DIFFERENT name/payload:
 *                 REFUSED (the new command was NOT queued). The caller must
 *                 surface this honestly — never show the seller « en attente »
 *                 for an action that does not exist.
 */
export type EnqueueResult =
  | { outcome: 'enqueued'; entry: QueueEntry }
  | { outcome: 'duplicate'; entry: QueueEntry }
  | { outcome: 'collision'; entry: QueueEntry };

interface Persisted {
  version: 1;
  entries: QueueEntry[];
}

const SCHEMA_VERSION = 1 as const;

export class DurableQueue {
  private constructor(
    private readonly store: QueueStore,
    private entries: QueueEntry[],
    private readonly maxAttempts: number,
    private readonly now: () => number,
  ) {}

  /** Open the queue, RESTORING any persisted state (the reboot path). A
   * corrupt or wrong-version blob is refused into an empty queue rather than
   * crashing — the durable file is never trusted blindly. */
  static async open(
    store: QueueStore,
    opts: { maxAttempts?: number; now?: () => number } = {},
  ): Promise<DurableQueue> {
    const raw = await store.read();
    let entries: QueueEntry[] = [];
    if (raw !== null && raw.length > 0) {
      try {
        const parsed = JSON.parse(raw) as Persisted;
        if (parsed.version === SCHEMA_VERSION && Array.isArray(parsed.entries)) {
          entries = parsed.entries;
        }
      } catch {
        entries = [];
      }
    }
    return new DurableQueue(store, entries, opts.maxAttempts ?? 5, opts.now ?? Date.now);
  }

  private async persist(): Promise<void> {
    const blob: Persisted = { version: SCHEMA_VERSION, entries: this.entries };
    await this.store.write(JSON.stringify(blob));
  }

  /** Append a command, returning an outcome the caller MUST handle (never a
   * no-op by silence). IDEMPOTENT by commandId: an identical command (same
   * name+payload) is a 'duplicate'; a SAME id with a DIFFERENT name/payload is
   * a 'collision' — REFUSED, not overwritten, not silently dropped. Persisted
   * before returning on the append path, so an app-kill right after cannot lose
   * it. */
  async enqueue(commandId: string, name: string, payload: unknown): Promise<EnqueueResult> {
    const existing = this.entries.find((e) => e.commandId === commandId);
    if (existing !== undefined) {
      const identical = existing.name === name && JSON.stringify(existing.payload) === JSON.stringify(payload);
      return { outcome: identical ? 'duplicate' : 'collision', entry: existing };
    }
    const entry: QueueEntry = { commandId, name, payload, status: 'pending', attempts: 0, enqueuedAt: this.now() };
    this.entries.push(entry);
    await this.persist();
    return { outcome: 'enqueued', entry };
  }

  /** Pending entries, in insertion order (never the delivered/failed ones). */
  pending(): readonly QueueEntry[] {
    return this.entries.filter((e) => e.status === 'pending');
  }

  /** The full ordered snapshot — incl. failed entries, so nothing is hidden. */
  snapshot(): readonly QueueEntry[] {
    return this.entries.slice();
  }

  /**
   * Replay pending entries IN ORDER through `send`. Success marks the entry
   * delivered — its commandId NEVER sends again (idempotent replay across
   * deliver() calls and across reboots). A PoisonError is permanent → the
   * entry is marked 'failed' at once. A transient error leaves it pending until
   * maxAttempts, after which it also fails — a poison can NEVER block the queue
   * forever. Ordering among the DELIVERED is preserved; a failed entry is set
   * aside with a named reason, never silently dropped. Persisted after every
   * outcome (durable mid-replay).
   */
  async deliver(
    send: (entry: QueueEntry) => Promise<void>,
  ): Promise<{ delivered: number; failed: number; remaining: number }> {
    let delivered = 0;
    let failed = 0;
    for (const entry of this.entries) {
      if (entry.status !== 'pending') continue; // delivered → never re-sent
      try {
        await send(entry);
        entry.status = 'delivered';
        delivered++;
      } catch (error) {
        entry.attempts++;
        if (error instanceof PoisonError) {
          entry.status = 'failed';
          entry.failureReason = error.message;
          failed++;
        } else if (entry.attempts >= this.maxAttempts) {
          entry.status = 'failed';
          entry.failureReason = error instanceof Error ? error.message : String(error);
          failed++;
        }
        // else: transient — stays pending, retried on the next deliver().
      }
      await this.persist();
    }
    return { delivered, failed, remaining: this.pending().length };
  }
}
