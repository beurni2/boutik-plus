import { decideStock, emptyStock, type StockCommand, type StockState } from '../src/stock-reservation.js';

/**
 * StockReservationDO — the atomic stock authority (B5.1). One DO per
 * variant (idFromName(variantId)); workerd's input gate serializes every
 * command for a variant, so the adversarial concurrency proof runs on the
 * REAL runtime mechanism, not a shim (same pattern as commerce-core's
 * QuoteReservationDO — a different authority over a different resource,
 * ADR-003).
 */

const STATE_KEY = 'stock-state';

export class StockReservationDO {
  constructor(private readonly state: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST') {
      return Response.json({ ok: false, reason: 'method_not_allowed' }, { status: 405 });
    }
    let cmd: StockCommand;
    try {
      cmd = (await request.json()) as StockCommand;
    } catch {
      return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
    }
    if (cmd == null || typeof cmd !== 'object' || typeof cmd.variantId !== 'string') {
      return Response.json({ ok: false, reason: 'malformed' }, { status: 400 });
    }
    const current =
      (await this.state.storage.get<StockState>(STATE_KEY)) ?? emptyStock(cmd.variantId);
    const decision = decideStock(current, cmd);
    if (decision.ok && !decision.idempotentReplay) {
      await this.state.storage.put(STATE_KEY, decision.state);
    }
    return Response.json(decision, { status: decision.ok ? 200 : 409 });
  }
}

interface Env {
  STOCK_RESERVATION: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = /^\/stock\/([^/]+)$/.exec(url.pathname);
    if (!match || request.method !== 'POST') {
      return Response.json({ ok: false, reason: 'not_found' }, { status: 404 });
    }
    const variantId = decodeURIComponent(match[1]!);
    const body = await request.clone().json().catch(() => null);
    if (body == null || typeof body !== 'object' || (body as { variantId?: unknown }).variantId !== variantId) {
      return Response.json({ ok: false, reason: 'variant_mismatch' }, { status: 400 });
    }
    const stub = env.STOCK_RESERVATION.get(env.STOCK_RESERVATION.idFromName(variantId));
    return stub.fetch(request);
  },
};
