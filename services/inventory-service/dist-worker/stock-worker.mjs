// src/stock-reservation.ts
function emptyStock(variantId) {
  return { variantId, available: 0, holds: {}, appliedCommands: {} };
}
function decideStock(state, cmd) {
  if (state.variantId !== cmd.variantId) return { ok: false, state, reason: "variant_mismatch" };
  const replayedHold = state.appliedCommands[cmd.command_id];
  if (replayedHold !== void 0) {
    if (replayedHold === "") return { ok: true, state, idempotentReplay: true };
    return { ok: true, state, holdId: replayedHold, idempotentReplay: true };
  }
  switch (cmd.kind) {
    case "set_stock": {
      if (!Number.isInteger(cmd.available) || cmd.available < 0) {
        return { ok: false, state, reason: "invalid_qty" };
      }
      const next = {
        ...state,
        available: cmd.available,
        appliedCommands: { ...state.appliedCommands, [cmd.command_id]: "" }
      };
      return { ok: true, state: next, idempotentReplay: false };
    }
    case "reserve": {
      if (!Number.isInteger(cmd.qty) || cmd.qty <= 0) return { ok: false, state, reason: "invalid_qty" };
      if (cmd.qty > state.available) {
        return { ok: false, state, reason: "insufficient_stock" };
      }
      const next = {
        ...state,
        available: state.available - cmd.qty,
        holds: { ...state.holds, [cmd.newHoldId]: cmd.qty },
        appliedCommands: { ...state.appliedCommands, [cmd.command_id]: cmd.newHoldId }
      };
      return { ok: true, state: next, holdId: cmd.newHoldId, idempotentReplay: false };
    }
    case "release": {
      const qty = state.holds[cmd.holdId];
      if (qty === void 0) return { ok: false, state, reason: "unknown_hold" };
      const { [cmd.holdId]: _released, ...holds } = state.holds;
      const next = {
        ...state,
        available: state.available + qty,
        holds,
        appliedCommands: { ...state.appliedCommands, [cmd.command_id]: cmd.holdId }
      };
      return { ok: true, state: next, holdId: cmd.holdId, idempotentReplay: false };
    }
  }
}

// worker/stock-reservation-do.ts
var STATE_KEY = "stock-state";
var StockReservationDO = class {
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    if (request.method !== "POST") {
      return Response.json({ ok: false, reason: "method_not_allowed" }, { status: 405 });
    }
    let cmd;
    try {
      cmd = await request.json();
    } catch {
      return Response.json({ ok: false, reason: "malformed" }, { status: 400 });
    }
    if (cmd == null || typeof cmd !== "object" || typeof cmd.variantId !== "string") {
      return Response.json({ ok: false, reason: "malformed" }, { status: 400 });
    }
    const current = await this.state.storage.get(STATE_KEY) ?? emptyStock(cmd.variantId);
    const decision = decideStock(current, cmd);
    if (decision.ok && !decision.idempotentReplay) {
      await this.state.storage.put(STATE_KEY, decision.state);
    }
    return Response.json(decision, { status: decision.ok ? 200 : 409 });
  }
};
var stock_reservation_do_default = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const match = /^\/stock\/([^/]+)$/.exec(url.pathname);
    if (!match || request.method !== "POST") {
      return Response.json({ ok: false, reason: "not_found" }, { status: 404 });
    }
    const variantId = decodeURIComponent(match[1]);
    const body = await request.clone().json().catch(() => null);
    if (body == null || typeof body !== "object" || body.variantId !== variantId) {
      return Response.json({ ok: false, reason: "variant_mismatch" }, { status: 400 });
    }
    const stub = env.STOCK_RESERVATION.get(env.STOCK_RESERVATION.idFromName(variantId));
    return stub.fetch(request);
  }
};
export {
  StockReservationDO,
  stock_reservation_do_default as default
};
