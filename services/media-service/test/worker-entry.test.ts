import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as entry from '../worker/entry.js';

/**
 * ═══ THE DEPLOYED ENTRY MUST BE LOADABLE BY workerd ═══
 *
 * Found 2026-08-11 by the first test that ever ran this Worker on real workerd:
 * the bundle would not START, because `worker/index.ts` — which was the bundle's
 * entry — exports its route paths and handler functions by name for the unit
 * suites, and workerd reads a module's named exports as additional entrypoints:
 *
 *     Uncaught TypeError: Incorrect type for map entry 'AUDIO_UPLOAD_PATH':
 *     the provided value is not of type 'function or ExportedHandler'.
 *
 * Nothing in this repo could see it, because every media test drove the default
 * export as a plain function in Node, where a stray string export means nothing.
 * `worker/entry.ts` now carries the deploy and exports ONLY the handler.
 *
 * ⚠ NOT A PRODUCTION OUTAGE, and the distinction matters: `media-deploy` has run
 * seven times successfully and Cloudflare accepts that module today. What was
 * impossible was proving it on workerd — the runtime this repo tests against.
 *
 * THIS FILE IS THE TOOTH. It is cheap, it runs in every suite, and it fails the
 * moment someone adds a convenient constant to the entry module — which is
 * exactly how the original hole was dug.
 */

describe('the media Worker’s deployed entry module', () => {
  it('exports the handler and NOTHING ELSE', () => {
    // A named export that is not a handler stops the Worker from starting.
    expect(Object.keys(entry).sort()).toEqual(['default']);
  });

  it('the default export is an ExportedHandler with a fetch', () => {
    expect(typeof (entry.default as { fetch?: unknown }).fetch).toBe('function');
  });

  it('and the bundle is built FROM it — a pin, because the whole fix is which file esbuild is pointed at', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['bundle:worker']).toContain('worker/entry.ts');
    expect(pkg.scripts['bundle:worker']).not.toContain('worker/index.ts');
  });
});
