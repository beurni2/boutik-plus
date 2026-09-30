import React, { useCallback, useRef, useState } from 'react';
import { act } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route, type Screen } from './rendu';
import { SListerReal, type ListingSession } from '../src/v2/lister-real';
import type { CaptureSet } from '../src/v2/studio-real';
import { initialState, reduce, type A, type S } from '../src/v2/machine';
import { RAYONS, detailsParDefaut } from '../src/v2/categorie-details';
import { t } from '../src/i18n';

/**
 * ═══ RENDU-RÉEL — THE LISTING WIZARD'S RAYONS AND DETAILS, DRIVEN ═══
 *
 * RAYONS-1 (founder order 2026-08-23): « the categories and the details &
 * stocks are not really professional and well structured like a real listing
 * screens of multi-diverse products ». The category step became an aisled
 * picker and « Détails & stock » asks each category its OWN questions — and
 * this walk is the first time S20Wizard has been MOUNTED at all: its previous
 * proof was `authoring-screen.test.ts`, whose own header says it has no RN
 * renderer.
 *
 * ⚠ NOTHING OF THE APP IS STUBBED. The host is the shell's dispatch wiring in
 * miniature: the REAL `reduce` drives the REAL wizard wrapper `SListerReal`,
 * which computes the money line itself. (LISTER-VRAI-1, AUDIT-B+2 F-15: this
 * host used to mount S20Wizard bare and recompute the money line on its own,
 * mapping every refusal to one key the real screen does not use — a copy of
 * the app inside the test. It is gone.) STUDIO_APPROVE is dispatched as the
 * studio's own outcome action: the studio is a sibling VIEW with its own
 * walks; its boundary with the wizard is that action. « Publier » itself is
 * pressed against the real product service by `rendu-lister-publier.e2e`.
 *
 * ⚠ WHAT THIS WALK MAY NEVER CLAIM: appearance. Chip geometry, spacing and
 * the shelf layout stay with the layout pins and his eyes on a real phone —
 * here a control is only PRESENT, PRESSABLE and WIRED.
 */

let dExterne: ((a: A) => void) | null = null;

const OPS = 'cle-ops-fondateur';
/** His roster, as the real door answers it — the wrapper reads it to offer « pour qui ». */
const roster: Route = (path, _b, _s, headers) =>
  path === '/fulfillment/supplier-codes'
    ? headers['authorization'] === `Bearer ${OPS}`
      ? { status: 200, json: { ok: true, codes: [{ supplierId: 'supplier-founder-001', mintedAt: '2026-08-01T08:00:00.000Z', revelable: true }] } }
      : { status: 401, json: { error: 'unauthorized' } }
    : null;

beforeEach(() => {
  wiredEnv();
  storage({ 'boutik.operateur.cle': OPS });
  wire([roster]);
});
afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
});

function WizardHost() {
  const [st, setSt] = useState<S>(() => reduce(initialState(), { t: 'OPEN_WIZ' }).s);
  const d = useCallback((a: A) => setSt((prev) => reduce(prev, a).s), []);
  dExterne = d;
  const captures = useRef<CaptureSet | null>(null);
  const session = useRef<ListingSession>({ codeTouched: false, suffixBytes: null, pourFournisseur: '', video: null, roles: null });
  return <SListerReal st={st} d={d} captures={captures} session={session} />;
}

/** The wizard's TextInputs in render order — step 1 renders Nom, Code, then
 *  one field per detail question. Positional on purpose: the fields carry no
 *  placeholder, and the ORDER is itself part of what the walk pins. */
async function tape(screen: Screen, index: number, value: string): Promise<void> {
  const champs = screen.tree.root.findAllByType('TextInput' as never);
  const champ = champs[index];
  if (champ === undefined) throw new Error(`no TextInput #${index} (there are ${champs.length})`);
  const onChangeText = champ.props['onChangeText'] as ((v: string) => void) | undefined;
  if (typeof onChangeText !== 'function') throw new Error(`TextInput #${index} does not accept typing`);
  await act(async () => {
    onChangeText(value);
  });
  await screen.settle();
}

/** The header's back is ICON-ONLY (BackBtn) — carrying `accessibilityLabel`
 *  « Retour » and no text, so the harness's text press cannot see it. Found by
 *  that label and pressed for real; a missing onPress still throws. */
