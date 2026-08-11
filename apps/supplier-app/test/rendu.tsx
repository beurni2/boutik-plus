import React from 'react';
import { act, create, type ReactTestRenderer, type ReactTestInstance } from 'react-test-renderer';
import { expect } from 'vitest';

/**
 * ═══ RENDU-RÉEL (Boutik+) — mount his real console screen and USE it ═══
 *
 * FOUNDER STANDING ORDER (2026-08-10) — « THE SCREEN IS DRIVEN, NEVER ONLY
 * READ », which names this app explicitly: « Where no harness exists yet
 * (Boutik+ supplier app, Shop+ buyer PWA, the Séra dispatch console): the first
 * slice that touches a screen there BUILDS the equivalent, or says plainly in
 * the report that it did not and why. »
 *
 * ⚠ WHAT THIS IS FOR, IN ONE LINE: every screen in this app was proven by
 * READING it — `authoring-screen.test.ts` states « this suite has no RN
 * renderer » in its own header — so a screen that renders and cannot be used
 * was invisible here exactly as it was in the rider app, where three such bugs
 * shipped in one day.
 *
 * ⚠ AND IT DRIVES THE REAL PORTS. Nothing of the app is stubbed: the screens,
 * `operations/service.ts`'s bounded row parser, the view decisions and the
 * catalog are all the shipped files. The ONLY things faked are
 * `globalThis.fetch` and `localStorage` — both native/host boundaries — so a
 * walk exercises screen → state → port → wire → parse → screen, which is every
 * layer above the Worker. (The Worker is the seam tests' job, in
 * `services/offer-service/test`.)
 *
 * ⚠ WHAT IT MAY NEVER CLAIM: appearance. See the bound stated in
 * `test/doubles/react-native.tsx` — there is no layout and no colour here.
 * `faso-contrast.test.ts` and `pixel-property-diff.test.ts` keep that job.
 */

/** One scripted answer. `handler` sees the path and the parsed body. */
/**
 * One scripted answer. `search` is the QUERY STRING, and it is not decoration:
 * this app's admin list is `GET /offers?supplierId=…`, so a fake that ignored
 * the scope would answer the same rows for every supplier — and a walk written
 * on it would go green over a screen that reads the wrong scope, or no scope at
 * all. That happened here: an INVENTAIRE-COMPLET mutation stayed green until
 * the fake started honouring it.
 */
export type Route = (
  path: string,
  body: Record<string, unknown> | null,
  search: URLSearchParams,
  headers: Record<string, string>,
) => { status: number; json: Record<string, unknown> } | null;

export interface Wire {
  /**
   * Every request the app made, in order — the record a test asks « was this
   * port actually CALLED », which is the question source scans cannot answer.
   *
   * HEADERS ARE RECORDED (verifier BLOCKER). Without them no walk in this app
   * could assert a CREDENTIAL, so a port sending the wrong header name, the
   * wrong scheme, or the bundled write key where the founder's ops key belongs
   * would leave every suite green while his screen silently fell back to a
   * poorer read in production — the very symptom the slice was fixing.
   */
  readonly calls: {
    path: string;
    method: string;
    body: Record<string, unknown> | null;
    headers: Record<string, string>;
  }[];
}

/**
 * Install a fake `fetch` built from routes. Anything unrouted answers 404 and
 * is RECORDED — an unexpected call is a finding, never a silent pass.
 */
