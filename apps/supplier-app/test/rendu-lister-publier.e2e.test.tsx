import React, { useCallback, useRef, useState } from 'react';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { act } from 'react-test-renderer';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mountEcran, storage, wiredEnv, type Screen } from './rendu';
import { armerManipulateur } from './doubles/expo-image-manipulator';
import { armerLectureDataUri, desarmerLecture } from './doubles/expo-file-system';
import { armerSelecteur, desarmerSelecteur } from './doubles/expo-image-picker';
import { armerPermissionCamera } from './doubles/expo-camera';
import { SListerReal, type ListingSession } from '../src/v2/lister-real';
import { S26StudioReal, type CaptureSet } from '../src/v2/studio-real';
import { initialState, reduce, type A, type S } from '../src/v2/machine';
import { resolveOperationsService } from '../src/operations/service';
import { SUPPLIER_ID } from '../src/supply/service';
import { bytesToBase64 } from '../src/studio/normalization';
import { t } from '../src/i18n';

/**
 * ═══ THE SEAM — LISTER-VRAI-1 (AUDIT-B+2 F-15): « PUBLIER » PRESSED FOR REAL ═══
 *
 * Before this, no test mounted the wizard's real wrapper and pressed its
 * primary action against the real product service. Changing ONE prop
 * (`d={dd}` → `d={d}` in `lister-real.tsx`) sent « Publier » to the machine's
 * demo branch — nothing written, a toast saying the product is live — and the
 * whole board stayed green (the audit measured it).
 *
 * This walk closes that. The host is AppV2's own routing for the two listing
 * views in miniature (the REAL `reduce`, the REAL `SListerReal` on view 'add',
 * the REAL `S26StudioReal` on view 'studio', the shell-held captures and
 * listing session exactly as AppV2 holds them). He fills every step by the
 * words on the screen, photographs through the real Studio, ticks his
 * confirmation and presses « Publier ». Every call goes to the BUILT offer and
 * media Workers in miniflare, and the outcome is asked of the LEDGER — the
 * offer Worker's own inventory and the media Worker's own storage — never
 * taken from the screen or the answer the app got.
 *
 * Only native boundaries are doubled (camera permission, picker, image
 * library, file read). No app code is stubbed.
 *
 * ⚠ IT FAILS, NEVER SKIPS, when miniflare or a bundle is missing: `pretest`
 * builds both bundles, and the first test says which one is absent.
 *
 * ⚠ WHAT IT MAY NEVER CLAIM: appearance.
 */

const OFFER_BUNDLE = fileURLToPath(new URL('../../../services/offer-service/dist/worker/worker.mjs', import.meta.url));
const MEDIA_BUNDLE = fileURLToPath(new URL('../../../services/media-service/dist/worker/worker.mjs', import.meta.url));
const compat = (svc: string): string => {
  const toml = readFileSync(fileURLToPath(new URL(`../../../services/${svc}/wrangler.toml`, import.meta.url)), 'utf8');
  const found = /^compatibility_date\s*=\s*"([^"]+)"/m.exec(toml);
  if (found === null) throw new Error(`${svc} wrangler.toml has no compatibility_date`);
  return found[1]!;
};

type MiniflareCtor = new (opts: Record<string, unknown>) => {
  dispatchFetch(url: string, init?: unknown): Promise<Response>;
  dispose(): Promise<void>;
};
const Miniflare = ((): MiniflareCtor | null => {
  try {
    const req = createRequire(fileURLToPath(new URL('../../../services/offer-service/package.json', import.meta.url)));
    return (req('miniflare') as { Miniflare: MiniflareCtor }).Miniflare;
  } catch {
    return null;
  }
})();

const OPS = 'seam-ops-secret-lister';
const OPS_SLOT = 'boutik.operateur.cle';
const MEDIA_WRITE = 'seam-media-write-lister';
const REVOKE = 'seam-media-revoke-lister';

/**
 * A baseline JPEG the app's real strip accepts AND the media Worker stores:
 * 256 × 256 sits inside both of its bounds — a photograph (200…2048) and a
 * vignette (32…320) — because the image-library double hands back the same
 * bytes for both.
 */
const seg = (marker: number, body: readonly number[]): number[] => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
const JPEG = new Uint8Array([
  0xff, 0xd8,
  ...seg(0xdb, [0x00, ...Array.from({ length: 64 }, (_, i) => (i % 16) + 1)]),
  ...seg(0xc0, [8, 1, 0, 1, 0, 1, 0x11, 0]),
  ...seg(0xc4, [0x00, ...Array.from({ length: 16 }, () => 0), 0x05]),
  ...seg(0xda, [1, 0, 0, 0, 63, 0]),
  0x12, 0x34, 0x56,
  0xff, 0xd9,
]);
const PHOTO_URI = `data:image/jpeg;base64,${bytesToBase64(JPEG)}`;
const choix = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ uri: PHOTO_URI, mimeType: 'image/jpeg', fileName: `photo-${i + 1}.jpg` }));

