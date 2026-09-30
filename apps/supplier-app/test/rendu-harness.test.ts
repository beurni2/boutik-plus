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
import { substitutsRefuses, wire } from './rendu';

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

const files = [...sources(join(appDir, 'src')), join(appDir, 'App.tsx')];

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
      await appel(`${base.shop}/reseller/codes`);
      expect(substitutsRefuses()).toEqual([expect.stringContaining('shop-plus GET /reseller/codes never answers 404')]);
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
