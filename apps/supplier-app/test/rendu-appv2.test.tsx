import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react-test-renderer';
import { mountEcran, storage, wire, wiredEnv, type Screen } from './rendu';
import { AppV2 } from '../src/v2/AppV2';

/**
 * ═══ RENDU-RÉEL — the console's frame, driven (AUDIT-B+2 F-60, F-81) ═══
 *
 * The E1 root is retired: AppV2 is now the ONLY app root (`index.ts`), and it
 * had no walk of its own — every walk mounted one screen, none the shell that
 * routes between them. This walk mounts the REAL shell, waits out its boot
 * timer, and presses the Dock.
 *
 * The four questions: the tree survives the boot and every tab · the home's
 * primary action and each Dock tab are present, pressable and wired (the
 * screen changes) · a screen that needs his key says where to put it and
 * offers the way there · he reaches the next screen — including the
 * Opérations door, which a fresh device does not show until he is sent to it.
 *
 * Bound: nothing here claims how anything LOOKS.
 */

const DOCK = ['Accueil', 'Produits', 'Commandes', 'Gains'] as const;

beforeEach(() => {
  wiredEnv();
  storage({});
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

/** The shell boots on a real ¾ s timer (§4.3 boot 750) before the Dock shows. */
async function demarrer(): Promise<Screen> {
  const screen = await mountEcran(<AppV2 />);
  await act(async () => { await new Promise((r) => setTimeout(r, 900)); });
  await screen.settle();
  return screen;
}

describe('F-60 · F-81 — the one root boots, and its Dock leads everywhere', () => {
  it('boot → home with its primary action; each Dock tab reaches its own screen and back', async () => {
    const w = wire([]);
    const screen = await demarrer();
    expect(screen.canPress('Vendre un nouveau produit'), 'the home and its one primary action').toBe(true);
    for (const tab of DOCK) expect(screen.canPress(tab), `the Dock carries « ${tab} »`).toBe(true);
    expect(screen.shows('Opérations') && screen.canPress('Opérations'), 'a fresh device shows no operator tab').toBe(false);

    await screen.press('Produits');
    expect(screen.canPress('Ouvrir Opérations'), 'Produits says where his key goes, and offers the way').toBe(true);
    await screen.press('Commandes');
    expect(screen.shows('Votre clé d’opérateur'), 'Commandes opens on its key door').toBe(true);
    await screen.press('Gains');
    expect(screen.shows('Vos gains')).toBe(true);
    await screen.press('Accueil');
    expect(screen.canPress('Vendre un nouveau produit'), 'back home, the tree intact').toBe(true);
    expect(w.calls, 'no key on this device: nothing is asked of any service').toEqual([]);
    screen.unmount();
  });

  it('« Ouvrir Opérations » reaches the key door, and the Opérations tab stays in the Dock', async () => {
    wire([]);
    const screen = await demarrer();
    await screen.press('Produits');
    await screen.press('Ouvrir Opérations');
    expect(screen.canPress('Ouvrir les opérations'), 'he stands at the key door').toBe(true);
    expect(screen.canPress('Opérations'), 'the tab is in the Dock now').toBe(true);
    await screen.press('Accueil');
    expect(screen.canPress('Opérations'), 'and it does not vanish when he leaves it').toBe(true);
    screen.unmount();
  });

  it('« Vendre un nouveau produit » opens the new product, says his key comes first, and lets him leave', async () => {
    wire([]);
    const screen = await demarrer();
    await screen.press('Vendre un nouveau produit');
    expect(screen.shows('Nouveau produit')).toBe(true);
    expect(screen.canPress('Ouvrir Opérations'), 'the way to his key is offered').toBe(true);
    expect(screen.canPress('Accueil'), 'the wizard hides the Dock').toBe(false);
    await screen.press('Terminer');
    expect(screen.canPress('Accueil'), 'leaving the wizard brings the Dock back').toBe(true);
    screen.unmount();
  });
});
