#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';

/**
 * PROOF that the live-check job keeps its public log to counts.
 *
 * live-check reads the founder's live product list and probes each photo, in
 * a GitHub Actions job of this PUBLIC repository: what it prints, anyone can
 * read. This runs the job's OWN script — the `run:` text of its step, read out
 * of .github/workflows/live-check.yml, whatever that text calls — against a
 * local HTTP server standing in for the offer and media Workers, and asserts
 * the output carries no product id or id prefix, no rayon, no stock figure,
 * no hidden reason and no media ref — while still giving the counts.
 *
 * Bounds of the stand-in: it answers the supplier list and the photo reads
 * with fixed bodies shaped like the live services'; it checks no key.
 * Exit 0 when the output is counts only, 1 otherwise, 2 on set-up failure.
 */
const wf = readFileSync('.github/workflows/live-check.yml', 'utf8').split('\n');
const at = wf.findIndex((l) => /^\s+run: \|\s*$/.test(l));
if (at < 0) {
  console.error('live-check-log-proof ERROR — no `run: |` step in .github/workflows/live-check.yml');
  process.exit(2);
}
const indent = wf[at].search(/\S/);
const body = [];
for (const line of wf.slice(at + 1)) {
  if (line.trim() !== '' && line.search(/\S/) <= indent) break;
  body.push(line.slice(indent + 2));
}
const script = body.join('\n');

const items = [
  { offerId: 'offer-PROOFAAAA1111', productVersionId: 'pv-PROOFBBBB2222', category: 'rayon-PROOFMAISON', available: 4321, videoRef: 'media/vid-PROOFCCCC', assetRefs: ['media/PROOFDDDD-0001', 'media/PROOFEEEE-0002'] },
  { offerId: 'offer-PROOFFFFF3333', productVersionId: 'pv-PROOFGGGG4444', category: 'rayon-PROOFBEAUTE', available: 8765, hiddenReason: 'reason-PROOFHIDDEN', assetRefs: ['media/PROOFHHHH-0003'] },
];
const NEVER = ['PROOFAAAA', 'PROOFBBBB', 'PROOFCCCC', 'PROOFDDDD', 'PROOFEEEE', 'PROOFFFFF', 'PROOFGGGG', 'PROOFHHHH', 'PROOFMAISON', 'PROOFBEAUTE', 'PROOFHIDDEN', '4321', '8765', 'offer-', 'pv-', 'media/'];
const server = createServer((req, res) => {
  if (req.url.startsWith('/offers')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ items }));
    return;
  }
  res.writeHead(req.url.includes('PROOFHHHH') ? 404 : 200);
  res.end('x');
});
await new Promise((ok) => server.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${server.address().port}`;

const r = await new Promise((done) => {
  const child = spawn('bash', ['-c', script], {
    env: { PATH: process.env.PATH, OFFER_BASE: base, MEDIA_BASE: base, OPS_KEY: 'proof-key-not-real' },
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  child.on('close', (exit) => done({ exit, out }));
});
server.close();

const failures = [];
if (r.exit !== 0) failures.push(`the check itself failed (exit ${r.exit}): ${r.out.trim()}`);
const leaked = NEVER.filter((n) => r.out.includes(n));
if (leaked.length > 0) failures.push(`the public log carries ${leaked.join(', ')}:\n      ${r.out.trim().replace(/\n/g, '\n      ')}`);
for (const want of [/products?\D*2\b/i, /photos?\D*3\b/i, /\b404\b/]) {
  if (!want.test(r.out)) failures.push(`the counts are missing (${want}): ${r.out.trim()}`);
}
if (failures.length > 0) {
  console.error(`live-check-log-proof FAILED — ${failures.length} problem(s):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`live-check-log-proof OK — counts only:\n${r.out.trim().replace(/^/gm, '    ')}`);
