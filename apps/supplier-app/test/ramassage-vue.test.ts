import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * RAMASSAGE (founder order 2026-08-09) — the supplier's half of the two-party
 * pickup (Séra SE5): « once the rider arrives to the pickup location, he will
 * give the code to the supplier who will enter it in that screen and if the
 * code matches it shows code confirmé you hand the product over and if code
 * does not match it shows not confirmed do not hand the product. »
 * Source-discipline pins (this repo has no RN renderer), call sites first.
 */

const appDir = join(import.meta.dirname, '..');
const read = (f: string): string => readFileSync(join(appDir, f), 'utf8');

describe('the check stands where the rider stands — on the En route product he just tapped', () => {
  const screen = read('src/commandes/screen.tsx');
  const service = read('src/commandes/sera-service.ts');
  const catalog = JSON.parse(read('i18n/catalog.json')) as { key: string; fr: string }[];

  it('the En route detail MOUNTS the check (call site, not the component existing)', () => {
    const branch = screen.slice(screen.indexOf("etape === 'en_route' ?"), screen.indexOf("etape === 'terminees' ?"));
    expect(branch).toContain('<VerifierRamassage orderId={row.orderId} />');
  });

  it('the verdict names the ACT, from the catalog: remettez / ne remettez pas', () => {
    const confirme = catalog.find((e) => e.key === 'ramassage.confirme');
    const non = catalog.find((e) => e.key === 'ramassage.non_confirme');
    expect(confirme?.fr).toContain('remettre le colis');
    expect(non?.fr).toContain('Ne remettez pas le colis');
    expect(screen).toMatch(/verdict === 'confirme' \? \(\s*<Banner tone="success" check>\{t\('ramassage\.confirme'\)\}<\/Banner>/);
    expect(screen).toMatch(/verdict === 'non_confirme' \? \(\s*<Banner tone="warn">\{t\('ramassage\.non_confirme'\)\}<\/Banner>/);
  });

  it('the port asks the Worker and forwards ONLY a verdict — the expected code exists nowhere on this console', () => {
    expect(service).toContain("'/ops/ramassage/verify'");
    expect(service).toMatch(/verdict: v === 'confirme' \? \('confirme' as const\) : \('non_confirme' as const\)/);
    // no field on this console ever carries the minted code
    expect(service).not.toMatch(/codeRamassage/);
    expect(screen).not.toMatch(/codeRamassage/);
  });

  it('an unreachable Worker is its own honest state — never a fake verdict', () => {
    expect(screen).toMatch(/verdict === 'echec' \? \(\s*<Banner tone="warn">\{t\('confier\.injoignable'\)\}<\/Banner>/);
  });
});
