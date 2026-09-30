import React, { useCallback, useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wire, wiredEnv, type Route, type Screen } from './rendu';
import { act } from 'react-test-renderer';
import { armerManipulateur } from './doubles/expo-image-manipulator';
import { armerLectureDataUri, desarmerLecture } from './doubles/expo-file-system';
import { armerSelecteur, desarmerSelecteur } from './doubles/expo-image-picker';
import { armerPermissionCamera } from './doubles/expo-camera';
import { installerHistorique, retirerHistorique } from './doubles/historique';
import { useCouche } from '../src/ui/retour-web';
import { SListerReal, type ListingSession } from '../src/v2/lister-real';
import { S26StudioReal, type CaptureSet } from '../src/v2/studio-real';
import { SOffreFiche } from '../src/v2/screens1';
import { FicheVideo } from '../src/v2/fiche-video';
import { StudioShoot as StudioShootWeb } from '../src/v2/studio-shoot.web';
import { BtnSoft, C07BtnPrimary } from '../src/v2/components';
import { initialState, reduce, type A, type S } from '../src/v2/machine';
import { bytesToBase64 } from '../src/studio/normalization';
import { t } from '../src/i18n';
import type { SupplierOfferRow } from '../src/supply/service';

/**
 * ═══ RENDU-RÉEL — LISTER-VRAI-1: THE LISTING FLOW SAYS ONLY WHAT IS TRUE ═══
 *
 * AUDIT-B+2 F-45 · F-46 · F-47 · F-48 · F-51 · F-52 · F-98, walked on the real
 * screens. The host below is AppV2's own routing for the two listing views in
 * miniature — the REAL `reduce`, the REAL wizard wrapper (`SListerReal`) on
 * view 'add', the REAL Studio (`S26StudioReal`) on view 'studio', and the
 * shell-held captures and listing session exactly as AppV2 holds them. Only
 * native boundaries are doubled (camera, picker, image library, file read) and
 * only `globalThis.fetch` is faked.
 *
 * ⚠ CONTRACT-CERTIFIED BY HAND. Boutik+'s own offer and media doors are not in
 * the recorded-answers package (it records Shop+ and Séra). So the fakes here
 * mirror the Workers' code as read for this slice: `POST /media` 201
 * `{ref, contentType, width, height, byteLength, thumbToken}`
 * (media-service/worker/index.ts:394), `POST /media/thumb` 201
 * `{status:'stored', for, byteLength}` (:529), and the offer book's create and
 * attach decisions (offer-service/src/offer-core.ts `decideCreateOffer` /
 * `decideAttachAssets`: `idempotent` carries the stored `entry`, attach on an
 * entry that already has photographs is refused `assets_already_present`).
 * The same path is driven against the REAL offer Worker in miniflare by
 * S9e's seam test.
 *
 * ⚠ WHAT THESE WALKS MAY NEVER CLAIM: appearance. Where a walk asks which
 * component renders a control (F-51), it asks for STRUCTURE — the button kind
 * the app chose — never a size or a colour.
 */

const OPS = 'cle-ops-fondateur';
const OPS_SLOT = 'boutik.operateur.cle';
const MOI = 'supplier-founder-001';
const CLE_MEDIA = 'cle-media-upload';

/** A minimal baseline JPEG the app's REAL strip and EXIF check accept. */
const seg = (marker: number, body: readonly number[]): number[] => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
const JPEG = new Uint8Array([
  0xff, 0xd8,
  ...seg(0xdb, [0x00, ...Array.from({ length: 64 }, (_, i) => (i % 16) + 1)]),
  ...seg(0xc0, [8, 0, 16, 0, 16, 1, 0x11, 0]),
  ...seg(0xc4, [0x00, ...Array.from({ length: 16 }, () => 0), 0x05]),
  ...seg(0xda, [1, 0, 0, 0, 63, 0]),
  0x12, 0x34, 0x56,
  0xff, 0xd9,
]);
const PHOTO_URI = `data:image/jpeg;base64,${bytesToBase64(JPEG)}`;
const choix = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ uri: PHOTO_URI, mimeType: 'image/jpeg', fileName: `photo-${i + 1}.jpg` }));

