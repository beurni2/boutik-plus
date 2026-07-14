import { readFileSync } from 'node:fs';
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

  it('covers every key the shell uses', () => {
    const keys = new Set(catalog.map((e) => e.key));
    const appSource = readFileSync(join(appDir, 'App.tsx'), 'utf8');
    const usedKeys = [...appSource.matchAll(/t\('([^']+)'\)/g)].map((m) => m[1]);
    expect(usedKeys.length).toBeGreaterThan(0);
    for (const key of usedKeys) {
      expect(keys.has(key ?? '')).toBe(true);
    }
  });

  it('the shell has no inline French user-facing strings (accented literals) in component code', () => {
    const appSource = readFileSync(join(appDir, 'App.tsx'), 'utf8');
    const codeOnly = appSource.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(codeOnly).not.toMatch(/['"«][^'"»]*[àâçéèêëîïôùûüÀÂÇÉÈÊËÎÏÔÙÛÜ]/);
  });

  it('app.json static backgroundColor stays equal to the Faso Premium paper surface (drift guard)', () => {
    // Expo static config cannot import TS tokens; this pins the mirror so it
    // cannot drift silently from the fasoPremium paper token.
    const appConfig = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf8'));
    expect(appConfig.expo.backgroundColor).toBe(sharedColour.paper);
  });
});
