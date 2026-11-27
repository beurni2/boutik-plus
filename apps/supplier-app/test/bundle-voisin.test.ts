import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { voisin } from './bundle-voisin';

/**
 * The cross-repo proofs find a neighbour's Worker bundle through `voisin()`.
 * On a laptop with no neighbour beside the clone they skip, and say why in
 * their title. Under CI they must never skip: a CI run that skipped them
 * would read as proven while it proved nothing. There, the first use of an
 * absent bundle fails with the same reason.
 */

const ENV = 'VOISIN_TEST_REPO';
const DEPOT = { depot: 'voisin-test', env: ENV, service: 'services/s', dist: 'dist/w.mjs', rebuild: 'pnpm bundle' };
const RAISON = /^pas de bundle voisin-test à .*dist\/w\.mjs \(clone voisin-test à côté de ce dépôt ou VOISIN_TEST_REPO, puis pnpm bundle\)$/;

const racine = mkdtempSync(join(tmpdir(), 'voisin-'));
const avant = { ci: process.env['CI'], repo: process.env[ENV] };

/** A neighbour repo with one source file and its bundle, the bundle `ecart` ms newer than the source. */
function depot(nom: string, ecart: number): string {
  const r = join(racine, nom);
  mkdirSync(join(r, 'services/s/src'), { recursive: true });
  mkdirSync(join(r, 'services/s/dist'), { recursive: true });
  writeFileSync(join(r, 'services/s/src/a.ts'), 'export {};\n');
  writeFileSync(join(r, 'services/s/dist/w.mjs'), 'export {};\n');
  const t = Date.now() / 1000;
  utimesSync(join(r, 'services/s/src/a.ts'), t, t);
  utimesSync(join(r, 'services/s/dist/w.mjs'), t + ecart / 1000, t + ecart / 1000);
  return r;
}

function ci(valeur: string | undefined): void {
  if (valeur === undefined) delete process.env['CI'];
  else process.env['CI'] = valeur;
}

afterEach(() => {
  ci(avant.ci);
  if (avant.repo === undefined) delete process.env[ENV];
  else process.env[ENV] = avant.repo;
});
afterAll(() => {
  rmSync(racine, { recursive: true, force: true });
});

describe('a neighbour\'s bundle: a skip with its reason on a laptop, a failure with the same reason under CI', () => {
  it('absent, not under CI: the proof skips, and its title says why', () => {
    process.env[ENV] = join(racine, 'nulle-part');
    for (const valeur of [undefined, '']) {
      ci(valeur);
      const v = voisin(DEPOT);
      expect(v.raisonSaut, `CI=${String(valeur)}`).toMatch(RAISON);
      expect(v.titre('la preuve')).toBe(`la preuve — SAUTÉ : ${v.raisonSaut}`);
    }
  });

  it('absent, under CI: nothing skips, and the first use fails with the same reason', () => {
    process.env[ENV] = join(racine, 'nulle-part');
    ci('true');
    const v = voisin(DEPOT);
    expect(v.raisonSaut, 'under CI a missing neighbour is never a skip').toBeNull();
    expect(v.titre('la preuve'), 'and no title reads as skipped').toBe('la preuve');
    expect(() => v.exigerAJour(), 'the first use fails, naming what is missing and how to get it').toThrow(RAISON);
  });

  it('present and newer than its source: it runs, under CI or not', () => {
    process.env[ENV] = depot('a-jour', 5_000);
    for (const valeur of [undefined, 'true']) {
      ci(valeur);
      const v = voisin(DEPOT);
      expect(v.raisonSaut, `CI=${String(valeur)}`).toBeNull();
      expect(() => v.exigerAJour()).not.toThrow();
    }
  });

  it('present but older than its source: refused, under CI or not', () => {
    process.env[ENV] = depot('perime', -5_000);
    for (const valeur of [undefined, 'true']) {
      ci(valeur);
      const v = voisin(DEPOT);
      expect(v.raisonSaut, `CI=${String(valeur)}`).toBeNull();
      expect(() => v.exigerAJour()).toThrow(/older than its source/);
    }
  });
});
