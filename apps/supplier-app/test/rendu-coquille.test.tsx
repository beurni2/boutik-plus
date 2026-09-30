import React, { useState } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Pressable, Text } from 'react-native';
import { mountEcran, storage, wire, wiredEnv, type Route, type Screen } from './rendu';
import { installerHistorique, retirerHistorique, type Navigateur } from './doubles/historique';
import { avecLimite } from '../src/ui/limite-erreur';
import { AppV2 } from '../src/v2/AppV2';
import { SProduitsReal } from '../src/v2/produits-real';
import { initialState } from '../src/v2/machine';
import { t } from '../src/i18n';

/**
 * ═══ RENDU-RÉEL — LISTER-VRAI-1 S9c: THE SHELL ═══
 *
 * AUDIT-B+2 F-56 — a throw during a render shows « Recharger », never a white
 * page; and the harness itself now fails any walk that lands there
 * (`rendu.tsx`), so « did the tree survive the tap » cannot pass by accident.
 *
 * AUDIT-B+2 F-57 — the phone's Back closes the top layer the way the app's
 * own back does, and only at the root does it leave the page. The browser's
 * history is the one host boundary stood in (`doubles/historique.ts`); the
 * console root (`AppV2`) and the Produits screen are the REAL ones.
 *
 * ⚠ WHAT THESE WALKS MAY NEVER CLAIM: appearance.
 */

const OPS = 'cle-ops-fondateur';
const OPS_SLOT = 'boutik.operateur.cle';
const MOI = 'supplier-founder-001';
const REF = 'media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

/** A screen that throws on the tap — the shape of `t()` on a missing key. */
function Boum() {
  const [casse, setCasse] = useState(false);
  if (casse) throw new Error('rendu cassé');
  return (
    <Pressable onPress={() => setCasse(true)} accessibilityRole="button">
      <Text>Déclencher</Text>
    </Pressable>
  );
}
const BoumProtege = avecLimite(Boum);

describe('F-56 — a throw shows « Recharger », never a white page', () => {
  afterEach(() => {
    delete (globalThis as { location?: unknown }).location;
  });

  it('on the web page: the calm screen, and « Recharger » reloads the page', async () => {
    const reloads: number[] = [];
    (globalThis as { location?: unknown }).location = { reload: () => reloads.push(1) };
    const erreurs = console.error;
    console.error = () => {};
    try {
      const screen = await mountEcran(<BoumProtege />, { crashAttendu: true });
      await screen.press('Déclencher');
      expect(screen.shows(t('limite.titre'))).toBe(true);
      expect(screen.shows(t('limite.texte'))).toBe(true);
      expect(screen.canPress(t('limite.recharger'))).toBe(true);
      await screen.press(t('limite.recharger'));
      expect(reloads, '« Recharger » must reload the page').toHaveLength(1);
      screen.unmount();
    } finally {
      console.error = erreurs;
    }
  });

  it('with no page to reload, « Recharger » mounts the app again — he gets his screen back', async () => {
    const erreurs = console.error;
    console.error = () => {};
    try {
      const screen = await mountEcran(<BoumProtege />, { crashAttendu: true });
      await screen.press('Déclencher');
      await screen.press(t('limite.recharger'));
      expect(screen.canPress('Déclencher')).toBe(true);
      expect(screen.shows(t('limite.titre'))).toBe(false);
      screen.unmount();
    } finally {
      console.error = erreurs;
    }
  });

  it('the error is LOGGED — the screen stops, nothing is swallowed', async () => {
    const vus: unknown[][] = [];
    const erreurs = console.error;
    console.error = (...a: unknown[]) => void vus.push(a);
    try {
      const screen = await mountEcran(<BoumProtege />, { crashAttendu: true });
      await screen.press('Déclencher');
      expect(vus.some((a) => a[0] === '[boutik] écran arrêté' && String(a[1]).includes('rendu cassé'))).toBe(true);
      screen.unmount();
    } finally {
      console.error = erreurs;
    }
  });

  it('every page mounts inside it: the entry registers the root THROUGH `avecLimite`', () => {
    const entree = readFileSync(join(import.meta.dirname, '..', 'index.ts'), 'utf8');
    expect(entree).toMatch(/registerRootComponent\(\s*avecLimite\(\s*process\.env\.EXPO_PUBLIC_ROOT === 'fournisseur'/);
  });
});

/* ─────────────────────────────── F-57 ─────────────────────────────── */

let nav: Navigateur;

beforeEach(() => {
  wiredEnv();
  nav = installerHistorique();
});

afterEach(() => {
  retirerHistorique();
  delete (globalThis as { fetch?: unknown }).fetch;
});

async function retour(screen: Screen): Promise<void> {
  nav.retour();
  await screen.settle();
  await screen.settle();
}

describe('F-57 — the phone\'s Back walks back through the wizard, then leaves only from the root', () => {
  it('the REAL console: Back steps the wizard back one step at a time, then closes it; only then does it leave', async () => {
    storage({ [OPS_SLOT]: OPS });
    wire([]);
    const screen = await mountEcran(<AppV2 startView={{ s: 'add' }} />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800)); // his 750 ms boot (F-58, kept by his word)
    });
    await screen.settle();

    expect(screen.shows('Catégorie')).toBe(true);
    expect(nav.entrees, 'the wizard is a layer: one entry').toBe(1);
    await screen.press('Continuer');
    await screen.type('Sac en raphia', 'Nom du produit');
    await screen.press('Continuer');
    expect(screen.shows('Prix & commission')).toBe(true);

    await retour(screen);
    expect(screen.shows('Détails & stock'), 'Back stepped the wizard, it did not leave').toBe(true);
    expect(nav.sorties).toBe(0);
    await retour(screen);
    expect(screen.shows('Catégorie')).toBe(true);
    await retour(screen);
    expect(screen.shows('Nouveau produit'), 'Back from the first step closes the wizard').toBe(false);
    expect(nav.sorties, 'and still has not left the page').toBe(0);
    expect(nav.entrees).toBe(0);

    nav.retour();
    expect(nav.sorties, 'at the root, Back is the browser\'s again').toBe(1);
    screen.unmount();
  });
});

