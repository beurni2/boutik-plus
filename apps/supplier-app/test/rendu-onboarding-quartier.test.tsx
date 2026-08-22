import React, { useCallback, useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { ReactTestInstance } from 'react-test-renderer';
import { mountEcran, type Screen } from './rendu';
import { S34Onboard } from '../src/v2/screens2';
import { initialState, reduce, type A, type S } from '../src/v2/machine';
import { QUARTIERS_OUAGADOUGOU } from '../src/v2/quartiers-ouagadougou';

/**
 * ═══ RENDU-RÉEL — THE ONBOARDING QUARTIER PICKER, DRIVEN ═══
 *
 * QUARTIERS-OUAGA-1 (founder order 2026-08-22): « not all quartiers from
 * Ouagadougou are displayed… put them on boutik+ ». The wizard's « Votre
 * boutique » step now offers the OFFICIAL répertoire (Loi n°066-2009/AN —
 * sourced in quartiers-ouagadougou.ts) as tappable suggestions that narrow as
 * he types — and this walk is the first time S34Onboard has been MOUNTED at
 * all. Its previous proof was a source scan, which is exactly what the
 * 2026-08-10 standing order forbids for a screen.
 *
 * ⚠ NOTHING OF THE APP IS STUBBED. The host below is AppV2's own dispatch
 * wiring in miniature: the REAL `reduce` from machine.ts drives the REAL
 * S34Onboard, so « Continuer » advances because T26 (OB_NEXT) advanced the
 * machine, not because the test said so. The shell's effect runner is not
 * replicated because the wizard's transitions emit no effects — a timer that
 * never exists needs no runner. (AppV2 itself is not mounted here: its import
 * graph drags the studio and the live consoles, which have their own walks.)
 *
 * ⚠ WHAT THIS WALK MAY NEVER CLAIM: appearance. The 44 px chip floor and the
 * pill geometry stay with the layout pins (tap-targets idiom) and his eyes on
 * a real phone — here a chip is only PRESENT, PRESSABLE and WIRED.
 */

function InscriptionHost() {
  const [st, setSt] = useState<S>(() => ({ ...initialState(), view: { s: 'onboard' } }));
  const d = useCallback((a: A) => setSt((prev) => reduce(prev, a).s), []);
  return <S34Onboard st={st} d={d} />;
}

/** The ONE controlled field on the step — the quartier field, by construction:
 *  the other two inputs of « Votre boutique » are defaultValue-only. */
const champQuartier = (screen: Screen): ReactTestInstance => {
  const champs = screen.tree.root
    .findAllByType('TextInput' as never)
    .filter((i) => typeof i.props['onChangeText'] === 'function');
  expect(champs, 'exactly one field on this step accepts typing — the quartier field').toHaveLength(1);
  return champs[0]!;
};

/** Walk the REAL machine to step 2 — two presses of the wizard's own primary
 *  action, not a seeded state, so reaching the picker is itself proven. */
async function ouvrirVotreBoutique(): Promise<Screen> {
  const screen = await mountEcran(<InscriptionHost />);
  expect(screen.shows('Bienvenue sur Boutik+'), 'the wizard did not open on step 1').toBe(true);
  await screen.press('Continuer');
  expect(screen.shows('Votre numéro'), 'step 2 of 5 did not arrive').toBe(true);
  await screen.press('Continuer');
  expect(screen.shows('Votre boutique'), 'the boutique step did not arrive').toBe(true);
  return screen;
}

describe('S34 « Votre boutique » — the official quartier list, offered and usable', () => {
  it('before he types, EVERY official quartier is on screen as a pressable suggestion', async () => {
    const screen = await ouvrirVotreBoutique();

    // The founder's complaint was « not all quartiers are displayed » — so the
    // pin is ALL of them, not a sample: every name in the sourced list is
    // rendered, and the landmark ones are live controls.
    for (const q of QUARTIERS_OUAGADOUGOU) {
      expect(screen.shows(q), `« ${q} » is missing from the suggestions`).toBe(true);
    }
    for (const canari of ['Tampouy', 'Ouaga 2000', 'Rimkièta', 'Kilwin']) {
      expect(screen.canPress(canari), `« ${canari} » is rendered but not pressable`).toBe(true);
    }

    screen.unmount();
  });

  it('typing narrows, a tap fills the field, and the cloud steps aside once it matches', async () => {
    const screen = await ouvrirVotreBoutique();

    // Accent-blind typing, as thumbs actually type it.
    await screen.type('rimkieta', 'Chercher votre quartier');
    expect(screen.shows('Rimkièta'), 'the accent-folded match did not surface').toBe(true);
    expect(screen.shows('Tampouy'), 'the cloud did not narrow — every name is still on screen').toBe(false);

    // The tap is the promise: it FILLS the field (state, not decoration)…
    await screen.press('Rimkièta');
    expect(champQuartier(screen).props['value']).toBe('Rimkièta');
    // …and an exact match collapses the cloud instead of nagging under a
    // settled answer.
    expect(screen.canPress('Rimkièta'), 'the suggestion chip outlived the choice').toBe(false);

    screen.unmount();
  });

  it('a quartier OFF the list stays lawful — free text survives, and « Continuer » still leads out', async () => {
    const screen = await ouvrirVotreBoutique();

    // Villages rattachés and new lotissements exist: the list is comfort,
    // never a gate. No suggestion may swallow or replace his typed truth.
    await screen.type('Zone du Bois', 'Chercher votre quartier');
    expect(screen.texts().length, 'the tree died on a no-match query').toBeGreaterThan(0);
    expect(champQuartier(screen).props['value']).toBe('Zone du Bois');
    expect(screen.shows('Tampouy'), 'a no-match query still shows unrelated suggestions').toBe(false);

    // The four questions end here: he REACHES THE NEXT STEP with his own words.
    expect(screen.canPress('Continuer'), 'the primary action is not pressable').toBe(true);
    await screen.press('Continuer');
    expect(screen.shows('Compte de versement'), 'free text blocked the road to step 4').toBe(true);

    screen.unmount();
  });
});