/* ──────────────────────────── the fake doors ──────────────────────────── */

interface Entree {
  readonly createCommandId: string;
  assets?: Record<string, unknown>;
  attachCommandId?: string;
}

/**
 * The offer book, as offer-core decides: create is idempotent on its command
 * id; attach is one-shot, idempotent on ITS command id, refused once
 * photographs are there. `perdre` drops the ANSWER of the next N creates after
 * the book has recorded them — « the request arrived, the answer did not ».
 */
function livre() {
  const entrees = new Map<string, Entree>();
  const route: Route = (path, body, _s, headers) => {
    if (path !== '/offers' && path !== '/offers/assets') return null;
    if (headers['authorization'] !== `Bearer ${OPS}`) return { status: 401, json: { error: 'unauthorized' } };
    if (body === null) return null;
    const offerId = String(body['offerId']);
    const commandId = String(body['commandId']);
    const e = entrees.get(offerId);
    if (path === '/offers') {
      if (e !== undefined) {
        return e.createCommandId === commandId
          ? { status: 200, json: { status: 'idempotent', entry: { ...(e.assets !== undefined ? { assets: e.assets } : {}) } } }
          : { status: 200, json: { status: 'collision', existing: {} } };
      }
      const assets = body['assets'] as Record<string, unknown> | undefined;
      entrees.set(offerId, { createCommandId: commandId, ...(assets !== undefined ? { assets } : {}) });
      return {
        status: 200,
        json: {
          status: 'created',
          entry: { ...(assets !== undefined ? { assets } : {}) },
          preview: { sellerNetFcfa: 11_000, sellerPlatformFeeFcfa: 0 },
        },
      };
    }
    if (e === undefined) return { status: 200, json: { status: 'not_found' } };
    if (e.attachCommandId === commandId) return { status: 200, json: { status: 'idempotent', entry: { assets: e.assets } } };
    if (e.assets !== undefined) return { status: 200, json: { status: 'refused', reason: 'assets_already_present' } };
    e.assets = body['assets'] as Record<string, unknown>;
    e.attachCommandId = commandId;
    return { status: 200, json: { status: 'attached', entry: { assets: e.assets } } };
  };
  return { entrees, route };
}

/** The media Worker's upload and vignette doors. `rater` = the upload
 *  numbers (1-based) this run answers 503 to. */
function media(rater: ReadonlySet<number> = new Set()) {
  let n = 0;
  const route: Route = (path, _b, _s, headers) => {
    if (path !== '/media' && path !== '/media/thumb') return null;
    if (headers['x-write-key'] !== CLE_MEDIA) return { status: 401, json: { error: 'unauthorized' } };
    if (path === '/media/thumb') return { status: 201, json: { status: 'stored', for: 'media/x', byteLength: JPEG.length } };
    n += 1;
    if (rater.has(n)) return { status: 503, json: { error: 'unavailable' } };
    const ref = `media/0f8fad5b-d9cb-469f-a165-${String(n).padStart(12, '0')}`;
    return { status: 201, json: { ref, contentType: 'image/jpeg', width: 16, height: 16, byteLength: JPEG.length, thumbToken: `jeton-${n}` } };
  };
  return { route, envois: () => n };
}

const roster: Route = (path, _b, _s, headers) =>
  path === '/fulfillment/supplier-codes'
    ? headers['authorization'] === `Bearer ${OPS}`
      ? { status: 200, json: { ok: true, codes: [{ supplierId: MOI, mintedAt: '2026-08-01T08:00:00.000Z', revelable: true }] } }
      : { status: 401, json: { error: 'unauthorized' } }
    : null;

/** Lose the answers of the next `n` creates — AFTER the book recorded them. */
function perdreReponses(n: { restant: number }): void {
  const vrai = (globalThis as { fetch: (u: string, i?: RequestInit) => Promise<Response> }).fetch;
  (globalThis as { fetch: unknown }).fetch = async (u: string, i?: RequestInit): Promise<Response> => {
    const r = await vrai(u, i);
    if (new URL(u, 'http://x').pathname === '/offers' && i?.method === 'POST' && n.restant > 0) {
      n.restant -= 1;
      throw new TypeError('Network request failed');
    }
    return r;
  };
}

