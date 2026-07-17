import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JOURNEY } from '../src/journey';

/**
 * WO-FP-BOUTIK — the founder's on-device review (2026-07-14), the six changes as
 * BEHAVIOUR fixtures (red-first where the founder named them). These assert the
 * behaviour, not the frame layout, so the frame-fidelity rebuild cannot regress
 * a dead CTA / a dead row / a recomputed figure silently.
 */

const appDir = join(import.meta.dirname, '..');
const app = readFileSync(join(appDir, 'App.tsx'), 'utf8');

describe('#1 — the primary CTA navigates (no dead button)', () => {
  it('accueil has a journey edge to `nouveau` (the CTA target), so go(nouveau) is not a no-op', () => {
    expect(JOURNEY.accueil.includes('nouveau'), 'accueil → nouveau edge exists').toBe(true);
  });
  it('accueil renders the « Vendre un nouveau produit » CTA that navigates to nouveau', () => {
    // the accueil block wires a PrimaryButton to go('nouveau')
    expect(app).toMatch(/screen === 'accueil'[\s\S]*?card_nouveau'\)\}[\s\S]*?onPress=\{\(\) => go\('nouveau'\)\}/);
  });
});

describe('#3 — échéance rows navigate to the correction flow (a door, never a dead end)', () => {
  it('echeances has a journey edge to `corrective`', () => {
    expect(JOURNEY.echeances.includes('corrective'), 'echeances → corrective edge exists').toBe(true);
  });
  it('the echeances row wires onPress to the correction flow', () => {
    expect(app).toMatch(/screen === 'echeances'[\s\S]*?<ListRow[\s\S]*?onPress=\{\(\) => go\('corrective'\)\}/);
  });
});

describe('#4 — the horloge is removed where the founder named it', () => {
  it('the échéances TAB carries no horloge glyph (forward-name, word-only)', () => {
    expect(app).toMatch(/echeances:\s*'echeances' as unknown as IconName/);
    expect(app).not.toMatch(/echeances:\s*'horloge'/);
  });
  it('the accueil screen (its Échéances entry) renders no horloge icon', () => {
    const accueil = app.slice(app.indexOf("screen === 'accueil' && ("), app.indexOf("screen === 'onboarding' && ("));
    expect(accueil).not.toMatch(/name="horloge"/);
  });
});

describe('#6 — the recette detail renders the VERBATIM read-model figure (B+I-05, never recomputed)', () => {
  it('recettes has a journey edge to `recette`, and `recette` is a declared screen', () => {
    expect(JOURNEY.recettes.includes('recette'), 'recettes → recette edge exists').toBe(true);
    expect(Object.keys(JOURNEY).includes('recette'), 'recette is a journey node').toBe(true);
  });
  it('the recette screen renders formatFcfa over the read-model obligation amount — never a re-sum', () => {
    const detail = app.slice(app.indexOf("screen === 'recette' && ("), app.indexOf("screen === 'recette' && (") + 2800);
    // the figure is money.amount_f with the obligation's own amount, via the frozen formatter
    expect(detail).toMatch(/formatFcfa\(r\.obligation\.amount\)/);
    // it must NOT recompute (no arithmetic on the amount, no computeWaterfall in the detail)
    expect(detail).not.toMatch(/computeWaterfall|\.amount\s*[*+/-]/);
  });
  it('the detail honours the states law: a null selection renders a designed empty state', () => {
    const detail = app.slice(app.indexOf("screen === 'recette' && ("), app.indexOf("screen === 'recette' && (") + 2800);
    expect(detail).toMatch(/selectedReceivable === null \?[\s\S]*?<EmptyState/);
  });
});

describe('#5 — each screen is ONE scroll surface (no bounded middle window)', () => {
  it('the list screens ride ListHeader/ListFooter (chrome scrolls WITH content), not fixed siblings', () => {
    // recettes: the hero ledger is a ListHeaderComponent (scrolls with the list)
    expect(app).toMatch(/screen === 'recettes'[\s\S]*?ListHeaderComponent=\{[\s\S]*?HeroLedgerBand/);
    // echeances + moderation footer buttons ride ListFooterComponent
    expect(app).toMatch(/screen === 'echeances'[\s\S]*?ListFooterComponent=/);
    expect(app).toMatch(/screen === 'moderation'[\s\S]*?ListFooterComponent=/);
  });
  it('scroll screens fill the surface (flex:1) — not a short bounded window', () => {
    expect(app).toMatch(/<ScrollView style=\{styles\.fill\}/);
    expect(app).toMatch(/fill:\s*\{\s*flex:\s*1\s*\}/);
  });
});