let offre!: InstanceType<MiniflareCtor>;
let media!: InstanceType<MiniflareCtor>;
const dirs: string[] = [];
const previous = globalThis.fetch;
/** Every call the app made, in order — what went on the wire, not what it meant to send. */
const appels: { method: string; path: string; body: Record<string, unknown> | null }[] = [];

beforeAll(() => {
  if (Miniflare === null || !existsSync(OFFER_BUNDLE) || !existsSync(MEDIA_BUNDLE)) return;
  const d1 = mkdtempSync(join(tmpdir(), 'lister-seam-offre-'));
  const d2 = mkdtempSync(join(tmpdir(), 'lister-seam-media-'));
  dirs.push(d1, d2);
  offre = new Miniflare({
    modules: [{ type: 'ESModule', path: 'offer.mjs', contents: readFileSync(OFFER_BUNDLE, 'utf8') }],
    compatibilityDate: compat('offer-service'),
    durableObjects: { OFFER: 'OfferDO', FULFILLMENT: 'FulfillmentDO' },
    durableObjectsPersist: d1,
    bindings: { FULFILLMENT_OPS_SECRET: OPS },
  });
  media = new Miniflare({
    modules: [{ type: 'ESModule', path: 'media.mjs', contents: readFileSync(MEDIA_BUNDLE, 'utf8') }],
    compatibilityDate: compat('media-service'),
    r2Buckets: { BUCKET: 'lister-seam-bucket' },
    r2Persist: d2,
    bindings: { MEDIA_WRITE_SECRET: MEDIA_WRITE, MEDIA_REVOKE_SECRET: REVOKE },
  });
});

afterAll(async () => {
  globalThis.fetch = previous;
  await offre?.dispose();
  await media?.dispose();
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

beforeEach(() => {
  wiredEnv(); // offer at http://offer.test, media at http://media.test
  process.env['EXPO_PUBLIC_MEDIA_WRITE_KEY'] = MEDIA_WRITE;
  storage({ [OPS_SLOT]: OPS });
  appels.length = 0;
  // NOT A FAKE: every call is ROUTED to the real Worker its host names.
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = new URL(String(url));
    const brut = typeof init?.body === 'string' ? init.body : null;
    let body: Record<string, unknown> | null = null;
    try { body = brut === null ? null : (JSON.parse(brut) as Record<string, unknown>); } catch { body = null; }
    appels.push({ method: init?.method ?? 'GET', path: u.pathname, body });
    if (u.host === 'media.test') return media.dispatchFetch(`http://media${u.pathname}${u.search}`, init as never);
    if (u.host === 'offer.test') return offre.dispatchFetch(`http://offer${u.pathname}${u.search}`, init as never);
    throw new Error(`the listing called a host it has no business calling: ${u.host}`);
  }) as unknown as typeof globalThis.fetch;
  armerManipulateur({ base64: bytesToBase64(JPEG), width: 1280, height: 1280 });
  armerLectureDataUri();
  armerPermissionCamera({ granted: true, canAskAgain: true, status: 'granted' });
});

afterEach(() => {
  armerManipulateur(null);
  desarmerLecture();
  desarmerSelecteur();
  armerPermissionCamera(null);
});

/* ─────────────────────── the shell in miniature ─────────────────────── */

const etat: { st: S | null } = { st: null };

function Coquille() {
  const [st, setSt] = useState<S>(() => reduce(reduce(initialState(), { t: 'BOOT_DONE' }).s, { t: 'OPEN_WIZ' }).s);
  etat.st = st;
  const d = useCallback((a: A) => setSt((prev) => reduce(prev, a).s), []);
  const captures = useRef<CaptureSet | null>(null);
  const session = useRef<ListingSession>({ codeTouched: false, suffixBytes: null, pourFournisseur: '', video: null, roles: null });
  if (st.view?.s === 'studio') return <S26StudioReal d={d} onApproved={(set) => { captures.current = set; }} />;
  if (st.view?.s === 'add') return <SListerReal st={st} d={d} captures={captures} session={session} />;
  return null;
}

/** Real I/O runs outside React's microtasks: wait, inside act, until it lands. */
async function attendre(screen: Screen, fait: () => boolean, quoi: string): Promise<void> {
  for (let i = 0; i < 200 && !fait(); i += 1) {
    await act(async () => { await new Promise((r) => setTimeout(r, 25)); });
    await screen.settle();
  }
  expect(fait(), `${quoi} never happened. On screen: ${JSON.stringify(screen.texts())}`).toBe(true);
}

/** The LEDGER: what the offer Worker itself holds, read with his key. */
async function inventaire(): Promise<{ offerId: string; supplierId: string; name: string; assetRefs: string[]; basePrice: number; resellerCommission: number }[]> {
  const res = await offre.dispatchFetch('http://offer/offers/inventaire', { headers: { Authorization: `Bearer ${OPS}` } });
  expect(res.status).toBe(200);
  return ((await res.json()) as { items: never[] }).items;
}

