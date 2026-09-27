/**
 * CROISSANCE-1 (AUDIT-B+2 F-04 / F-05 / F-89) — a COUNTING stand-in for a
 * Durable Object's storage and for the OFFER namespace, so a test can drive the
 * REAL `FulfillmentDO`, the REAL `OfferDO` and the REAL offer router and ask
 * how much each request costs.
 *
 * ITS BOUNDS, stated so a green run is never read as more:
 *   · ROWS READ is this double's MODEL of Cloudflare's meter, not the meter: a
 *     `list` costs one row per entry it returns, a `get` one row per key ASKED
 *     (a missing key counted too — the conservative reading). Cloudflare's own
 *     accounting is not fetched here (its docs are blocked from this sandbox);
 *     what the tests assert is the SHAPE — what the cost grows with — which the
 *     model and the meter share.
 *   · DO CALLS count every `stub.fetch` a request makes, the unit of the
 *     platform's per-request subrequest bound. Miniflare does not enforce that
 *     bound, which is why the walks are counted here and not there.
 *   · It implements only what the two objects call: get / put / delete / list
 *     (prefix, start, startAfter, end, limit) and the alarm clock. Ordering is
 *     by UTF-16 code unit, which equals Cloudflare's byte order for the ASCII
 *     keys this service writes.
 *   · Behaviour (what a route answers) is proven on real workerd in the e2e
 *     suites; this double proves only COST.
 */

type ListOptions = {
  prefix?: string;
  start?: string;
  startAfter?: string;
  end?: string;
  limit?: number;
  reverse?: boolean;
};

export class StockageCompteur {
  readonly data = new Map<string, unknown>();
  rowsRead = 0;
  rowsWritten = 0;
  private alarm: number | null = null;

  async get<T>(keyOrKeys: string | string[]): Promise<T | undefined | Map<string, T>> {
    if (Array.isArray(keyOrKeys)) {
      if (keyOrKeys.length > 128) throw new Error(`get(keys[]) takes at most 128 keys, got ${keyOrKeys.length}`);
      this.rowsRead += keyOrKeys.length;
      const out = new Map<string, T>();
      for (const k of keyOrKeys) if (this.data.has(k)) out.set(k, structuredClone(this.data.get(k)) as T);
      return out;
    }
    this.rowsRead += 1;
    return this.data.has(keyOrKeys) ? (structuredClone(this.data.get(keyOrKeys)) as T) : undefined;
  }

  async put(keyOrEntries: string | Record<string, unknown>, value?: unknown): Promise<void> {
    if (typeof keyOrEntries === 'string') {
      this.data.set(keyOrEntries, structuredClone(value));
      this.rowsWritten += 1;
      return;
    }
    const entries = Object.entries(keyOrEntries);
    if (entries.length > 128) throw new Error(`put(entries) takes at most 128 keys, got ${entries.length}`);
    for (const [k, v] of entries) this.data.set(k, structuredClone(v));
    this.rowsWritten += entries.length;
  }

  async delete(keyOrKeys: string | string[]): Promise<boolean | number> {
    if (Array.isArray(keyOrKeys)) {
      if (keyOrKeys.length > 128) throw new Error(`delete(keys[]) takes at most 128 keys, got ${keyOrKeys.length}`);
      let n = 0;
      for (const k of keyOrKeys) if (this.data.delete(k)) n += 1;
      this.rowsWritten += n;
      return n;
    }
    const had = this.data.delete(keyOrKeys);
    if (had) this.rowsWritten += 1;
    return had;
  }

  async list<T>(opts: ListOptions = {}): Promise<Map<string, T>> {
    let keys = [...this.data.keys()].sort();
    if (opts.prefix !== undefined) keys = keys.filter((k) => k.startsWith(opts.prefix!));
    if (opts.start !== undefined) keys = keys.filter((k) => k >= opts.start!);
    if (opts.startAfter !== undefined) keys = keys.filter((k) => k > opts.startAfter!);
    if (opts.end !== undefined) keys = keys.filter((k) => k < opts.end!);
    if (opts.reverse === true) keys.reverse();
    if (opts.limit !== undefined) keys = keys.slice(0, opts.limit);
    this.rowsRead += keys.length;
    return new Map(keys.map((k) => [k, structuredClone(this.data.get(k)) as T]));
  }

  async getAlarm(): Promise<number | null> {
    return this.alarm;
  }
  async setAlarm(at: number): Promise<void> {
    this.alarm = at;
  }
  async deleteAlarm(): Promise<void> {
    this.alarm = null;
  }

  reset(): void {
    this.rowsRead = 0;
    this.rowsWritten = 0;
  }
}

export function etatCompteur(): { storage: StockageCompteur } {
  return { storage: new StockageCompteur() };
}

/**
 * The OFFER namespace over real `OfferDO` instances, one per name, each on its
 * own counting storage. `appels` counts every `stub.fetch` — a subrequest.
 */
export class EspaceOffres {
  appels = 0;
  plafond = Number.POSITIVE_INFINITY;
  readonly instances = new Map<string, { fetch(r: Request): Promise<Response> }>();

  constructor(private readonly fabrique: (etat: { storage: StockageCompteur }) => { fetch(r: Request): Promise<Response> }) {}

  idFromName(name: string): { name: string } {
    return { name };
  }

  get(id: { name: string }): { fetch(r: Request): Promise<Response> } {
    return {
      fetch: async (r: Request): Promise<Response> => {
        this.appels += 1;
        if (this.appels > this.plafond) throw new Error(`subrequest ${this.appels} past the ceiling of ${this.plafond}`);
        let inst = this.instances.get(id.name);
        if (inst === undefined) {
          inst = this.fabrique(etatCompteur());
          this.instances.set(id.name, inst);
        }
        return inst.fetch(r);
      },
    };
  }
}