export function wire(routes: readonly Route[]): Wire {
  const calls: Wire['calls'] = [];
  const fake = async (input: string, init?: RequestInit): Promise<Response> => {
    const url = new URL(input, 'http://boutik.test');
    const path = url.pathname;
    const raw = init?.body;
    const body = typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : null;
    const headers: Record<string, string> = {};
    for (const [k, v] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[k.toLowerCase()] = v;
    }
    calls.push({ path, method: init?.method ?? 'GET', body, headers });
    for (const r of routes) {
      const answer = r(path, body, url.searchParams, headers);
      if (answer !== null) {
        return new Response(JSON.stringify(answer.json), {
          status: answer.status,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }
    return new Response(JSON.stringify({ error: 'no_route', path }), { status: 404 });
  };
  (globalThis as { fetch: unknown }).fetch = fake;
  return { calls };
}

/**
 * The founder's own browser storage — a HOST boundary, doubled because the ops
 * key lives there and nowhere else (`readStoredOpsKey`). In-memory, cleared per
 * install, so one walk's key can never leak into the next.
 */
export function storage(seed: Readonly<Record<string, string>> = {}): Map<string, string> {
  const map = new Map<string, string>(Object.entries(seed));
  (globalThis as { localStorage: unknown }).localStorage = {
    getItem: (k: string): string | null => map.get(k) ?? null,
    setItem: (k: string, v: string): void => void map.set(k, v),
    removeItem: (k: string): void => void map.delete(k),
    clear: (): void => map.clear(),
  };
  return map;
}

/**
 * The env a WIRED build reads. The ports resolve to `null` when these are
 * unset — the app's standing « unset resolves to nothing, never to demo » law
 * — so a walk that forgot this would mount the honest not-connected screen and
 * prove nothing about the real one.
 */
export function wiredEnv(): void {
  process.env['EXPO_PUBLIC_OFFER_BASE'] = 'http://offer.test';
  // The supply port needs BOTH (`resolveSupplyService`), and the media base is
  // what turns a photo ref into a url — without it the vignette is null and
  // the very thing this slice added would be untestable.
  process.env['EXPO_PUBLIC_OFFER_WRITE_KEY'] = 'cle-de-test';
  process.env['EXPO_PUBLIC_MEDIA_BASE'] = 'http://media.test';
}

export interface Screen {
  readonly tree: ReactTestRenderer;
  /** Every string he can currently read, in render order. */
  texts(): string[];
  /** Does the screen currently show this sentence? */
  shows(fragment: string): boolean;
  /** Press the control whose label carries this text. Throws — loudly, naming
   *  what IS on screen — when nothing carries it, because « the button is not
   *  there » and « the button did nothing » must never look the same. */
  press(label: string, nth?: number): Promise<void>;
  /** Is a control with this label present AND enabled? */
  canPress(label: string): boolean;
  /** Type into the ONE field on screen; ambiguity THROWS rather than guessing. */
  type(value: string, match?: string): Promise<void>;
  /** Let queued promises and effects settle. */
  settle(): Promise<void>;
  /**
   * The `<Image>` sources currently on screen, in render order — the ONE
   * appearance-adjacent thing this harness may answer, because a `source.uri`
   * is a STRING THE APP COMPUTED, not a rendered pixel. It says « this row
   * asked for this url »; it says nothing about size, crop, or whether the
   * photograph is any good.
   */
  images(): string[];
  /**
   * Fire an `<Image>`'s own `onError` — the native « this url did not paint »
   * callback. A REAL React semantic and the only way to walk the broken-image
   * path; nothing about how the image looks is claimed or claimable.
   */
  imageError(nth?: number): Promise<void>;
  /** Re-render the same tree with new props — how a walk asks « does this
   *  component honour a CHANGE », which is where per-instance state hides. */
  rerender(element: React.ReactElement): Promise<void>;
  unmount(): void;
}

const textOf = (node: ReactTestInstance): string => {
  const out: string[] = [];
  const walk = (children: readonly (ReactTestInstance | string)[]): void => {
    for (const c of children) {
      if (typeof c === 'string') out.push(c);
      else walk(c.children);
    }
  };
  walk(node.children);
  return out.join('');
};

/**
 * Mount ONE real screen. Unlike the rider app (a single `App.tsx`), this app's
 * console is a set of tab screens taking props, so the element is the caller's
 * — and it is always a REAL component from `src/`, never a test stand-in.
 */
export async function mountEcran(element: React.ReactElement): Promise<Screen> {
  // React 19 wants this flag before any act(); without it every mount warns
  // « not configured to support act(...) » and effects can flush unpredictably.
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = create(element);
  });

  const settle = async (): Promise<void> => {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  // The first read fires in an effect; give it its answer before returning, or
  // every caller would have to remember to settle by hand.
  await settle();

  /**
   * ⚠ A CONTROL IS ANYTHING WITH AN `onPress`, not just a `Pressable`. This app
   * uses `<Text onPress accessibilityRole="link">` for its secondary actions
   * (the accueil's « engagement » and « gratuité » links are exactly that), and
   * a harness blind to them would report real controls as absent.
   */
  const textNodes = (): ReactTestInstance[] =>
    tree.root.findAll((n) => typeof n.type === 'string' && textOf(n) !== '', { deep: true });

  /**
   * ⚠ UNPRESSABLE IS NOT PRESSABLE. `pointerEvents="none"` is a NATIVE prop,
   * not layout, and it is a real way a control renders while no thumb can
   * reach it. (Layout-based unreachability — zero height, off-screen — remains
   * outside this harness by its stated bound; the double has no layout.)
   */
  const unreachable = (n: ReactTestInstance): boolean => {
    let cur: ReactTestInstance | null = n;
    while (cur !== null) {
      if (cur.props['pointerEvents'] === 'none') return true;
      cur = (cur.parent as ReactTestInstance | null) ?? null;
    }
    return false;
  };

  /** Innermost wins: a card that wraps a button also contains its text, and
   *  pressing the wrapper is not what his thumb does. Render order is kept so
   *  `nth` still means « the third one down the screen ». */
  const innermost = (hits: ReactTestInstance[]): ReactTestInstance[] =>
    hits.filter((h) => !hits.some((other) => other !== h && h.findAll((n) => n === other).length > 0));

  /** Any node carrying the label, pressable or not — used ONLY to tell
   *  « not on screen » apart from « on screen and dead ». */
  const allWithText = (label: string): ReactTestInstance[] =>
    innermost(textNodes().filter((p) => textOf(p).includes(label)));

  /**
   * The CONTROLS carrying the label. Innermost is computed WITHIN the pressable
   * set, not across every text node — a `<Pressable onPress>` wrapping a
   * `<Text>` is the normal shape of a button, and taking the innermost node
   * overall would find the Text, which has no handler, and report every button
   * in the app as dead.
   */
  const allByLabel = (label: string): ReactTestInstance[] =>
    innermost(textNodes().filter(
      (p) => typeof p.props['onPress'] === 'function' && textOf(p).includes(label),
    ));
  const findByLabel = (label: string, nth = 0): ReactTestInstance | null =>
    allByLabel(label)[nth] ?? null;

  const screen: Screen = {
    tree,
    texts: () => tree.root.findAllByType('Text' as never).map(textOf).filter((t) => t !== ''),
    shows: (fragment) => screen.texts().some((t) => t.includes(fragment)),
    images: () =>
      tree.root
        .findAllByType('Image' as never)
        .map((i) => {
          const src = i.props['source'] as { uri?: string } | undefined;
          return typeof src?.uri === 'string' ? src.uri : '';
        })
        .filter((u) => u !== ''),
    canPress: (label) => {
      const p = findByLabel(label);
      return p !== null && p.props['disabled'] !== true && !unreachable(p);
    },
    press: async (label, nth) => {
      const controls = allByLabel(label);
      if (controls.length === 0) {
        // ⚠ RENDERED BUT NOT PRESSABLE is its own diagnosis, and it is the
        // whole thesis of this harness.
        const inert = allWithText(label);
        throw new Error(
          inert.length > 0
            ? `« ${label} » is ON SCREEN but has NO onPress — a dead control is exactly what this harness exists to catch`
            : `no control labelled « ${label} ». On screen: ${JSON.stringify(screen.texts())}`,
        );
      }
      // ⚠ AMBIGUITY IS REFUSED: pressing the first of several same-labelled
      // controls silently is how a test passes having pressed the wrong thing.
      if (nth === undefined && controls.length > 1) {
        throw new Error(
          `« ${label} » matches ${controls.length} controls — pass an index (an order board renders one card per row)`,
        );
      }
      const p = controls[nth ?? 0];
      if (p === undefined) {
        throw new Error(`« ${label} » has ${controls.length} control(s); asked for #${String(nth)}`);
      }
      if (unreachable(p)) {
        throw new Error(`« ${label} » is rendered but unreachable (pointerEvents="none")`);
      }
      expect(p.props['disabled'], `« ${label} » is on screen but disabled`).not.toBe(true);
      const onPress = p.props['onPress'] as (() => void) | undefined;
      if (typeof onPress !== 'function') {
        throw new Error(`« ${label} » has NO onPress — a dead control is what this harness exists to catch`);
      }
      await act(async () => {
        onPress();
        await Promise.resolve();
      });
      await settle();
    },
    type: async (value, match) => {
      const all = tree.root.findAllByType('TextInput' as never);
      const describe = (i: (typeof all)[number]): string =>
        `${String(i.props['placeholder'] ?? '')} / ${String(i.props['accessibilityLabel'] ?? '')} / ${String(i.props['label'] ?? '')}`;
      const candidates = match === undefined ? all : all.filter((i) => describe(i).includes(match));
      if (candidates.length === 0) {
        throw new Error(
          `no field${match === undefined ? '' : ` matching « ${match} »`}. Fields: ${JSON.stringify(all.map(describe))}`,
        );
      }
      if (candidates.length > 1) {
        throw new Error(`« ${match ?? '(any)'} » is ambiguous: ${JSON.stringify(candidates.map(describe))}`);
      }
      const input = candidates[0]!;
      const onChangeText = input.props['onChangeText'] as ((v: string) => void) | undefined;
      if (typeof onChangeText !== 'function') throw new Error(`${describe(input)} does not accept typing`);
      await act(async () => {
        onChangeText(value);
      });
      await settle();
    },
    imageError: async (nth = 0) => {
      const imgs = tree.root.findAllByType('Image' as never);
      const img = imgs[nth];
      if (img === undefined) {
        throw new Error(`no <Image> #${String(nth)} on screen (there are ${imgs.length})`);
      }
      const onError = img.props['onError'] as (() => void) | undefined;
      if (typeof onError !== 'function') {
        throw new Error('this <Image> has NO onError — a url that 404s would leave a hole nobody handles');
      }
      await act(async () => {
        onError();
        await Promise.resolve();
      });
      await settle();
    },
    rerender: async (next) => {
      await act(async () => {
        tree.update(next);
      });
      await settle();
    },
    settle,
    unmount: () => {
      act(() => {
        tree.unmount();
      });
    },
  };
  return screen;
}