/** His inventory, behind the real door (Bearer = his operator key). */
const catalogue = (rows: Record<string, unknown>[]): Route => (path, _b, _s, headers) => {
  if (!path.startsWith('/offers')) return null;
  if (headers['authorization'] !== `Bearer ${OPS}`) return { status: 401, json: { error: 'unauthorized' } };
  if (path === '/offers/inventaire') return { status: 200, json: { asOf: '2026-09-30T08:00:00.000Z', items: rows as never } };
  if (path === '/offers') return { status: 200, json: { asOf: '2026-09-30T08:00:00.000Z', items: rows as never } };
  return null;
};
const roster: Route = (path) =>
  path === '/fulfillment/supplier-codes'
    ? { status: 200, json: { ok: true, codes: [{ supplierId: MOI, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true }] } }
    : null;

describe('F-57 — a product\'s fiche and its photo viewer are layers too', () => {
  it('Back closes the photo, then the fiche, and he is on his list — never out of the page', async () => {
    storage({ [OPS_SLOT]: OPS });
    wire([
      catalogue([{
        offerId: 'o1', productVersionId: 'pv-o1', name: 'Pagne wax', category: 'Tissus', basePrice: 10_000,
        resellerCommission: 1_000, available: 4, assetRefs: [REF], supplierId: MOI,
      }]),
      roster,
    ]);
    const screen = await mountEcran(
      <SProduitsReal st={initialState()} d={() => {}} supplierId={MOI} cache={{ current: { rows: null, asOf: null } }} />,
    );
    await screen.press('Pagne wax');
    expect(nav.entrees, 'the fiche is a layer').toBe(1);
    const photo = screen.tree.root.findAll((n) => (n.type as unknown) === 'Pressable' && n.props['accessibilityRole'] === 'button' && n.findAllByType('Image' as never).length > 0)[0];
    expect(photo, 'the fiche shows his photograph as a control').toBeDefined();
    await act(async () => { (photo!.props['onPress'] as () => void)(); });
    await screen.settle();
    // The Modal double renders ONLY while visible (its own bound): open = present.
    const ouvert = () => screen.tree.root.findAllByType('Modal' as never).length > 0;
    expect(ouvert(), 'the photo viewer opened').toBe(true);
    expect(nav.entrees).toBe(2);

    await retour(screen);
    expect(ouvert(), 'Back closed the photograph').toBe(false);
    expect(screen.shows('Supprimer ce produit') || screen.shows('Pour supprimer'), 'and only the photograph — the fiche is still here').toBe(true);
    await retour(screen);
    expect(screen.shows('Pagne wax')).toBe(true);
    expect(screen.shows('Pour supprimer'), 'the fiche closed, his list is back').toBe(false);
    expect(nav.entrees).toBe(0);
    expect(nav.sorties).toBe(0);
    screen.unmount();
  });
});
