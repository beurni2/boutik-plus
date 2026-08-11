import React from 'react';

/**
 * ═══ RENDU-RÉEL (Boutik+) — the react-native double, and EXACTLY what it is for ═══
 *
 * FOUNDER STANDING ORDER (2026-08-10) — « THE SCREEN IS DRIVEN, NEVER ONLY
 * READ ». He gave it after a single day in which three bugs reached his hand
 * through a fully green board, all the same shape: a screen that renders and
 * cannot be used. The order names this repo by name: the Boutik+ supplier app
 * has no harness, and « the first slice that touches a screen there BUILDS the
 * equivalent ». This is that build.
 *
 * WHAT IT REPLACES HERE: every screen test in `test/` was a SOURCE SCAN —
 * `readFileSync` on a `.tsx` and a regex over the text (`authoring-screen.test.ts`
 * says so in its own header: « this suite has no RN renderer »). A source scan
 * cannot see what mounted, whether a press is wired, or whether an effect threw.
 *
 * ⚠ THE BOUND OF THIS DOUBLE, STATED SO NOBODY OVER-READS IT (§9.8 — « a mock
 * that makes integration look healthier than it is is a bug you own »):
 *
 *   IT PROVIDES: component identity, prop pass-through, children, and the
 *   press/change handlers. That is enough — and is exactly what is needed —
 *   to answer « did it render », « is this button wired », « did the effect
 *   run », « can he get to the next screen ».
 *
 *   IT PROVIDES NOTHING ELSE. No layout, no styling, no measurement, no
 *   gesture system, no native animation. So a test written on it may NEVER
 *   claim anything about appearance — not spacing, not contrast, not
 *   touch-target size, not animation timing. Those stay where they already
 *   live: `faso-contrast.test.ts`, `pixel-property-diff.test.ts`, the token
 *   scans, and the founder's own eyes on a phone in sunlight.
 *
 * A test that asserted a colour here would be asserting a fiction. There is no
 * colour here.
 *
 * ⚠ AND ITS SURFACE IS CERTIFIED, NOT GUESSED. `test/rendu-harness.test.ts`
 * sweeps every `from 'react-native'` import in the app tree and fails if this
 * file does not export it — so a new import cannot silently arrive as
 * `undefined` and render nothing while a test passes over it.
 */

type AnyProps = Record<string, unknown> & { children?: React.ReactNode };

/** A host element of the given name — react-test-renderer keeps the type
 *  string, so `root.findAllByType('Text')` finds real nodes and the props are
 *  the ones the app actually passed. */
function host(name: string): React.FC<AnyProps> {
  const C: React.FC<AnyProps> = (props) => React.createElement(name, props as never);
  C.displayName = name;
  return C;
}

export const View = host('View');
export const Text = host('Text');
export const Image = host('Image');
export const SafeAreaView = host('SafeAreaView');
export const ScrollView = host('ScrollView');
export const TextInput = host('TextInput');
export const KeyboardAvoidingView = host('KeyboardAvoidingView');

/**
 * Modal renders its children ONLY when visible — the real one's whole point,
 * and the difference between « the overlay is on screen » and « the overlay
 * exists in the file ». A double that always rendered them would let a walk
 * find a control the founder cannot reach.
 */
export const Modal: React.FC<AnyProps> = (props) => {
  const { children, visible, ...rest } = props;
  if (visible === false) return null;
  return React.createElement('Modal', rest as never, children);
};
Modal.displayName = 'Modal';

/**
 * FlatList renders EVERY item — no windowing. Windowing is a performance
 * behaviour and this double makes no performance claim; what a walk needs is
 * that the rows the data produces are reachable.
 */
export const FlatList: React.FC<AnyProps> = (props) => {
  const { data, renderItem, keyExtractor, ListEmptyComponent, ...rest } = props;
  const rows = Array.isArray(data) ? data : [];
  const render = renderItem as ((info: { item: unknown; index: number }) => React.ReactNode) | undefined;
  const key = keyExtractor as ((item: unknown, index: number) => string) | undefined;
  const children =
    rows.length === 0
      ? (typeof ListEmptyComponent === 'function'
          ? React.createElement(ListEmptyComponent as React.FC)
          : (ListEmptyComponent as React.ReactNode) ?? null)
      : rows.map((item, index) =>
          React.createElement(
            React.Fragment,
            { key: key?.(item, index) ?? String(index) },
            render?.({ item, index }),
          ),
        );
  return React.createElement('FlatList', rest as never, children);
};
FlatList.displayName = 'FlatList';

