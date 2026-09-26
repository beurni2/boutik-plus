import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * FOURNISSEUR-VRAI-1 (AUDIT-B+2 F-30; verifier minor 7) — both web pages are
 * French. Expo builds each page from `public/index.html` when one exists,
 * filling `%LANG_ISO_CODE%` from app.json `web.lang` (default « en ») and
 * `%WEB_TITLE%` from the app name. Measured once on a real export
 * (`<html lang="fr">`, the French noscript line); pinned here so the next
 * change to either file cannot quietly bring the English page back.
 *
 * The noscript sentence is the one user-facing string outside the catalog:
 * it is read only when the app's JavaScript — the catalog included — cannot
 * run at all. Journalled as the one Law-6 exception of this slice.
 */
const appDir = join(import.meta.dirname, '..');
const app = JSON.parse(readFileSync(join(appDir, 'app.json'), 'utf8')) as { expo: { web?: { lang?: string } } };
const page = readFileSync(join(appDir, 'public/index.html'), 'utf8');

describe('the web page speaks French (F-30)', () => {
  it('app.json declares the page French', () => {
    expect(app.expo.web?.lang).toBe('fr');
  });

  it('the template keeps Expo\'s placeholders, the root and the reset — only the words a person reads changed', () => {
    expect(page).toContain('<html lang="%LANG_ISO_CODE%">');
    expect(page).toContain('<title>%WEB_TITLE%</title>');
    expect(page).toContain('<div id="root"></div>');
    expect(page).toContain('<style id="expo-reset">');
  });

  it('the no-JavaScript line is French, and the English one is gone', () => {
    expect(page.replace(/\s+/g, ' ')).toContain(
      '<noscript> Boutik+ a besoin de JavaScript. Activez-le dans votre navigateur, puis rechargez la page. </noscript>',
    );
    expect(page).not.toContain('You need to enable JavaScript');
  });
});
