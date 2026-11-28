import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as double from './doubles/react-native';
import * as svgDouble from './doubles/react-native-svg';
import * as cryptoDouble from './doubles/expo-crypto';
import * as imgDouble from './doubles/expo-image-manipulator';
import * as fsDouble from './doubles/expo-file-system';
import * as fontDouble from './doubles/expo-font';
import * as cameraDouble from './doubles/expo-camera';
import { cheminResolu as cheminSelecteur } from './doubles/expo-image-picker';
import { createRequire } from 'node:module';
import { ENREGISTREMENTS } from '@platform/recorded-answers';
import { createElement, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { mountEcran, substitutsRefuses, wire } from './rendu';
import { avecLimite } from '../src/ui/limite-erreur';
import { metricsActions, stripJpegMetadata } from '../src/studio/normalization';

/**
 * ═══ RENDU-RÉEL — the harness holds ITSELF to the mock-certification law ═══
 *
 * Execution Contract §3, and §9.8 in one line: « a mock that makes integration
 * look healthier than it is is a bug you own. » A render harness is the most
 * dangerous mock in a repo — every screen walk stands on it — so its surface is
 * CHECKED against what the app actually imports, not maintained by hand.
 *
 * Without this, adding `import { SectionList } from 'react-native'` to a screen
 * gives `undefined`, React renders nothing where the list was, and every walk
 * keeps passing over the hole.
 */

const appDir = join(import.meta.dirname, '..');

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = sources(join(appDir, 'src'));

/**
 * ⚠ BOTH QUOTE STYLES, AND THE NON-NAMED FORMS. The rider app paid for this
 * lesson: a single-quote-only regex went green over
 * `import { Modal } from "react-native";` — `Modal` undefined at runtime, the
 * modal rendering as nothing, the sweep's own docblock claiming that could not
 * happen. Namespace imports are swept member by member; a bare default import
 * from anything but the svg module is refused outright as unsweepable.
 */
const NAMED = /import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g;
const WHOLE = /import\s+(?!type\s)(\w+|\*\s+as\s+\w+)\s*(?:,\s*\{[^}]*\})?\s*from\s*['"]([^'"]+)['"]/g;

/**
 * Each doubled module, with the module object the app will actually get.
 *
 * ⚠ THIS LIST MIRRORS `vitest.config.ts` AND NOTHING ELSE. A module the config
 * aliases but this list omits would be swept by nobody; a module this list
 * carries but the config does not alias would be certified against a double
 * the app never receives. Both are lies, so the first test below pins them
 * equal rather than trusting the reader to keep two lists in step.
 */
const DOUBLED: readonly { readonly spec: string; readonly mod: Record<string, unknown> }[] = [
  { spec: 'react-native', mod: double as unknown as Record<string, unknown> },
  { spec: 'react-native-svg', mod: svgDouble as unknown as Record<string, unknown> },
  { spec: 'expo-crypto', mod: cryptoDouble as unknown as Record<string, unknown> },
  { spec: 'expo-image-manipulator', mod: imgDouble as unknown as Record<string, unknown> },
  { spec: 'expo-file-system', mod: fsDouble as unknown as Record<string, unknown> },
  { spec: 'expo-font', mod: fontDouble as unknown as Record<string, unknown> },
  { spec: 'expo-camera', mod: cameraDouble as unknown as Record<string, unknown> },
];

