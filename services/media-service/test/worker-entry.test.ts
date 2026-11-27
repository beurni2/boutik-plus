import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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

/*
 * AUDIO-READ — the entry now carries ONE more entrypoint, by name: `AudioRead`
 * (a `WorkerEntrypoint` from `cloudflare:workers`). Node cannot load that
 * module, so the entry is pinned by its SOURCE here, and the proof that
 * workerd STARTS the bundle with exactly `default` and `AudioRead` lives in
 * `audio-read.e2e.test.ts`, on workerd itself — the runtime that refuses a
 * stray export.
 */
describe('the media Worker’s deployed entry module', () => {
  const src = readFileSync(new URL('../worker/entry.ts', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('exports the handler and AudioRead, by name, and NOTHING ELSE', () => {
    const exports = [...code.matchAll(/^\s*export\s+(.*)$/gm)].map((m) => m[1]!.trim()).sort();
    expect(exports).toEqual(["default handler;", "{ AudioRead } from './audio-read.js';"]);
  });

  it('the default export is the index handler with a fetch', async () => {
    const index = (await import('../worker/index.js')).default as { fetch?: unknown };
    expect(typeof index.fetch).toBe('function');
    expect(code).toMatch(/import handler from '\.\/index\.js';/);
  });

  it('and the bundle is built FROM it, with cloudflare:workers left to the runtime', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts['bundle:worker']).toContain('worker/entry.ts');
    expect(pkg.scripts['bundle:worker']).not.toContain('worker/index.ts');
    expect(pkg.scripts['bundle:worker']).toContain('--external:cloudflare:workers');
  });
});