/* ─────────────────────── the shell in miniature ─────────────────────── */

const etat: { st: S | null } = { st: null };

/** AppV2's routing for view 'add' and view 'studio', its shell-held captures
 *  and listing session, over the REAL reduce. `depart` is where he stands. */
function Coquille({ depart }: { depart: (s: S) => S }) {
  const [st, setSt] = useState<S>(() => depart(reduce(reduce(initialState(), { t: 'BOOT_DONE' }).s, { t: 'OPEN_WIZ' }).s));
  etat.st = st;
  const d = useCallback((a: A) => setSt((prev) => reduce(prev, a).s), []);
  const captures = useRef<CaptureSet | null>(null);
  const session = useRef<ListingSession>({ codeTouched: true, suffixBytes: null, pourFournisseur: '', video: null, roles: null });
  // AppV2's own layer line, word for word: the wizard and the Studio are layers.
  const v = st.view;
  useCouche(v === null ? null : v.s === 'add' ? `add:${st.wiz.step}` : 'studio', () => d({ t: 'BACK' }));
  if (st.view?.s === 'studio') return <S26StudioReal d={d} onApproved={(set) => { captures.current = set; }} />;
  if (st.view?.s === 'add') return <SListerReal st={st} d={d} captures={captures} session={session} />;
  return null;
}

/** He filled steps 0–2: a name, a code, his price and commission. */
const rempli = (s: S): S => ({ ...s, wiz: { ...s.wiz, step: 3, name: 'Sac en raphia', code: 'SAC-RAPH-01', B: 12_000, C: 1_000, stock: 3 } });

const PUBLIER = "Publier — c'est gratuit";
const CONFIRMATION = 'Aucun prix, aucun numéro, aucune enseigne sur les photos';

/** The TextInputs in render order (since F-50 each box is named by its field). */
const champs = (screen: Screen) => screen.tree.root.findAllByType('TextInput' as never);
async function tape(screen: Screen, index: number, value: string): Promise<void> {
  const champ = champs(screen)[index];
  if (champ === undefined) throw new Error(`no TextInput #${index}`);
  const onChangeText = champ.props['onChangeText'] as (v: string) => void;
  await act(async () => { onChangeText(value); });
  await screen.settle();
}

async function pressRetour(screen: Screen): Promise<void> {
  const back = screen.tree.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityLabel'] === 'Retour')[0];
  if (back === undefined) throw new Error('no « Retour »');
  await act(async () => { (back.props['onPress'] as () => void)(); });
  await screen.settle();
}

/** Studio: pick `n` photographs through the real funnel, then approve. */
async function photographier(screen: Screen, n: number): Promise<void> {
  armerSelecteur(choix(n));
  await screen.press(t('studio.depuis_telephone'));
  await screen.settle();
  await screen.press(t('studio.continuer'));
  await screen.settle();
}

beforeEach(() => {
  wiredEnv();
  process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'] = CLE_MEDIA;
  storage({ [OPS_SLOT]: OPS });
  armerManipulateur({ base64: bytesToBase64(JPEG), width: 1280, height: 1280 });
  armerLectureDataUri();
  armerPermissionCamera({ granted: true, canAskAgain: true, status: 'granted' });
  etat.st = null;
});

afterEach(() => {
  delete (globalThis as { fetch?: unknown }).fetch;
  armerManipulateur(null);
  desarmerLecture();
  desarmerSelecteur();
  armerPermissionCamera(null);
});

/* ───────────────────────────── F-98 · F-48 ───────────────────────────── */