describe('every double is CERTIFIED to what the app imports', () => {
  it('the sweep covers exactly the modules the vitest config aliases', () => {
    const config = readFileSync(join(appDir, 'vitest.config.ts'), 'utf8');
    const aliased = [...config.matchAll(/^\s*'([^']+)': at\(/gm)].map((m) => m[1]);
    expect(aliased.length, 'the alias block is empty or its shape changed').toBeGreaterThan(0);
    expect([...aliased].sort()).toEqual(DOUBLED.map((d) => d.spec).sort());
  });

  it('each named import the app takes from a doubled module exists on that double', () => {
    const missing: string[] = [];
    let seen = 0;
    for (const f of files) {
      const src = readFileSync(f, 'utf8');
      const rel = f.replace(appDir, '.');
      for (const m of src.matchAll(NAMED)) {
        const target = DOUBLED.find((d) => d.spec === m[2]);
        if (target === undefined) continue;
        const typeOnly = /import\s*type\s*\{/.test(m[0]);
        for (const raw of (m[1] ?? '').split(',')) {
          const trimmed = raw.trim();
          if (trimmed === '') continue;
          seen += 1;
          const name = trimmed.replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim();
          // Types vanish at runtime; only values must exist on the double.
          if (typeOnly || trimmed.startsWith('type ')) continue;
          if (!(name in target.mod)) missing.push(`${name} from '${m[2]}' (${rel})`);
        }
      }
      for (const m of src.matchAll(WHOLE)) {
        const target = DOUBLED.find((d) => d.spec === m[2]);
        if (target === undefined) continue;
        const form = (m[1] ?? '').trim();
        const ns = /^\*\s+as\s+(\w+)$/.exec(form);
        if (ns !== null) {
          /**
           * ⚠ A NAMESPACE IMPORT LETS EVERY MEMBER THROUGH UNSWEPT — and this
           * app has four (`import * as Crypto from 'expo-crypto'`). Exempting
           * them would be the sweep excusing its own blind spot, so every
           * `Alias.member` the file actually uses is checked against the
           * double. A new `Crypto.digestString(...)` the double lacks fails
           * HERE rather than arriving as `undefined` inside an upload.
           */
          const used = new RegExp(`\\b${ns[1]}\\.(\\w+)`, 'g');
          let any = false;
          for (const u of src.matchAll(used)) {
            any = true;
            seen += 1;
            const name = u[1]!;
            if (!(name in target.mod)) missing.push(`${ns[1]}.${name} from '${m[2]}' (${rel})`);
          }
          if (!any) missing.push(`namespace import « ${form} » from '${m[2]}' with no readable use (${rel})`);
          continue;
        }
        // A DEFAULT import. `react-native-svg` legitimately has one (the icons
        // import `Svg` that way); anything else is unsweepable and refused.
        if (m[2] !== 'react-native-svg') {
          missing.push(`unsweepable import form « ${form} » from '${m[2]}' (${rel})`);
        }
      }
    }
    expect(seen, 'the sweep found no imports — it has stopped looking').toBeGreaterThan(30);
    expect(missing, 'the app imports these and the doubles do not provide them').toEqual([]);
  });

  it('the svg double keeps its default export — the icons import Svg that way', () => {
    expect((svgDouble as unknown as { default?: unknown }).default).toBeDefined();
  });

  it('the double provides the handlers a control is driven by', () => {
    // The harness presses by `onPress` and types by `onChangeText`; if the host
    // components stopped passing props through, every press would silently do
    // nothing and every walk would still pass.
    expect(typeof double.View).toBe('function');
    expect(typeof double.Pressable).toBe('function');
    expect(typeof double.StyleSheet.create).toBe('function');
    expect(typeof double.Animated.Value).toBe('function');
  });

  it('Modal hides its children when it is not visible', () => {
    // A double that always rendered them would let a walk « find » a control
    // behind a closed overlay — the exact false green this harness exists to
    // stop, one layer down.
    expect(double.Modal({ visible: false, children: 'x' })).toBeNull();
    expect(double.Modal({ visible: true, children: 'x' })).not.toBeNull();
  });

  // ⚠ The marker stays in the comment, never in the title: `no-emoji` scans
  // string literals in app chrome and a test name is one.
  it('and it states its own bound — no walk may claim appearance from it', () => {
    /**
     * The one thing a reader must not do with this harness is trust it about
     * how a screen LOOKS. `StyleSheet.create` is identity and nothing here lays
     * anything out. That bound is written at the top of the double, and this
     * asserts the warning is still there — a bound nobody can read is a bound
     * nobody keeps.
     */
    const src = readFileSync(join(appDir, 'test/doubles/react-native.tsx'), 'utf8');
    expect(src).toContain('IT PROVIDES NOTHING ELSE');
    expect(src).toContain('may NEVER\n *   claim anything about appearance');
  });
});

/**
 * FOURNISSEUR-VRAI-1 — the two stand-ins this slice added, held to the same
 * law: each reaches the app where the app actually looks, and each states what
 * it may never be used to claim.
 */
describe('the picker and font stand-ins are CERTIFIED to where the app looks', () => {
  it('the photo sheet stand-in sits where the app’s own lazy require resolves — a stand-in anywhere else is one the app never meets', () => {
    const appRequire = createRequire(join(appDir, 'src/studio/pick-native.ts'));
    expect(appRequire.resolve('expo-image-picker')).toBe(cheminSelecteur);
    expect(typeof (appRequire('expo-image-picker') as { launchImageLibraryAsync?: unknown }).launchImageLibraryAsync).toBe('function');
  });

  it('the picker source still requires the sheet LAZILY and by that exact name — the stand-in’s whole premise', () => {
    const src = readFileSync(join(appDir, 'src/studio/pick-native.ts'), 'utf8');
    expect(src).toContain("require('expo-image-picker')");
    expect(src).not.toMatch(/^import[^\n]*from 'expo-image-picker'/m);
  });

  it('the font double answers a `.ttf` require with an asset id, never the file parsed as script', () => {
    const r = createRequire(join(appDir, 'src/ui/web-fonts.ts'));
    expect(typeof r('../../assets/fonts/faso-premium/InstrumentSans-Regular.ttf')).toBe('number');
  });

  it('PREUVE-PRETE-1 — the armed file reader reads a `data:` photo byte for byte as the shipped web page does, and still reads nothing else', async () => {
    const photo = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x03, 0x01, 0xff, 0xd9, 0x00, 0x80, 0xfe]);
    const uri = `data:image/jpeg;base64,${Buffer.from(photo).toString('base64')}`;
    // the web build's own reader, over the platform's real fetch
    const { bytesFromUri: web } = await import('../src/supply/uri-bytes.web');
    const parWeb = await web(uri);
    fsDouble.armerLectureDataUri();
    try {
      const parDouble = await new fsDouble.File(uri).bytes();
      expect(parDouble).toEqual(parWeb);
      expect(parDouble).toEqual(photo);
      await expect(new fsDouble.File('file:///DCIM/colis.jpg').bytes()).rejects.toThrow('no file system');
    } finally {
      fsDouble.desarmerLecture();
    }
    await expect(new fsDouble.File(uri).bytes(), 'unarmed, it reads nothing').rejects.toThrow('no file system');
  });

  it('and each states its own bound — no walk may claim a photo was decoded, or a face was shown', () => {
    const picker = readFileSync(join(appDir, 'test/doubles/expo-image-picker.ts'), 'utf8');
    expect(picker).toContain('It decodes nothing and makes no\n *   pixels');
    const font = readFileSync(join(appDir, 'test/doubles/expo-font.ts'), 'utf8');
    expect(font).toContain('IT LOADS NO FONT');
    expect(Object.values(fontDouble.FontDisplay)).toEqual(['auto', 'swap', 'block', 'fallback', 'optional']);
  });
});

