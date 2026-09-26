#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { inflateRawSync } from 'node:zlib';

/**
 * CI gate: secret-scan (SCAN-SECRETS-1 — AUDIT-B+2 F-18).
 *
 * Execution Contract E0 exit: « security baseline (dependency + secret
 * scanning in CI …) written and enforced ». The only secret gate here was
 * no-expo-token-leak: it knew EXPO_TOKEN alone and never opened 395 of the
 * tracked files — every .txt, .log, .diff, .html, .toml and zip, both
 * wrangler.toml among them, whose [vars] must never hold a secret. This one
 * reads EVERY tracked file that is text, and every text member of every
 * tracked zip (review packets are committed on purpose; nothing is excluded
 * by path, `_review/` included). It refuses:
 *
 *   1. a literal value assigned to a credential name — anything ending in
 *      _SECRET, _TOKEN, _WRITE_KEY, _REVOKE_KEY, _OPS_KEY or _API_KEY, plus
 *      VERIFIED_SUPPLIERS — in any `NAME=value`, `NAME: value` or
 *      `"NAME": "value"` form. In code files only a QUOTED value counts (an
 *      unquoted one is a variable); elsewhere an unquoted one counts too. A
 *      `$…`/`${{ … }}` reference, another variable's NAME, or a value shorter
 *      than 8 characters is not a value;
 *   2. a SECRET/TOKEN/KEY name under [vars] in a wrangler.toml, whatever its
 *      value — [vars] is committed and published;
 *   3. a GitHub token (ghp_…, gho_…, ghs_…, github_pat_…);
 *   4. a PRIVATE KEY block.
 *
 * A hit is EXCUSED only when its value EXACTLY equals a value planted by the
 * Expo gate's own negative fixtures (read from those files at run time, so an
 * echo of a planted value in a review log is recognised and nothing else is),
 * or one of the exact values in gates/secret-scan-excused.json — each with
 * where it lives and why it is not a secret, so every addition is reviewed —
 * or when it is a test placeholder: `test-…`, `gate-…`, `fixture-…`. Never a
 * pattern, never a path: a real secret matches none of these. The gate never prints a value it found — only its
 * first four characters and its length — because CI logs are public.
 *
 * Usage: secret-scan.mjs [path…]   (default: every tracked file, git ls-files)
 * Exit 0 clean · 1 a secret-shaped value found · 2 could not run.
 */
const CODE = /\.(m?[jt]sx?|cjs|json|html)$/;
const NAME = /\b([A-Z][A-Z0-9_]*(?:_SECRET|_TOKEN|_WRITE_KEY|_REVOKE_KEY|_OPS_KEY|_API_KEY)|VERIFIED_SUPPLIERS)\b/;
const ASSIGN = new RegExp(
  String.raw`["']?` + NAME.source + String.raw`["']?\s*(?::|=|\?\?=)\s*(?:(["'\`])([^"'\`\n]*)\2|([^\s"'\`,;)}\]]+))`,
  'g',
);
const GITHUB = /\b(?:gh[pous]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g;
const PRIVATE = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const PLACEHOLDER = /^(?:test|gate|fixture)-/;
const PLANTS_DIR = 'gates/fixtures/negative/no-expo-token-leak';
const EXCUSED_FILE = 'gates/secret-scan-excused.json';

const mask = (v) => `${v.slice(0, 4)}… (${v.length} chars)`;

function isValue(raw, quoted, codeFile) {
  if (raw === undefined) return false;
  const v = raw.trim();
  if (codeFile && !quoted) return false;
  if (v.length < 8 || /\s/.test(v)) return false; // a credential has no space in it
  if (/^\$/.test(v) || v.includes('${{') || /^(?:secrets|env|vars|process\.env)\./.test(v)) return false;
  if (/^[A-Z][A-Z0-9_]*$/.test(v)) return false; // another variable's NAME, not a value
  if (/^<[^>]*>$/.test(v) || /^\.{3}$/.test(v)) return false; // documentation placeholder
  return true;
}

function findings(text, codeFile) {
  const out = [];
  const lines = text.split('\n');
  let inVars = false;
  lines.forEach((line, i) => {
    const section = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (section) inVars = section[1].trim() === 'vars';
    if (inVars && /^\s*[A-Za-z0-9_]*(SECRET|TOKEN|KEY)[A-Za-z0-9_]*\s*=/.test(line)) {
      out.push({ line: i + 1, what: `a credential name under [vars] (committed and published): ${line.trim().split('=')[0].trim()}` });
    }
    for (const m of line.matchAll(ASSIGN)) {
      // `${NAME:?…}` / `${NAME:-…}` is a shell expansion OF the variable, never a value given to it.
      if (line.slice(Math.max(0, m.index - 2), m.index) === '${') continue;
      const quoted = m[2] !== undefined;
      const value = quoted ? m[3] : m[4];
      if (isValue(value, quoted, codeFile)) out.push({ line: i + 1, name: m[1], value: value.trim() });
    }
    for (const m of line.matchAll(GITHUB)) out.push({ line: i + 1, name: 'GitHub token', value: m[0] });
    if (PRIVATE.test(line)) out.push({ line: i + 1, what: 'a PRIVATE KEY block' });
  });
  return out;
}

const isBinary = (buf) => buf.subarray(0, 8192).includes(0);

/** The text members of a zip, read with no dependency: central directory → inflate. */
function zipMembers(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('no end-of-central-directory record');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const members = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry');
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataAt, dataAt + size);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) data = inflateRawSync(raw);
    else throw new Error(`member ${name} uses compression method ${method}`);
    members.push({ name, data });
  }
  return members;
}