describe('PRIX & COMMISSION — he types them himself (F-98), and a box never goes below zero (F-48)', () => {
  it('a new listing opens with BOTH boxes empty; « Continuer » waits, and a calm line says what to type — no warning', async () => {
    wire([roster, livre().route]);
    const screen = await mountEcran(<Coquille depart={(s) => ({ ...s, wiz: { ...s.wiz, step: 2, name: 'Sac', code: 'SAC-1' } })} />);
    const [b, c] = champs(screen);
    expect(b?.props['value'], 'the price box opened on a demo value').toBe('');
    expect(c?.props['value'], 'the commission box opened on a demo value').toBe('');
    expect(screen.canPress('Continuer'), 'an empty price must not go on').toBe(false);
    expect(screen.shows(t('publier.prix_a_saisir'))).toBe(true);
    expect(screen.shows(t('publier.err_prix_plancher')), 'a warning before he typed anything').toBe(false);

    await tape(screen, 0, '12000');
    expect(screen.canPress('Continuer'), 'price alone is not enough — the commission is his to type too').toBe(false);
    await tape(screen, 1, '1000');
    expect(screen.shows('11 000 FCFA'), 'the net he receives, once both are typed').toBe(true);
    expect(screen.canPress('Continuer')).toBe(true);

    // He CLEARS his commission: the box is empty again, never a 0 he did not type (verifier MINOR).
    await tape(screen, 1, '');
    expect(champs(screen)[1]?.props['value'], 'a cleared box came back as a figure').toBe('');
    expect(etat.st?.wiz.C, 'a cleared box became a 0 he never typed').toBeNull();
    expect(screen.canPress('Continuer')).toBe(false);
    screen.unmount();
  });

  it('a commission of 50 and « − » gives 0, never −50, and no false « nombre entier »', async () => {
    wire([roster, livre().route]);
    const screen = await mountEcran(<Coquille depart={(s) => ({ ...s, wiz: { ...s.wiz, step: 2, name: 'Sac', code: 'SAC-1', B: 12_000, C: 50 } })} />);
    await screen.press('−', 1);
    expect(champs(screen)[1]?.props['value']).toBe('0');
    expect(screen.shows(t('publier.err_commission'))).toBe(false);
    expect(etat.st?.wiz.C).toBe(0);
    screen.unmount();
  });
});

/* ───────────────────────────────── F-50 ───────────────────────────────── */

/** Every node carrying this accessible name that a thumb (or a screen reader) can press. */
const parNom = (screen: Screen, nom: string) =>
  screen.tree.root.findAll((n) => typeof n.type === 'string' && typeof n.props['onPress'] === 'function' && n.props['accessibilityLabel'] === nom);

describe('F-50 — a screen reader can name every control of the listing, and the boxes say what they are', () => {
  it('steps 0–2: nothing nameless; the stock and money boxes are named by their field, and so are their − and ＋', async () => {
    wire([roster, livre().route]);
    const screen = await mountEcran(<Coquille depart={(s) => s} />);
    expect(screen.sansNom(), 'step 0').toEqual([]);
    await screen.press('Continuer');
    await screen.type('Sac en raphia', 'Nom du produit');
    expect(screen.sansNom(), 'step 1').toEqual([]);
    for (const b of [t('nav.moins'), t('nav.plus')]) {
      expect(parNom(screen, `${t('publier.ligne_stock')} — ${b}`), `the stock « ${b} » has no name`).toHaveLength(1);
    }
    await screen.press('Continuer');

    // He finds the boxes by the words a screen reader says — the field, never the number in it.
    await screen.type('12000', t('publier.champ_prix'));
    await screen.type('1000', t('publier.ligne_commission'));
    expect(etat.st?.wiz.B).toBe(12_000);
    expect(etat.st?.wiz.C).toBe(1_000);
    for (const champ of [t('publier.champ_prix'), t('publier.ligne_commission')]) {
      for (const b of [t('nav.moins'), t('nav.plus')]) expect(parNom(screen, `${champ} — ${b}`)).toHaveLength(1);
    }
    expect(screen.sansNom(), 'step 2').toEqual([]);
    screen.unmount();
  });

  it('the Studio, the photo step and the recap: every picture he can tap is named; his confirmation says checked or not', async () => {
    wire([roster, livre().route, media().route]);
    const screen = await mountEcran(<Coquille depart={rempli} />);
    await screen.press('Ouvrir Boutik+ Studio');
    armerSelecteur(choix(3));
    await screen.press(t('studio.depuis_telephone'));
    await screen.settle();
    expect(screen.sansNom(), 'the Studio with his three pictures').toEqual([]);
    expect(parNom(screen, t('studio.photo_n').replace('{n}', '1')), 'his first picture has no name').toHaveLength(1);
    // Each « Retirer » says WHICH photo it removes (verifier MINOR).
    expect(parNom(screen, `${t('studio.retirer')} — ${t('studio.photo_n').replace('{n}', '2')}`)).toHaveLength(1);
    await screen.press(t('studio.continuer'));
    await screen.settle();

    expect(screen.sansNom(), 'the photo step').toEqual([]);
    await screen.press('Continuer');
    // The recap is where he gives each photo its role: every picture there is named.
    expect(screen.sansNom(), 'the recap').toEqual([]);
    expect(parNom(screen, t('produits.voir_photo').replace('{nom}', t('publier.role_hero')))).toHaveLength(1);
    const case_ = () => screen.tree.root.findAll((n) => typeof n.type === 'string' && n.props['accessibilityRole'] === 'checkbox')[0];
    expect(case_()?.props['aria-checked'], 'his confirmation must SAY it is not ticked').toBe(false);
    await screen.press(CONFIRMATION);
    expect(case_()?.props['aria-checked'], 'and say it once he ticks it').toBe(true);
    screen.unmount();
  });
});