/**
 * REPONSES-ENREGISTREES-1 (AUDIT-B+2 F-82) — the harness's check on Shop+ and
 * Séra stand-ins, certified against itself through the REAL `wire()` and a
 * real fetch: a copy the real door never gives is refused, a recorded one
 * passes, and nothing outside those two apps is judged.
 */
describe('a stand-in for Shop+ or Séra may only say what the real door says', () => {
  const base = { shop: 'http://shop.test', sera: 'http://logistics.test' };
  const appel = async (url: string, init?: RequestInit) => (globalThis.fetch as (u: string, i?: RequestInit) => Promise<Response>)(url, init);
  const avec = async (f: () => Promise<void>) => {
    process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'] = base.shop;
    process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'] = base.sera;
    try {
      await f();
    } finally {
      delete process.env['EXPO_PUBLIC_SHOP_CHECKOUT_BASE'];
      delete process.env['EXPO_PUBLIC_SERA_LOGISTICS_BASE'];
      delete (globalThis as { fetch?: unknown }).fetch;
    }
  };

  it('the recordings are there to check against: every door the walks copy is recorded with forms', () => {
    for (const chemin of ['/checkout/dispatch', '/checkout/gains', '/reseller/suivi', '/ops/board', '/ops/task']) {
      expect(ENREGISTREMENTS.find((p) => p.chemin === chemin)?.formes.length ?? 0, chemin).toBeGreaterThan(0);
    }
  });

  it('refuses the copies F-82 found — a rung Shop+ never names, an empty ladder record, a board missing its keys — and names the door', async () => {
    await avec(async () => {
      wire([
        (path) => (path === '/checkout/dispatch/ord-1/refusal' ? { status: 200, json: { ok: true, record: {}, rung: 'standard', escalated: false } } : null),
        (path) => (path === '/ops/board' ? { status: 200, json: { ok: true, board: { queued: [], riders: [], assignments: [] } } } : null),
      ]);
      await appel(`${base.shop}/checkout/dispatch/ord-1/refusal`, { method: 'POST', body: JSON.stringify({ reason: 'change_of_mind' }) });
      await appel(`${base.sera}/ops/board`);
      const refus = substitutsRefuses();
      expect(refus).toHaveLength(2);
      expect(refus[0]).toContain('shop-plus POST /checkout/dispatch/:orderId/refusal never answers 200');
      expect(refus[1]).toContain('sera GET /ops/board never answers 200');
    });
  });

  it('passes a recorded form, and judges the harness’s OWN unrouted answer too — a recorded door is never silently 404', async () => {
    await avec(async () => {
      wire([(path) => (path === '/ops/riders' ? { status: 200, json: { ok: true, riders: [] } } : null)]);
      await appel(`${base.sera}/ops/riders`);
      expect(substitutsRefuses()).toEqual([]);
      await appel(`${base.shop}/reseller/accounts`);
      expect(substitutsRefuses()).toEqual([expect.stringContaining('shop-plus GET /reseller/accounts never answers 404')]);
    });
  });

  it('the end-of-walk check is WIRED: a walk whose every assertion passes still fails on an unreal Shop+ copy', () => {
    let code = 0;
    let sortie = '';
    try {
      sortie = execSync('npx vitest run --config test/fixtures/substitut-irreel/vitest.config.ts', { cwd: appDir, encoding: 'utf8', stdio: 'pipe' });
    } catch (e) {
      const err = e as { status: number; stdout: string; stderr: string };
      code = err.status;
      sortie = `${err.stdout}${err.stderr}`;
    }
    expect(code, sortie).toBe(1);
    expect(sortie).toContain('a stand-in said what the real door never says');
    expect(sortie).toContain('shop-plus POST /checkout/dispatch/:orderId/refusal never answers 200');
  }, 60_000);

  it('leaves alone what is not Shop+ or Séra, and an outage (5xx) — the network’s answer, not the door’s', async () => {
    await avec(async () => {
      wire([
        (path) => (path === '/fulfillment/orders' ? { status: 200, json: { anything: true } } : null),
        (path) => (path === '/checkout/gains' ? { status: 503, json: { ok: false } } : null),
      ]);
      await appel('http://offer.test/fulfillment/orders');
      await appel(`${base.shop}/checkout/gains`);
      // the same path on another origin is not Shop+'s door
      await appel('http://offer.test/checkout/dispatch');
      expect(substitutsRefuses()).toEqual([]);
    });
  });
});

