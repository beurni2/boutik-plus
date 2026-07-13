import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * B2.2 · A1 — "No self-moderation: a supplier can never approve his own listing"
 * (Desk 3). The catalog-service PROVES this at runtime (decide() refuses any
 * non-operator actor — moderation.test.ts ③). This test proves the STRUCTURAL
 * half, the sera D1/D3 absence pattern: there is NOTHING for a supplier-side
 * path to call. The supplier app carries NO moderation-decision lever — no
 * approve, no changes_requested, no `decide` — anywhere in its source. B11
 * RENDERS the moderation state; it can never SET it.
 */
const appDir = join(import.meta.dirname, '..');

function* walk(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.expo') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) yield p;
  }
}

describe('no self-moderation — the supplier app has no approve lever (Desk 3, absence proof)', () => {
  it('no source file references a moderation DECISION verb (decide / approve / changes_requested as an action)', () => {
    const offenders: string[] = [];
    for (const file of [join(appDir, 'App.tsx'), ...walk(join(appDir, 'src'))]) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1');
      // a CALL/decision surface — not the string enum value it renders. `decide(`,
      // an `approveModeration`/`moderationDecision` lever, or a bare `.approve(`.
      if (/\bdecide\s*\(|approveModeration|moderationDecision|\.approve\s*\(|setModerationState/.test(code)) {
        offenders.push(file.slice(appDir.length + 1));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('B11 only READS moderationState — the demo store exposes no setter for it', () => {
    const store = readFileSync(join(appDir, 'src/demo/store.ts'), 'utf8');
    // moderationState is a readonly field; there is no function that MUTATES it
    // (the word 'approved' appears only as the read-only state VALUE, never a setter).
    expect(store).toMatch(/readonly moderationState/);
    expect(store).not.toMatch(/set[A-Za-z]*ModerationState|moderationState\s*=[^=]|\.approve\s*\(/);
  });
});