/* ────────────────────────────── F-46 · F-47 ────────────────────────────── */

describe('PHOTOS — no unchecked promise (F-46), his own confirmation, and « Changer les photos » (F-47)', () => {
  it('step 3 promises no check; after the studio no « sans prix » claim; the recap asks HIM to confirm before « Publier »', async () => {
    const book = livre();
    wire([roster, book.route, media().route]);
    const screen = await mountEcran(<Coquille depart={rempli} />);

    expect(screen.texts().join(' ')).not.toContain('sans prix incrusté');
    await screen.press('Ouvrir Boutik+ Studio');
    await photographier(screen, 3);
    expect(etat.st?.view?.s, 'he is back on his wizard').toBe('add');
    expect(etat.st?.toasts.map((x) => x.m) ?? [], 'no claim that nothing checked').toEqual([]);

    await screen.press('Continuer');
    const lu = screen.texts().join(' ');
    expect(lu).not.toContain('modération');
    expect(lu).not.toContain('sans prix incrusté');
    expect(screen.shows(CONFIRMATION), 'his confirmation line').toBe(true);
    expect(screen.canPress(PUBLIER), '« Publier » before he confirms').toBe(false);

    await screen.press(CONFIRMATION);
    expect(screen.canPress(PUBLIER)).toBe(true);
    await screen.press(PUBLIER);
    await screen.settle();
    expect(screen.shows(t('publier.publie'))).toBe(true);
    const [entree] = [...book.entrees.values()];
    expect(entree?.assets, 'the photographs went live WITH the product').toBeDefined();
    screen.unmount();
  });

  it('after approval « Changer les photos » opens the Studio, and « Retour » brings him back with everything he typed', async () => {
    wire([roster, livre().route, media().route]);
    const screen = await mountEcran(<Coquille depart={rempli} />);
    await screen.press('Ouvrir Boutik+ Studio');
    await photographier(screen, 3);

    expect(screen.canPress(t('publier.photos_changer')), 'a wrong photo must not mean starting over').toBe(true);
    await screen.press(t('publier.photos_changer'));
    expect(etat.st?.view?.s).toBe('studio');
    expect(screen.shows('Boutik+ Studio')).toBe(true);

    await pressRetour(screen);
    expect(etat.st?.view?.s, 'back from the Studio lands on his wizard, not on the home tab').toBe('add');
    expect(etat.st?.wiz).toMatchObject({ step: 3, name: 'Sac en raphia', B: 12_000, C: 1_000, photos: true });
    expect(screen.canPress('Continuer')).toBe(true);
    screen.unmount();
  });
});

/* ───────────────────────────────── F-45 ───────────────────────────────── */