async function pressRetour(screen: Screen): Promise<void> {
  const back = screen.tree.root.findAll(
    (n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === 'Retour',
  )[0];
  if (back === undefined) throw new Error('no control labelled « Retour » (accessibilityLabel)');
  const onPress = back.props['onPress'] as (() => void) | undefined;
  if (typeof onPress !== 'function') throw new Error('« Retour » is on screen but has NO onPress');
  await act(async () => {
    onPress();
  });
  await screen.settle();
}

describe('S20 — the aisled category picker', () => {
  it('every rayon is a shelf on screen, and EVERY category on it is a pressable chip', async () => {
    const screen = await mountEcran(<WizardHost />);
    expect(screen.shows('Catégorie'), 'the wizard did not open on the picker').toBe(true);

    for (const r of RAYONS) {
      expect(screen.shows(r.titre), `shelf missing: « ${r.titre} »`).toBe(true);
      for (const c of r.categories) {
        expect(screen.canPress(c), `« ${c} » is not a pressable chip`).toBe(true);
      }
    }

    screen.unmount();
  });
});

describe('S20 — a car seat listing, end to end through the machine', () => {
  it('pick « Siège auto » → its OWN three questions → answers → photos → the recap details every answer', async () => {
    const screen = await mountEcran(<WizardHost />);

    // The aisle tap IS the selection — and Continuer leads out.
    await screen.press('Siège auto');
    await screen.press('Continuer');
    expect(screen.shows('Détails & stock'), 'step 2 did not arrive').toBe(true);
    // The screen says WHICH product type it is asking about…
    expect(screen.shows('Siège auto')).toBe(true);
    // …and asks the category's own questions, not « Tailles » and not the
    // generic « Variantes ».
    for (const label of [t('publier.champ_age_poids'), t('publier.champ_marque'), t('publier.champ_couleurs')]) {
      expect(screen.shows(label), `question missing: « ${label} »`).toBe(true);
    }
    expect(screen.shows(t('publier.variantes_tailles'))).toBe(false);

    // Nom (0) · Code (1) · the three detail questions (2..4), in render order.
    await tape(screen, 0, 'Siège auto Chicco 0+');
    await tape(screen, 2, '0-13 kg');
    await tape(screen, 4, 'gris, rose');

    await screen.press('Continuer');
    expect(screen.shows('Prix & commission'), 'the money step did not arrive').toBe(true);
    // LISTER-VRAI-1 (F-98): the boxes open empty — he types his own figures.
    expect(screen.canPress('Continuer'), 'no price typed yet').toBe(false);
    await tape(screen, 0, '25000');
    await tape(screen, 1, '2000');
    await screen.press('Continuer');
    expect(screen.shows('Photos — Studio'), 'the photos step did not arrive').toBe(true);

    // The studio is a sibling view with its own suites — its outcome action
    // is the boundary, dispatched exactly as S26Studio dispatches it.
    expect(screen.canPress('Ouvrir Boutik+ Studio'), 'the studio door is not pressable').toBe(true);
    await act(async () => {
      dExterne!({ t: 'STUDIO_APPROVE' });
    });
    await screen.settle();

    await screen.press('Continuer');
    expect(screen.shows('Vérifiez, puis publiez'), 'the recap did not arrive').toBe(true);

    // « Everything well detailed »: one labelled row PER answer, plus the
    // untouched middle question shown honestly as « — ».
    expect(screen.shows('Siège auto Chicco 0+')).toBe(true);
    expect(screen.shows(t('publier.champ_age_poids'))).toBe(true);
    expect(screen.shows('0-13 kg')).toBe(true);
    expect(screen.shows(t('publier.champ_marque'))).toBe(true);
    expect(screen.shows(t('publier.champ_couleurs'))).toBe(true);
    expect(screen.shows('gris, rose')).toBe(true);
    expect(screen.shows('—')).toBe(true);

    // The primary action is ON SCREEN. Pressing it is not this walk's to
    // prove: `rendu-lister-publier.e2e` presses it against the real product
    // service and asks the ledger (AUDIT-B+2 F-15).
    expect(screen.shows("Publier — c'est gratuit")).toBe(true);

    screen.unmount();
  });

  it('switching aisle mid-listing swaps the questions — untouched defaults never leak across', async () => {
    const screen = await mountEcran(<WizardHost />);

    // Default category is Mode femme (clothing) — its one question, pre-filled.
    await screen.press('Continuer');
    expect(screen.shows(t('publier.variantes_tailles'))).toBe(true);
    const avant = screen.tree.root.findAllByType('TextInput' as never);
    expect(avant).toHaveLength(2 + detailsParDefaut('Mode femme').length);

    // Back to the aisles, over to a crib: dimensions and material now, and
    // clothing's « S, M, L » pre-fill did NOT ride along.
    await pressRetour(screen);
    await screen.press('Lit à barreaux');
    await screen.press('Continuer');
    expect(screen.shows(t('publier.champ_dimensions'))).toBe(true);
    expect(screen.shows(t('publier.champ_matiere'))).toBe(true);
    expect(screen.shows(t('publier.variantes_tailles'))).toBe(false);
    const champs = screen.tree.root.findAllByType('TextInput' as never);
    expect(champs).toHaveLength(4); // Nom · Code · the crib's two questions
    expect((champs[2]!.props as { value?: string }).value ?? '').toBe('');
    expect((champs[3]!.props as { value?: string }).value ?? '').toBe('');

    screen.unmount();
  });
});
