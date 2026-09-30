import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CatalogSchema } from '@platform/i18n';
import { sharedColour } from '@platform/ui-tokens';

// App strings live only in the catalog (Contract §10.5). This test pins the
// shell to that rule; the copy-lint CI gate lints the catalog content itself.

const appDir = join(import.meta.dirname, '..');
const catalog = CatalogSchema.parse(
  JSON.parse(readFileSync(join(appDir, 'i18n/catalog.json'), 'utf8')),
);

describe('supplier-app catalog', () => {
  it('is a valid catalog with register + screenClass on every entry', () => {
    for (const entry of catalog) {
      expect(entry.register).toBeTruthy();
      expect(entry.screenClass).toBeTruthy();
    }
  });

  // AUDIT-B+2 F-60 — the E1 shell this read is retired; the key check now
  // reads every live file (inline French is `i18n-no-inline-strings`' job).
  it('covers every literal key the live code asks for', () => {
    const keys = new Set(catalog.map((e) => e.key));
    const fichiers = (dir: string): string[] =>
      readdirSync(join(appDir, dir), { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? fichiers(`${dir}/${e.name}`) : /\.(ts|tsx)$/.test(e.name) ? [`${dir}/${e.name}`] : [],
      );
    const used = fichiers('src').flatMap((f) =>
      [...readFileSync(join(appDir, f), 'utf8').matchAll(/\bt\('([a-z_]+\.[a-z0-9_.]+)'\)/g)].map((m) => ({ f, key: m[1]! })),
    );
    expect(used.length).toBeGreaterThan(300);
    for (const { f, key } of used) expect(keys.has(key), `${f} asks for ${key}`).toBe(true);
  });

  it('app.json static backgroundColor stays equal to the Faso Premium paper surface (drift guard)', () => {
    // Expo static config cannot import TS tokens; this pins the mirror so it
    // cannot drift silently from the fasoPremium paper token.
    const appConfig = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf8'));
    expect(appConfig.expo.backgroundColor).toBe(sharedColour.paper);
  });
});
