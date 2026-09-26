// NEGATIVE FIXTURE (no-demo-in-app-graph) — the audit's escape: a file INSIDE
// src/supply/ importing its sibling as './demo', with `from` on its own line.
// The resolving gate must refuse it; the old text match passed it.
import {
  sentinel,
} from './demo';
export const bytes = sentinel.length;
