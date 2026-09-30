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
 * · No URL, no `location`, no navigation. APPEARANCE: nothing.
 */
export interface Navigateur {
  /** Entries the app added beyond the page itself. */
  readonly entrees: number;
  /** Times Back had nothing left and would have left the page. */
  readonly sorties: number;
  /** The phone's Back gesture. */
  retour(): void;
}

export function installerHistorique(): Navigateur {
  const ecouteurs = new Set<() => void>();
  let pile: unknown[] = [{ page: true }];
  let index = 0;
  let sorties = 0;
  const history = {
    pushState(data: unknown): void {
      pile = pile.slice(0, index + 1);
      pile.push(data);
      index += 1;
    },
    back(): void {
      if (index === 0) {
        sorties += 1;
        return;
      }
      index -= 1;
      queueMicrotask(() => {
        for (const f of [...ecouteurs]) f();
      });
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
    retour: () => history.back(),
  };
}

export function retirerHistorique(): void {
  delete (globalThis as { window?: unknown }).window;
}