describe('PUBLIER — a lost answer and lost photos are said as they are (F-45)', () => {
  it('(a) the answer is lost: never « Rien n’a été envoyé »; « Réessayer » sends the SAME product and it is not published twice', async () => {
    const book = livre();
    const w = wire([roster, book.route]);
    perdreReponses({ restant: 1 });
    const screen = await mountEcran(<Coquille depart={(s) => ({ ...rempli(s), wiz: { ...rempli(s).wiz, step: 4, photos: true } })} />);
    await screen.press(CONFIRMATION);
    await screen.press(PUBLIER);
    await screen.settle();

    const lu = screen.texts().join(' ');
    expect(lu).not.toContain("Rien n'a été envoyé");
    expect(screen.shows(t('publier.echec_reseau'))).toBe(true);
    await screen.press('Réessayer');
    await screen.settle();
    const envois = w.calls.filter((c) => c.path === '/offers' && c.method === 'POST');
    expect(envois).toHaveLength(2);
    expect(envois[1]?.body?.['offerId']).toBe(envois[0]?.body?.['offerId']);
    expect(book.entrees.size, 'one product in the book, never two').toBe(1);
    expect(screen.shows(t('publier.deja_enregistre'))).toBe(true);
    screen.unmount();
  });

  it('(b) first try: a photo failed and the answer was lost; the retry\'s photos are NOT dropped — « Envoyer les photos » puts them on the product', async () => {
    const book = livre();
    wire([roster, book.route, media(new Set([4])).route]); // the 4th upload (the proof) fails once
    perdreReponses({ restant: 1 });
    const screen = await mountEcran(<Coquille depart={rempli} />);
    await screen.press('Ouvrir Boutik+ Studio');
    await photographier(screen, 3);
    await screen.press('Continuer');
    await screen.press(CONFIRMATION);
    await screen.press(PUBLIER);
    await screen.settle();
    await screen.press('Réessayer');
    await screen.settle();

    expect(screen.shows(t('publier.photos_manquantes')), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    await screen.press(t('publier.photos_action'));
    await screen.settle();
    expect(screen.shows(t('publier.photos_jointes'))).toBe(true);
    const [entree] = [...book.entrees.values()];
    expect(entree?.assets, 'the LEDGER holds the photographs').toBeDefined();
    screen.unmount();
  });

  /**
   * VERIFIER MINOR (LISTER-VRAI-1): « Envoyer les photos » when the product
   * ALREADY carries photographs (attached by an earlier attempt under another
   * command) is refused `assets_already_present` by the book — that is DONE,
   * not a failure; the button must not stay forever.
   */
  it('(b\'\') « Envoyer les photos » finds the product already has its photographs: said as joined, no endless button', async () => {
    const book = livre();
    wire([roster, book.route, media(new Set([4])).route]);
    perdreReponses({ restant: 1 });
    const screen = await mountEcran(<Coquille depart={rempli} />);
    await screen.press('Ouvrir Boutik+ Studio');
    await photographier(screen, 3);
    await screen.press('Continuer');
    await screen.press(CONFIRMATION);
    await screen.press(PUBLIER);
    await screen.settle();
    await screen.press('Réessayer');
    await screen.settle();
    expect(screen.shows(t('publier.photos_manquantes'))).toBe(true);

    // An earlier attempt's attach landed under another command id.
    const [entree] = [...book.entrees.values()];
    entree!.assets = { heroSquare: { ref: 'media/deja-la' } };
    entree!.attachCommandId = 'cmd-une-autre-tentative';
    await screen.press(t('publier.photos_action'));
    await screen.settle();
    expect(screen.shows(t('publier.photos_jointes')), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    expect(screen.canPress(t('publier.photos_action')), 'a button that can only be refused again, forever').toBe(false);
    screen.unmount();
  });

  it('(b\') first try carried the photos and only its answer was lost: the retry does not claim photos are missing', async () => {
    const book = livre();
    wire([roster, book.route, media().route]);
    perdreReponses({ restant: 1 });
    const screen = await mountEcran(<Coquille depart={rempli} />);
    await screen.press('Ouvrir Boutik+ Studio');
    await photographier(screen, 3);
    await screen.press('Continuer');
    await screen.press(CONFIRMATION);
    await screen.press(PUBLIER);
    await screen.settle();
    await screen.press('Réessayer');
    await screen.settle();

    expect(screen.shows(t('publier.deja_enregistre'))).toBe(true);
    expect(screen.shows(t('publier.photos_manquantes'))).toBe(false);
    expect(screen.shows(t('publier.photos_action'))).toBe(false);
    screen.unmount();
  });

  it('(c) a détail photo that did not go is SAID — the product is online with the others', async () => {
    const book = livre();
    wire([roster, book.route, media(new Set([2])).route]); // 4 photos → 2 détails; the second détail fails
    const screen = await mountEcran(<Coquille depart={rempli} />);
    await screen.press('Ouvrir Boutik+ Studio');
    await photographier(screen, 4);
    await screen.press('Continuer');
    await screen.press(CONFIRMATION);
    await screen.press(PUBLIER);
    await screen.settle();

    expect(screen.shows(t('publier.publie'))).toBe(true);
    expect(screen.shows(t('publier.details_perdus_un')), `on screen: ${JSON.stringify(screen.texts())}`).toBe(true);
    const [entree] = [...book.entrees.values()];
    expect((entree?.assets?.['detail'] as unknown[] | undefined)?.length).toBe(1);
    screen.unmount();
  });
});

/* ───────────────────────────────── F-57 ───────────────────────────────── */

describe('PUBLIÉ — the phone\'s Back leaves the result the way its one exit does (F-57)', () => {
  afterEach(() => retirerHistorique());

  it('one Back from « C\'est publié » lands on Produits — never four invisible wizard steps, never out of the page', async () => {
    const nav = installerHistorique();
    wire([roster, livre().route]);
    const screen = await mountEcran(<Coquille depart={(s) => ({ ...rempli(s), wiz: { ...rempli(s).wiz, step: 4, photos: true } })} />);
    await screen.press(CONFIRMATION);
    await screen.press(PUBLIER);
    await screen.settle();
    expect(screen.shows(t('publier.publie'))).toBe(true);
    expect(nav.entrees, 'the wizard and the result pane are two layers').toBe(2);

    nav.retour();
    await screen.settle();
    await screen.settle();
    expect(etat.st?.tab).toBe('produits');
    expect(etat.st?.view).toBeNull();
    expect(nav.sorties).toBe(0);
    screen.unmount();
  });

  /**
   * VERIFIER MINOR (LISTER-VRAI-1): the header's « Retour » on « C'est publié »
   * closes TWO layers at once (the result pane and the wizard). Two history
   * steps in one task is a browser-dependent act — some honour only one, and
   * his next real Back would then do nothing once. One traversal, always.
   */
  it('the header\'s « Retour » on « C\'est publié » steps back ONCE for both layers; his next Back is the browser\'s', async () => {
    const nav = installerHistorique();
    wire([roster, livre().route]);
    const screen = await mountEcran(<Coquille depart={(s) => ({ ...rempli(s), wiz: { ...rempli(s).wiz, step: 4, photos: true } })} />);
    await screen.press(CONFIRMATION);
    await screen.press(PUBLIER);
    await screen.settle();
    expect(nav.entrees, 'the wizard and the result pane are two layers').toBe(2);

    await pressRetour(screen);
    await screen.settle();
    expect(etat.st?.tab).toBe('produits');
    expect(nav.entrees, 'both entries taken back').toBe(0);
    expect(nav.traverseesMultiples, 'two history steps in one task — a browser may honour only one').toBe(0);
    nav.retour();
    await screen.settle();
    expect(nav.sorties, 'his next Back is the browser\'s again, not swallowed').toBe(1);
    screen.unmount();
  });

  /**
   * VERIFIER MAJOR (LISTER-VRAI-1): Back on a FAILED or REFUSED result took
   * him to Produits, and the next « Lister un produit » started from nothing —
   * his name, figures and photographs gone without a word. Back from a result
   * that is not « publié » returns to his wizard, as « Corriger » does; the
   * header's « Retour » does the same (the phone's Back and the app's own back
   * are one act).
   */
  it('Back from a FAILED send (either Back) returns to his wizard with everything he typed — never to Produits', async () => {
    const nav = installerHistorique();
    wire([roster, livre().route]);
    perdreReponses({ restant: 2 });
    const screen = await mountEcran(<Coquille depart={(s) => ({ ...rempli(s), wiz: { ...rempli(s).wiz, step: 4, photos: true } })} />);
    await screen.press(CONFIRMATION);
    await screen.press(PUBLIER);
    await screen.settle();
    expect(screen.shows(t('publier.echec_reseau'))).toBe(true);

    nav.retour();
    await screen.settle();
    await screen.settle();
    expect(etat.st?.view?.s, 'the phone\'s Back left his listing').toBe('add');
    expect(etat.st?.wiz.name).toBe('Sac en raphia');
    expect(etat.st?.wiz.B).toBe(12_000);
    expect(screen.canPress(PUBLIER), 'he is back on his recap, ready to send again').toBe(true);
    expect(nav.sorties).toBe(0);

    await screen.press(PUBLIER);
    await screen.settle();
    expect(screen.shows(t('publier.echec_reseau'))).toBe(true);
    await pressRetour(screen);
    expect(etat.st?.view?.s, 'the header\'s « Retour » left his listing').toBe('add');
    expect(etat.st?.wiz.name).toBe('Sac en raphia');
    screen.unmount();
  });
});

/* ───────────────────────────────── F-52 ───────────────────────────────── */

describe('FICHE — no media address configured (F-52)', () => {
  const ligne: SupplierOfferRow = {
    offerId: 'o-1',
    productVersionId: 'pv-1',
    name: 'Sac en raphia',
    category: 'Sacs',
    basePrice: 12_000,
    resellerCommission: 1_000,
    available: 3,
    assetRefs: ['media/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'media/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
    videoRef: 'media/cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  } as SupplierOfferRow;

  it('photos exist but cannot be fetched: « Photo indisponible », never « Sans photo », and the clip is not pointed at « null/… »', async () => {
    const screen = await mountEcran(<SOffreFiche row={ligne} mediaBase={null} onBack={() => {}} />);
    expect(screen.shows(t('produits.photo_non_configure'))).toBe(true);
    expect(screen.shows(t('produits.sans_photo'))).toBe(false);
    const clip = screen.tree.root.findByType(FicheVideo);
    expect(clip.props['src']).toBeUndefined();
    screen.unmount();
  });
});

/* ───────────────────────────────── F-51 ───────────────────────────────── */

describe('STUDIO (web) — one primary action once enough photos are in (F-51)', () => {
  const monter = (assez: boolean) =>
    mountEcran(
      <StudioShootWeb
        banner={null}
        subtitle=""
        busy={{ current: false }}
        assezDePhotos={assez}
        onPick={() => {}}
        onDropAssets={() => {}}
        onShot={() => {}}
        onFailed={() => {}}
        onBack={() => {}}
      >
        {assez ? <C07BtnPrimary label={t('studio.continuer')} onPress={() => {}} /> : null}
      </StudioShootWeb>,
    );
  const libelles = (screen: Screen, type: unknown): string[] =>
    screen.tree.root.findAllByType(type as never).map((n) => String(n.props['label']));

  it('before three photos, « Choisir des photos » IS the primary action', async () => {
    const screen = await monter(false);
    expect(libelles(screen, C07BtnPrimary)).toEqual([t('studio.depuis_telephone')]);
    screen.unmount();
  });

  it('with enough photos, « Choisir des photos » steps back and « Continuer avec ces photos » is the only primary', async () => {
    const screen = await monter(true);
    expect(libelles(screen, C07BtnPrimary)).toEqual([t('studio.continuer')]);
    expect(libelles(screen, BtnSoft)).toContain(t('studio.depuis_telephone'));
    expect(screen.canPress(t('studio.depuis_telephone')), 'the demoted control still works').toBe(true);
    screen.unmount();
  });
});