/**
 * LISTER-VRAI-1 (AUDIT-B+2 F-56) — THE HARNESS CERTIFIES ITS OWN CRASH CHECK.
 * With a boundary at the root a throw no longer blanks the tree, so « did the
 * tree survive the tap » would pass over a crash unless the harness looks for
 * the « Recharger » screen itself. This proves that it does.
 */
describe('a walk that crashes into the root boundary FAILS — it never passes over the « Recharger » screen', () => {
  function Boum() {
    const [casse, setCasse] = useState(false);
    if (casse) throw new Error('rendu cassé');
    return createElement(Pressable, { onPress: () => setCasse(true), accessibilityRole: 'button' }, createElement(Text, null, 'Déclencher'));
  }
  const Protege = avecLimite(Boum);

  it('pressing into a throw is reported as a CRASH, loudly', async () => {
    const erreurs = console.error;
    console.error = () => {};
    try {
      const screen = await mountEcran(createElement(Protege));
      await expect(screen.press('Déclencher')).rejects.toThrow(/CRASHED/);
      screen.unmount();
    } finally {
      console.error = erreurs;
    }
  });
});

describe('sansNom — the harness can tell a nameless control from a named one', () => {
  it('reports a button holding only a picture, and not one named by its text or its label', async () => {
    const screen = await mountEcran(
      createElement(
        'View' as never,
        null,
        createElement(Pressable, { onPress: () => {}, accessibilityRole: 'button' }, createElement('Image' as never, { source: { uri: 'x' } })),
        createElement(Pressable, { onPress: () => {}, accessibilityRole: 'button', accessibilityLabel: 'Voir la photo : Héro' }, createElement('Image' as never, { source: { uri: 'y' } })),
        createElement(Pressable, { onPress: () => {}, accessibilityRole: 'button', 'aria-label': 'Fermer' } as never, createElement('Image' as never, { source: { uri: 'z' } })),
        createElement(Pressable, { onPress: () => {}, accessibilityRole: 'button' }, createElement(Text, null, 'Continuer')),
      ),
    );
    const trouves = screen.sansNom();
    expect(trouves, 'the picture-only button must be reported — else every « every control has a name » walk is blind').toHaveLength(1);
    expect(trouves[0]).toMatch(/Pressable.*Image/);
    screen.unmount();
  });
});

