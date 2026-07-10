/**
 * B5.1 ⚠ — atomic STOCK reservation, pure decision core. This is Boutik+'s
 * inventory authority (units of stock per variant) — DISTINCT from
 * commerce-core's ORDER reservation in shop-plus (one order slot per quote;
 * founder ruling E1-D1 — see ADR-003). The Durable Object hosting this core
 * is addressed by variantId, so all commands for one variant's stock
 * serialize through workerd's input gate: 20 concurrent reserves on stock 1
 * → exactly one winner, by the runtime, not by luck. Stock NEVER goes
 * negative — refuse closed. Reserve and release are idempotent on
 * command_id.
 */

export interface StockState {
  variantId: string;
  available: number;
  /** holdId → qty */
  holds: Record<string, number>;
  /** command_id → holdId for idempotent replay */
  appliedCommands: Record<string, string>;
}

export interface ReserveCommand {
  kind: 'reserve';
  command_id: string;
  variantId: string;
  qty: number;
  newHoldId: string;
}

export interface ReleaseCommand {
  kind: 'release';
  command_id: string;
  variantId: string;
  holdId: string;
}

export interface SetStockCommand {
  kind: 'set_stock';
  command_id: string;
  variantId: string;
  available: number;
}

export type StockCommand = ReserveCommand | ReleaseCommand | SetStockCommand;

export type StockDecision =
  | { ok: true; state: StockState; holdId?: string; idempotentReplay: boolean }
  | {
      ok: false;
      state: StockState;
      reason: 'insufficient_stock' | 'unknown_hold' | 'variant_mismatch' | 'invalid_qty';
    };

export function emptyStock(variantId: string): StockState {
  return { variantId, available: 0, holds: {}, appliedCommands: {} };
}

export function decideStock(state: StockState, cmd: StockCommand): StockDecision {
  if (state.variantId !== cmd.variantId) return { ok: false, state, reason: 'variant_mismatch' };

  const replayedHold = state.appliedCommands[cmd.command_id];
  if (replayedHold !== undefined) {
    if (replayedHold === '') return { ok: true, state, idempotentReplay: true };
    return { ok: true, state, holdId: replayedHold, idempotentReplay: true };
  }

  switch (cmd.kind) {
    case 'set_stock': {
      if (!Number.isInteger(cmd.available) || cmd.available < 0) {
        return { ok: false, state, reason: 'invalid_qty' };
      }
      const next: StockState = {
        ...state,
        available: cmd.available,
        appliedCommands: { ...state.appliedCommands, [cmd.command_id]: '' },
      };
      return { ok: true, state: next, idempotentReplay: false };
    }
    case 'reserve': {
      if (!Number.isInteger(cmd.qty) || cmd.qty <= 0) return { ok: false, state, reason: 'invalid_qty' };
      if (cmd.qty > state.available) {
        // NEVER negative — the refusal carries no mutation.
        return { ok: false, state, reason: 'insufficient_stock' };
      }
      const next: StockState = {
        ...state,
        available: state.available - cmd.qty,
        holds: { ...state.holds, [cmd.newHoldId]: cmd.qty },
        appliedCommands: { ...state.appliedCommands, [cmd.command_id]: cmd.newHoldId },
      };
      return { ok: true, state: next, holdId: cmd.newHoldId, idempotentReplay: false };
    }
    case 'release': {
      const qty = state.holds[cmd.holdId];
      if (qty === undefined) return { ok: false, state, reason: 'unknown_hold' };
      const { [cmd.holdId]: _released, ...holds } = state.holds;
      const next: StockState = {
        ...state,
        available: state.available + qty,
        holds,
        appliedCommands: { ...state.appliedCommands, [cmd.command_id]: cmd.holdId },
      };
      return { ok: true, state: next, holdId: cmd.holdId, idempotentReplay: false };
    }
  }
}
