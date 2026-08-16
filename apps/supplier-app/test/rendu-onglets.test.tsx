import React from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route } from './rendu';
import { FournisseurApp } from '../src/fournisseur/FournisseurApp';

/**
 * ═══ RENDU-RÉEL — THE SUPPLIER CONSOLE'S TAB ROW, DRIVEN ═══
 *
 * FOUNDER, 2026-08-15: « on the suppliers console make the tabs order be
 * (Mes produits, Commandes, En route and Livré) ».
 *
 * ⚠ THIS FILE IS THE FIRST TIME `FournisseurApp` HAS BEEN MOUNTED AT ALL, and
 * it exists because the standing order does not accept a source scan for a
 * screen. The order the supplier reads is the order the `onglets` array is
 * MAPPED in — a fact about the rendered tree, not about the text of a file —
 * and until now nothing in this repo pinned it in either form.
 *
 * ⚠ WHAT IT COST TO MOUNT, recorded so the next person does not re-derive it.
 * The console's import graph reaches the Metro-only Expo runtime twice over:
 * `studio/pick-native.ts` imports `expo-image-manipulator` EAGERLY (its
 * sibling `expo-image-picker` is required lazily, and its docblock explains
 * exactly this hazard for the picker alone), and `supply/uri-bytes.ts` +
 * `offline/expoStore.ts` import `expo-file-system`, whose module scope calls
 * `requireNativeModule('FileSystem')`. Both are now doubled, per the growth
 * rule `vitest.config.ts` already stated for this case. Both doubles THROW
 * rather than fake, so this walk cannot wander into capture or a real byte
 * read and quietly look successful.
 *
 * ⚠ AND ORDER IS NOT APPEARANCE. The harness's bound forbids claiming layout,
 * spacing or size, and nothing here does: « which string the tree renders
 * before which » is the same kind of fact as « is this control pressable ».
 * Where the chips sit on the glass and how wide they are stay with his eyes.
 */

const CODE = 'FOURN-TEST-1';

/** The founder's order, verbatim, as the supplier reads it left to right. */
const ORDRE = ['Mes produits', 'Commandes', 'En route', 'Livré'] as const;

/**
 * His console's reads, answered EMPTY. A tab that reaches its screen and says
 * « nothing here yet » is exactly what proves the chip is wired; inventing
 * rows would only exercise the cards, which have their own tests.
 */
const routes: Route[] = [
  // CONTRACT-CERTIFIED to what `service.ts` actually reads: `listMine` refuses
  // any body without `ok: true` AND an `orders` array, and `listProduits`
  // refuses one without `items` — a friendlier fake would have shown me the
  // « Impossible de joindre le service » screen and called it an empty state.
  (path) => (path === '/fulfillment/mine' ? { status: 200, json: { ok: true, orders: [] } } : null),
  (path) => (path === '/offers/mine' ? { status: 200, json: { items: [] } } : null),
];