function walk(p) {
  const st = statSync(p);
  if (!st.isDirectory()) return [p];
  return readdirSync(p).flatMap((e) => walk(join(p, e)));
}

let targets;
try {
  targets = process.argv.length > 2
    ? process.argv.slice(2).flatMap(walk)
    : execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean)
        // this gate's own negative fixtures are scanned alone by the board, never in the positive run
        .filter((f) => !f.startsWith('gates/fixtures/negative/secret-scan/'));
} catch (err) {
  console.error(`secret-scan ERROR — could not list files: ${String(err)}`);
  process.exit(2);
}
if (targets.length === 0) {
  console.error('secret-scan ERROR — nothing to scan; refusing to pass on silence');
  process.exit(2);
}

const planted = new Set();
try {
  for (const f of walk(PLANTS_DIR)) {
    for (const h of findings(readFileSync(f, 'utf8'), false)) if (h.value) planted.add(h.value);
  }
} catch (err) {
  console.error(`secret-scan ERROR — cannot read the planted values under ${PLANTS_DIR}: ${String(err)}`);
  process.exit(2);
}
if (planted.size === 0) {
  console.error(`secret-scan ERROR — no planted value found under ${PLANTS_DIR}; the excusal list would be empty by accident`);
  process.exit(2);
}
try {
  const listed = JSON.parse(readFileSync(EXCUSED_FILE, 'utf8'));
  for (const e of listed) {
    if (typeof e?.value !== 'string' || typeof e?.why !== 'string' || e.why.trim() === '') throw new Error('every entry needs a value and a why');
    planted.add(e.value);
  }
} catch (err) {
  console.error(`secret-scan ERROR — cannot read ${EXCUSED_FILE}: ${String(err)}`);
  process.exit(2);
}

let files = 0;
let members = 0;
let excused = 0;
const refused = [];
const scan = (label, text, codeFile) => {
  for (const h of findings(text, codeFile)) {
    if (h.value !== undefined && (planted.has(h.value) || PLACEHOLDER.test(h.value))) { excused++; continue; }
    refused.push(h.value !== undefined ? `${label}:${h.line} ${h.name} = ${mask(h.value)}` : `${label}:${h.line} ${h.what}`);
  }
};
for (const f of targets) {
  let buf;
  try { buf = readFileSync(f); } catch { continue; } // deleted in the working tree
  const label = relative('.', f);
  if (/\.zip$/i.test(f)) {
    let list;
    try { list = zipMembers(buf); } catch (err) {
      console.error(`secret-scan ERROR — cannot open ${label}: ${String(err)}`);
      process.exit(2);
    }
    files++;
    for (const m of list) {
      if (isBinary(m.data)) continue;
      members++;
      scan(`${label}!${m.name}`, m.data.toString('utf8'), CODE.test(m.name));
    }
    continue;
  }
  if (isBinary(buf)) continue;
  files++;
  scan(label, buf.toString('utf8'), CODE.test(f));
}

if (refused.length > 0) {
  console.error(`secret-scan FAILED — ${refused.length} secret-shaped value(s) (values masked):`);
  for (const r of refused) console.error(`  - ${r}`);
  process.exit(1);
}
console.log(`secret-scan OK — ${files} text file(s) and ${members} zip member(s) read; no credential value, no [vars] secret, no GitHub token, no private key (${excused} planted fixture value(s) or test placeholder(s) recognised)`);
