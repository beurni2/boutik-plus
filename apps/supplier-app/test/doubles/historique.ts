/**
 * ═══ RENDU-RÉEL — the browser's history, stood in for the back-gesture walks ═══
 *
 * LISTER-VRAI-1 (AUDIT-B+2 F-57). The console and the supplier page ship to a
 * browser, and the phone's Back is the BROWSER's act: it moves the history
 * back one entry and fires `popstate`. That is a host boundary, like the
 * storage `rendu.tsx` already stands in for, so it is doubled here — and
 * installed only by the walks that need it (a `window` in every walk would
 * change what other code sees).
 *
 * ═══ BOUNDS (§9.8) ═══
 *
 * · ENTRIES AND `popstate`, NOTHING ELSE. `pushState` adds an entry after the
 *   current one; `back()` moves one entry back and fires `popstate` LATER (a
 *   microtask), as browsers do — never synchronously inside the call.
 * · LEAVING IS COUNTED, NOT FAKED. A `back()` with no entry behind the first
 *   is the gesture leaving the page: `sorties` counts it and nothing fires.
 * · `go(-n)` moves n entries back and fires ONE `popstate`, as browsers do.
 * · ONE TRAVERSAL PER TASK, COUNTED. Browsers do not agree on two
 *   `back()`/`go()` calls made in the same task (some honour only the first),
 *   so this double does not pick a behaviour: it applies both and COUNTS the
 *   second in `traverseesMultiples`. A walk asserts it stays 0 — the app must
 *   never depend on a browser choice (verifier MINOR, LISTER-VRAI-1).
 * · No URL, no `location`, no navigation. APPEARANCE: nothing.
 */
export interface Navigateur {
  /** Entries the app added beyond the page itself. */
  readonly entrees: number;
  /** Times Back had nothing left and would have left the page. */
  readonly sorties: number;
  /** App-made traversals that shared a task with another one (must stay 0). */
  readonly traverseesMultiples: number;
  /** The phone's Back gesture. */
  retour(): void;
}

export function installerHistorique(): Navigateur {
  const ecouteurs = new Set<() => void>();
  let pile: unknown[] = [{ page: true }];
  let index = 0;
  let sorties = 0;
  let multiples = 0;
  let dansCetteTache = 0;
  const compter = (): void => {
    dansCetteTache += 1;
    if (dansCetteTache === 1) setTimeout(() => { dansCetteTache = 0; }, 0);
    else multiples += 1;
  };
  const allerDe = (delta: number): void => {
    if (index + delta < 0) {
      sorties += 1;
      return;
    }
    index += delta;
    queueMicrotask(() => {
      for (const f of [...ecouteurs]) f();
    });
  };
  const history = {
    pushState(data: unknown): void {
      pile = pile.slice(0, index + 1);
      pile.push(data);
      index += 1;
    },
    back(): void {
      compter();
      allerDe(-1);
    },
    go(delta: number): void {
      compter();
      allerDe(delta);
    },
  };
  (globalThis as { window?: unknown }).window = {
    history,
    addEventListener: (type: string, f: () => void) => {
      if (type === 'popstate') ecouteurs.add(f);
    },
    removeEventListener: (type: string, f: () => void) => {
      if (type === 'popstate') ecouteurs.delete(f);
    },
  };
  return {
    get entrees() {
      return index;
    },
    get sorties() {
      return sorties;
    },
    get traverseesMultiples() {
      return multiples;
    },
    // The GESTURE is the person's act, not the app's: it is never counted.
    retour: () => allerDe(-1),
  };
}

export function retirerHistorique(): void {
  delete (globalThis as { window?: unknown }).window;
}