/**
 * PHOTOS LÉGÈRES — the image stand-in's MEASURED mode is certified against the
 * one measurement made: a desktop libjpeg-turbo (IJG quality scale, 4:2:0, no
 * Huffman optimisation) over a synthetic photo-like frame, outside this
 * repository. The values below are that measurement — the LARGEST bits per
 * pixel over every geometry each rung meets. The stand-in may be harsher than
 * them, never kinder. A real phone's encoder was not measured.
 */
describe('the image stand-in’s byte bound is never kinder than the measured encoder', () => {
  const MESURE_BPP: Record<number, Record<number, number>> = {
    1280: { 0.8: 0.739, 0.7: 0.5724, 0.6: 0.4755, 0.5: 0.4175 },
    1080: { 0.8: 0.7712, 0.7: 0.6085, 0.6: 0.5093, 0.5: 0.4478 },
    900: { 0.8: 0.8238, 0.7: 0.6587, 0.6: 0.554, 0.5: 0.4883 },
    720: { 0.8: 0.8848, 0.7: 0.7143, 0.6: 0.6071, 0.5: 0.542 },
    320: { 0.8: 1.172, 0.7: 0.9585, 0.6: 0.8184, 0.5: 0.7314 },
    280: { 0.8: 1.2178, 0.7: 0.9995, 0.6: 0.8687, 0.5: 0.7788 },
    240: { 0.8: 1.3409, 0.7: 1.1031, 0.6: 0.9378, 0.5: 0.8309 },
  };
  /** The heaviest measured saves, in bytes, at their own size. */
  const MESURE_OCTETS: readonly [number, number, number, number][] = [
    [1280, 1280, 0.8, 130_477], [1280, 1280, 0.7, 100_522], [1280, 1280, 0.6, 83_817], [1280, 1280, 0.5, 74_109],
    [960, 1280, 0.8, 113_512], [960, 1280, 0.7, 87_921], [960, 1280, 0.6, 73_035], [960, 1280, 0.5, 64_122],
    [320, 320, 0.8, 13_144], [280, 280, 0.8, 10_698], [240, 240, 0.8, 8_452],
  ];

  it('every cell of the bound is at or above the measured value, and every heaviest measured save fits under it', () => {
    expect(Object.keys(imgDouble.BORNE_BPP).map(Number).sort()).toEqual(Object.keys(MESURE_BPP).map(Number).sort());
    for (const [bord, ligne] of Object.entries(MESURE_BPP)) {
      for (const [q, mesure] of Object.entries(ligne)) {
        expect(imgDouble.BORNE_BPP[Number(bord)]![Number(q)], `${bord} px at ${q}`).toBeGreaterThanOrEqual(mesure);
      }
    }
    for (const [w, h, q, octets] of MESURE_OCTETS) {
      expect(imgDouble.octetsBornes(w, h, q), `${w}×${h} at ${q}`).toBeGreaterThanOrEqual(octets);
    }
  });

  it('refuses to be kinder: a density under 1 and a quality nobody measured both throw', () => {
    expect(() => imgDouble.octetsBornes(1280, 960, 0.8, 0.5)).toThrow(/kinder/);
    expect(() => imgDouble.armerManipulateurMesure({ source: { width: 4000, height: 3000 }, densite: 0.9 })).toThrow(/kinder/);
    expect(() => imgDouble.octetsBornes(1280, 960, 0.75)).toThrow(/uncertified/);
    imgDouble.armerManipulateur(null);
  });

  it('its frame is a JPEG the app’s own strip keeps byte for byte, at exactly the length and size it claims', () => {
    const jpeg = imgDouble.jpegDeTaille(1080, 810, 5_000);
    expect(jpeg.byteLength).toBe(5_000);
    expect(stripJpegMetadata(jpeg)).toEqual(jpeg);
    // SOI (2) + DQT (69) → the SOF marker at 71; height at 76-77, width at 78-79.
    expect([jpeg[71], jpeg[72]]).toEqual([0xff, 0xc0]);
    expect([(jpeg[76]! << 8) | jpeg[77]!, (jpeg[78]! << 8) | jpeg[79]!], 'SOF height, width').toEqual([810, 1080]);
  });

  it('between two measured rows it is held to the HEAVIER neighbour, never the lighter one', () => {
    const rangs = Object.keys(imgDouble.BORNE_BPP).map(Number).sort((a, b) => b - a);
    for (const long of [1200, 1000, 800, 500, 300, 260]) {
      const dessus = rangs.filter((e) => e > long).at(-1)!;
      const dessous = rangs.find((e) => e < long)!;
      for (const q of [0.8, 0.7, 0.6, 0.5]) {
        const bpp = Math.max(imgDouble.BORNE_BPP[dessus]![q]!, imgDouble.BORNE_BPP[dessous]![q]!);
        for (const [w, h] of [[long, long], [long, Math.round((long * 3) / 4)], [Math.round((long * 3) / 4), long]] as const) {
          expect(imgDouble.octetsBornes(w, h, q), `${w}×${h} at ${q}, between ${dessus} and ${dessous} px`).toBeGreaterThanOrEqual(Math.ceil((w * h * bpp) / 8));
        }
      }
    }
  });

  it('under its smallest measured row it refuses — except the guidance frame, which never uploads', async () => {
    type Rendu = { saveAsync(o: { compress: number }): Promise<{ base64: string }> };
    type Ctx = { resize(s: { width?: number; height?: number }): Ctx; renderAsync(): Promise<Rendu> };
    const ouvrir = (): Ctx => imgDouble.ImageManipulator.manipulate('file:///maitre.jpg') as unknown as Ctx;
    expect(() => imgDouble.octetsBornes(239, 179, 0.8)).toThrow(/uncertified/);
    expect(() => imgDouble.octetsBornes(200, 200, 0.5)).toThrow(/uncertified/);
    for (const source of [{ width: 4000, height: 3000 }, { width: 3000, height: 4000 }]) {
      imgDouble.armerManipulateurMesure({ source });
      await expect((await ouvrir().resize({ width: 200, height: 150 }).renderAsync()).saveAsync({ compress: 0.8 }), 'a 200 px save').rejects.toThrow(/uncertified/);
      const trame = await (await ouvrir().resize(metricsActions()[0]!.resize).renderAsync()).saveAsync({ compress: 0.8 });
      expect(trame.base64.length, `the guidance frame of a ${source.width}×${source.height} master`).toBeGreaterThan(0);
    }
    imgDouble.armerManipulateur(null);
  });

  it('and it states its own bound — measured on a synthetic frame, not on a phone', () => {
    const src = readFileSync(join(appDir, 'test/doubles/expo-image-manipulator.ts'), 'utf8');
    expect(src).toContain("a real phone's encoder was not measured");
    expect(src).toContain('SYNTHETIC photo-like');
  });
});