/**
 * Pressable renders a function-child in the real library (`({pressed}) => …`).
 * Both forms are supported because the kit uses both; anything else about
 * pressing — ripple, delay, hit slop — is layout, and layout is not here.
 */
export const Pressable: React.FC<AnyProps> = (props) => {
  const { children, ...rest } = props;
  const resolved = typeof children === 'function'
    ? (children as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false })
    : children;
  return React.createElement('Pressable', rest as never, resolved);
};
Pressable.displayName = 'Pressable';

export const StyleSheet = {
  /** Identity: the app's styles are asserted by the token-fidelity scans, not
   *  here, and flattening them would invite exactly the appearance claims the
   *  header forbids. */
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.filter((s) => s !== null && s !== undefined && s !== false))
      : ((style ?? {}) as Record<string, unknown>),
  absoluteFillObject: {},
  hairlineWidth: 1,
};

/** Animation is DRIVEN, not simulated: `start()` invokes its callback at once
 *  so a component that waits on completion is never left hanging in a test.
 *  Nothing here interpolates — a value is whatever it was last set to. */
class AnimatedValue {
  constructor(private value: number) {}
  setValue(v: number): void {
    this.value = v;
  }
  interpolate(): AnimatedValue {
    return this;
  }
  addListener(): string {
    return '0';
  }
  removeAllListeners(): void {}
  stopAnimation(): void {}
}

const timing = (
  value: AnimatedValue,
  config: { toValue: number },
): { start: (cb?: () => void) => void; stop: () => void } => ({
  start: (cb?: () => void) => {
    value.setValue(config.toValue);
    cb?.();
  },
  stop: () => {},
});

export const Animated = {
  View: host('Animated.View'),
  Text: host('Animated.Text'),
  Value: AnimatedValue,
  timing,
  spring: timing,
  loop: (a: { start: (cb?: () => void) => void; stop: () => void }) => a,
  sequence: (list: { start: (cb?: () => void) => void }[]) => ({
    start: (cb?: () => void) => {
      for (const a of list) a.start();
      cb?.();
    },
    stop: () => {},
  }),
  parallel: (list: { start: (cb?: () => void) => void }[]) => ({
    start: (cb?: () => void) => {
      for (const a of list) a.start();
      cb?.();
    },
    stop: () => {},
  }),
};

const easingFn = (t: number): number => t;
export const Easing = {
  ease: easingFn,
  linear: easingFn,
  bezier: (): ((t: number) => number) => easingFn,
  inOut: (): ((t: number) => number) => easingFn,
  in: (): ((t: number) => number) => easingFn,
  out: (): ((t: number) => number) => easingFn,
};

/** The real one asks the OS. Here it always answers « reduce motion: no » and
 *  never changes — the reduced-motion BRANCHES are covered by their own unit
 *  tests. */
export const AccessibilityInfo = {
  isReduceMotionEnabled: async (): Promise<boolean> => false,
  addEventListener: (): { remove: () => void } => ({ remove: () => {} }),
};

/**
 * LINKING IS A NATIVE BOUNDARY AND IT RECORDS. The console's « appeler le
 * fournisseur » leaves the app through `openURL`; a walk that presses it must
 * be able to ask WHAT was dialled, and a double that silently swallowed the
 * url would let a broken `tel:` pass. `canOpenURL` answers true — whether the
 * OS has a dialler is not this harness's claim to make.
 */
export const Linking = {
  opened: [] as string[],
  openURL: async (url: string): Promise<void> => {
    Linking.opened.push(url);
  },
  canOpenURL: async (): Promise<boolean> => true,
  addEventListener: (): { remove: () => void } => ({ remove: () => {} }),
};

export const Platform = { OS: 'android' as const, select: <T,>(o: { android?: T; default?: T }): T | undefined => o.android ?? o.default };
export const Dimensions = { get: () => ({ width: 360, height: 640, scale: 2, fontScale: 1 }) };
/** A 1GB Android in portrait — the device the whole app is designed for. It is
 *  a NUMBER a component may branch on, never a claim about how anything looks. */
export const useWindowDimensions = (): { width: number; height: number; scale: number; fontScale: number } => ({
  width: 360,
  height: 640,
  scale: 2,
  fontScale: 1,
});

export type StyleProp<T> = T | T[] | null | undefined;
export type ViewStyle = Record<string, unknown>;
export type TextStyle = Record<string, unknown>;
export type ImageStyle = Record<string, unknown>;