beforeEach(() => {
  wiredEnv();
  // His door is already open — the code is on the device, as after one sign-in.
  storage({ 'boutik.fournisseur.code': CODE });
  wire(routes);
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

describe('ONGLETS-FOURNISSEUR — the four tabs, in the founder’s order', () => {
  it('the row reads « Mes produits · Commandes · En route · Livré », in that order', async () => {
    const screen = await mountEcran(<FournisseurApp />);

    // Every tab is on the row at all — an empty row would let the ordering
    // assertion below pass over nothing.
    for (const label of ORDRE) {
      expect(screen.shows(label), `« ${label} » is not on the row at all`).toBe(true);
    }

    /**
     * THE ORDER ITSELF, read off the tree. `texts()` is in render order, so the
     * positions of the four labels within it are the positions he reads them
     * in. Compared as a SEQUENCE so a failure prints the row he would actually
     * see rather than one index.
     */
    const textes = screen.texts();
    const lus = [...ORDRE]
      .map((l) => ({ l, at: textes.findIndex((t) => t === l) }))
      .sort((a, b) => a.at - b.at)
      .map((x) => x.l);
    expect(lus, `the row reads ${JSON.stringify(lus)}`).toEqual([...ORDRE]);

    screen.unmount();
  });

  it('every tab is pressable and reaches its OWN screen — the reorder moved nothing dead', async () => {
    /**
     * A reorder that left a chip wired to the wrong pane keeps the order
     * assertion above green. So each tab is PRESSED and asked for the sentence
     * only its own screen says — the standing order's four questions, on the
     * one screen this app had never mounted.
     *
     * ⚠ THE LANDING TAB IS PRESSED LAST, AND THAT ORDER IS THE WHOLE POINT.
     * The console opens on « Mes produits », so pressing it FIRST would prove
     * nothing — « it reached its own screen » is satisfied by the screen that
     * was already there, and a chip whose `onPress` did nothing at all would
     * sail through. Starting on a different tab makes every press below a real
     * TRANSITION, including the one back onto the landing tab.
     */
    const screen = await mountEcran(<FournisseurApp />);

    const attendu: readonly (readonly [string, string])[] = [
      ['Commandes', "Aucune commande pour l'instant"],
      ['En route', 'Aucun colis en route'],
      ['Livré', "Aucune livraison terminée pour l'instant"],
      ['Mes produits', 'C’est l’équipe Boutik+ qui ajoute vos produits'],
    ];

    for (const [label, sien] of attendu) {
      expect(screen.canPress(label), `« ${label} » is on the row but not pressable`).toBe(true);
      await screen.press(label);
      await screen.settle();
      // 1. the tree survived the tap — a throw here blanks his whole console
      expect(screen.texts().length, `the tree died on « ${label} »`).toBeGreaterThan(0);
      // 2. the tap REACHED that tab's own screen, not merely any screen
      expect(screen.shows(sien), `« ${label} » did not open its own screen`).toBe(true);
      // 3. …and the row survives, so he can leave the tab he just opened
      for (const autre of ORDRE) {
        expect(screen.shows(autre), `« ${autre} » left the row on « ${label} »`).toBe(true);
      }
    }

    screen.unmount();
  });

  it('the console OPENS on « Mes produits » — the first chip is the one he lands on', async () => {
    /**
     * ⚠ INVERTED ON THE FOUNDER'S WORD (2026-08-15): « i want the console to be
     * opening on Mes produits ». This test previously pinned the opposite.
     *
     * I had kept the landing on « Commandes » deliberately — he had asked for
     * an order, not a landing screen, and moving his work off the opening
     * screen was not mine to decide. He has now decided it, so the pin flips
     * rather than being deleted: which tab the console opens on is a real
     * product choice, and the next reorder must not be able to move it by
     * accident either way.
     *
     * Driven rather than read, because the landing is what the FIRST RENDER
     * shows — not what a `useState` line says.
     */
    const screen = await mountEcran(<FournisseurApp />);
    expect(
      screen.shows('C’est l’équipe Boutik+ qui ajoute vos produits'),
      `the console did not open on Mes produits — on screen: ${JSON.stringify(screen.texts())}`,
    ).toBe(true);
    // …and it must NOT be showing the commandes pane underneath.
    expect(screen.shows("Aucune commande pour l'instant"), 'both panes rendered at once').toBe(false);

    /**
     * AND THE ROW AGREES WITH THE PANE. A console that opens on his products
     * while the row highlights « Commandes » would tell him two different
     * things at once — the exact mismatch the old landing left behind, and the
     * reason he asked for this. `active` is a PROP the app computed, not a
     * rendered pixel: no appearance is claimed.
     */
    const { ChipCategory } = await import('../src/v2/components');
    const chips = screen.tree.root.findAllByType(ChipCategory);
    // The ACTIVE chip only — the row's ORDER is the first test's job, and
    // asserting it again here would make a test named for the landing go red
    // on a pure reorder.
    expect(
      chips.filter((c) => c.props['active'] === true).map((c) => c.props['label']),
      'exactly one chip is active on open, and it is the one he lands on',
    ).toEqual(['Mes produits']);

    screen.unmount();
  });
});
