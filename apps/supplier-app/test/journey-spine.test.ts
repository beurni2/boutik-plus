import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JOURNEY, START, type Screen } from '../src/journey';

/**
 * WO-4.1 spine coverage: the walkable-world promise as assertions. Every
 * screen must be reachable from START by touch (BFS over the journey map),
 * every edge must point at a real screen, and the App must render every
 * screen the map names (source-level pin — a screen in the map with no
 * render block would be a dead end the founder can reach).
 */

const screens = Object.keys(JOURNEY) as Screen[];

describe('supplier journey spine', () => {
  it('every screen is reachable from START', () => {
    const seen = new Set<Screen>([START]);
    const queue: Screen[] = [START];
    while (queue.length > 0) {
      for (const next of JOURNEY[queue.shift()!]) {
        if (!seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    for (const s of screens) expect(seen.has(s), `unreachable screen: ${s}`).toBe(true);
  });

  it('no edge dangles (every target is a declared screen)', () => {
    for (const s of screens) {
      for (const target of JOURNEY[s]) {
        expect(screens.includes(target), `${s} → ${target}`).toBe(true);
      }
    }
  });

  it('the App renders a block for every screen in the map', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'App.tsx'), 'utf8');
    for (const s of screens) {
      expect(source).toMatch(new RegExp(`screen === '${s}'`));
    }
  });

  it('the App navigates only along journey edges and always offers retour + reset', () => {
    const source = readFileSync(join(import.meta.dirname, '..', 'App.tsx'), 'utf8');
    expect(source).toMatch(/JOURNEY\[stack\[stack\.length - 1\] \?\? START\]\.includes\(next\)/);
    expect(source).toMatch(/t\('nav\.retour'\)/);
    expect(source).toMatch(/t\('nav\.recommencer'\)/);
    expect(source).toMatch(/<FlatList/);
  });
});