const NOM = 'Sac en raphia tressé';
const PUBLIER = "Publier — c'est gratuit";
const CONFIRMATION = t('publier.photos_confirmation');

describe('F-15 — « Publier » on the real wizard reaches the real product service, and the LEDGER holds what he typed', () => {
  it('the seam is RUNNABLE — miniflare resolved and both bundles are built', () => {
    expect(Miniflare, 'miniflare must resolve from services/offer-service').not.toBeNull();
    expect(existsSync(OFFER_BUNDLE), `run pnpm --filter @boutik/offer-service bundle:worker — missing ${OFFER_BUNDLE}`).toBe(true);
    expect(existsSync(MEDIA_BUNDLE), `run pnpm --filter @boutik/media-service bundle:worker — missing ${MEDIA_BUNDLE}`).toBe(true);
  });

  it('every step by its words → Studio → confirm → « Publier »: one POST /offers carrying his name, the offer Worker holds it with its photographs, the media Worker holds each, and no demo toast', async () => {
    // His own code on the real door, so the listing can be for him.
    const code = await resolveOperationsService()!.mintCode(OPS, SUPPLIER_ID);
    expect(code.ok, JSON.stringify(code)).toBe(true);
    appels.length = 0;

    const screen = await mountEcran(<Coquille />);
    await screen.press('Continuer'); // the first rayon's first category
    await screen.type(NOM, t('publier.champ_nom'));
    await screen.press('Continuer');
    await screen.type('12000', t('publier.champ_prix'));
    await screen.type('1000', t('publier.ligne_commission'));
    await attendre(screen, () => screen.canPress('Continuer'), '« Continuer » after his figures');
    await screen.press('Continuer');

    await screen.press(t('publier.ouvrir_studio'));
    armerSelecteur(choix(3));
    await screen.press(t('studio.depuis_telephone'));
    await attendre(screen, () => screen.canPress(t('studio.continuer')), 'the Studio taking his three photos');
    await screen.press(t('studio.continuer'));
    await attendre(screen, () => etat.st?.view?.s === 'add', 'the Studio handing his photos back');
    await screen.press('Continuer');

    expect(screen.canPress(PUBLIER), '« Publier » before he confirmed').toBe(false);
    await screen.press(CONFIRMATION);
    expect(screen.canPress(PUBLIER), 'the primary action is not pressable').toBe(true);
    await screen.press(PUBLIER);
    await attendre(screen, () => screen.shows(t('publier.publie')), '« C’est publié »');

    // What went on the wire: ONE create, carrying the name he typed and his figures.
    const creations = appels.filter((a) => a.method === 'POST' && a.path === '/offers');
    expect(creations, '« Publier » sent no create — it reached something else').toHaveLength(1);
    const corps = creations[0]!.body as { product?: { name?: string; supplierId?: string }; draft?: { basePrice?: number; resellerCommission?: number }; assets?: unknown };
    expect(corps.product?.name).toBe(NOM);
    expect(corps.product?.supplierId).toBe(SUPPLIER_ID);
    expect(corps.draft?.basePrice).toBe(12_000);
    expect(corps.draft?.resellerCommission).toBe(1_000);
    expect(corps.assets, 'the create carried no photographs').toBeDefined();

    // The LEDGER, not the screen: the offer Worker holds it, for him, with photographs.
    const ligne = (await inventaire()).find((r) => r.name === NOM);
    expect(ligne, 'the offer Worker holds no such product').toBeDefined();
    expect(ligne!.supplierId).toBe(SUPPLIER_ID);
    expect(ligne!.basePrice).toBe(12_000);
    expect(ligne!.resellerCommission).toBe(1_000);
    expect(ligne!.assetRefs.length, 'the product went live without its photographs').toBeGreaterThanOrEqual(3);
    // …and every photograph it names is really stored by the media Worker.
    for (const ref of ligne!.assetRefs.filter((r) => !r.startsWith('private/'))) {
      expect((await media.dispatchFetch(`http://media/${ref}`)).status, `${ref} is not stored`).toBe(200);
    }

    // The demo branch never ran: no demo toast, no demo product.
    expect(etat.st?.toasts ?? [], 'a demo toast').toEqual([]);
    expect(Object.keys(etat.st?.products ?? {}).filter((k) => k.startsWith('np')), 'the demo publish ran').toEqual([]);
    expect(screen.texts().join(' ')).not.toMatch(/modération/i);
    screen.unmount();
  }, 30_000);

  /** The complement the audit named: the one prop that routes the tap. */
  it('the wizard is handed the INTERCEPTING dispatcher', () => {
    const src = readFileSync(fileURLToPath(new URL('../src/v2/lister-real.tsx', import.meta.url)), 'utf8');
    expect(src.match(/<S20Wizard\b[^>]*?\bd=\{dd\}/gs), '« Publier » would reach the demo branch').toHaveLength(1);
    expect(src).not.toMatch(/<S20Wizard\b[^>]*?\bd=\{d\}/s);
  });
});
