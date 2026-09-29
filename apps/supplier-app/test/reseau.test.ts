import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fetchBorne } from '../src/reseau';
import { httpSeraDispatch } from '../src/commandes/sera-service';
import { httpCoursiersService } from '../src/coursiers/service';

/**
 * PREUVE-PRETE-1 (AUDIT-B+2 F-27) — the ceiling, on REAL sockets.
 *
 * The walks stage a stall by faking `fetch`; this proves the helper against the
 * platform's own fetch and a real local server that misbehaves the two ways a
 * bad network does: it never answers, or it answers the status line and then
 * goes silent halfway through the body. Both must end, at the ceiling, as a
 * throw — the thing every call site already turns into its typed failure.
 */

let server: Server;
let base = '';
const ouverts = new Set<import('node:net').Socket>();

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/muet') return; // never answers at all
    if (req.url?.startsWith('/coupe') === true) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.write('{"ok":'); // …and never the rest
      return;
    }
    if (req.url === '/vide') {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(409, { 'Content-Type': 'application/json', 'X-Trace': 't-1' });
    res.end('{"ok":false,"reason":"already_ready"}');
  });
  server.on('connection', (s) => {
    ouverts.add(s);
    s.on('close', () => ouverts.delete(s));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  for (const s of ouverts) s.destroy();
  await new Promise<void>((r) => server.close(() => r()));
});

describe('fetchBorne — every call ends', () => {
  it('a server that never answers: the call throws at the ceiling, not after it', async () => {
    const t0 = Date.now();
    await expect(fetchBorne(`${base}/muet`, {}, 300)).rejects.toThrow();
    const pris = Date.now() - t0;
    expect(pris).toBeGreaterThanOrEqual(250);
    expect(pris).toBeLessThan(3_000);
  });

  it('a reply that stalls HALFWAY through its body throws too — the body is read inside the ceiling', async () => {
    const t0 = Date.now();
    await expect(fetchBorne(`${base}/coupe`, {}, 300)).rejects.toThrow();
    expect(Date.now() - t0).toBeLessThan(3_000);
  });

  it('a whole reply comes back intact: status, headers and body, readable after the clock stopped', async () => {
    const res = await fetchBorne(`${base}/ok`, { method: 'POST', body: '{}' }, 2_000);
    expect(res.status).toBe(409);
    expect(res.ok).toBe(false);
    expect(res.headers.get('x-trace')).toBe('t-1');
    expect(await res.json()).toEqual({ ok: false, reason: 'already_ready' });
  });

  it('verifier MINOR 1 — the calls that had their own clock read the body inside it now: the Séra board and the rider registry end on a half-sent reply', async () => {
    const t0 = Date.now();
    expect((await httpSeraDispatch(`${base}/coupe`, fetch, 300).board('cle-test')).kind).toBe('unreachable');
    expect((await httpCoursiersService(`${base}/coupe`, 'cle-test', fetch, 300).liste()).kind).toBe('unreachable');
    expect(Date.now() - t0).toBeLessThan(3_000);
  });

  it('and no call sets up a clock of its own again: every AbortController in the app is the helper\'s', () => {
    const src = join(import.meta.dirname, '..', 'src');
    const fichiers = (d: string): string[] =>
      readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? fichiers(join(d, n)) : /\.tsx?$/.test(n) ? [join(d, n)] : []));
    const horsHelper = fichiers(src)
      .filter((f) => !f.endsWith('reseau.ts'))
      .filter((f) => /new AbortController|signal:/.test(readFileSync(f, 'utf8')))
      .map((f) => f.slice(src.length + 1));
    expect(horsHelper).toEqual([]);
  });

  it('a reply with no body (204) stays a valid answer', async () => {
    const res = await fetchBorne(`${base}/vide`, {}, 2_000);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });
});
