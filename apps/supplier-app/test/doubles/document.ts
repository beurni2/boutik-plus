/**
 * CROISSANCE-1 — a stand-in for the BROWSER's `document`, the one host
 * boundary the visibility-aware refresh reads (`src/ui/rafraichir.ts`).
 *
 * ITS BOUNDS, stated so a walk on it is never read as more:
 *   · it models `visibilityState` and the `visibilitychange` event, nothing
 *     else — no DOM, no layout, no focus;
 *   · `cacher()` / `montrer()` are what a browser does when the tab goes behind
 *     another or comes back: the state flips, THEN the event fires, as the
 *     Page Visibility spec orders them;
 *   · no app code is replaced by it — the screens, the helper and the ports
 *     are the shipped files.
 */
export class DocumentDouble {
  visibilityState: 'visible' | 'hidden' = 'visible';
  private readonly ecouteurs = new Set<() => void>();

  addEventListener(type: string, f: () => void): void {
    if (type === 'visibilitychange') this.ecouteurs.add(f);
  }
  removeEventListener(type: string, f: () => void): void {
    if (type === 'visibilitychange') this.ecouteurs.delete(f);
  }
  get abonnes(): number {
    return this.ecouteurs.size;
  }
  cacher(): void {
    this.visibilityState = 'hidden';
    for (const f of [...this.ecouteurs]) f();
  }
  montrer(): void {
    this.visibilityState = 'visible';
    for (const f of [...this.ecouteurs]) f();
  }
}

export function installerDocument(): DocumentDouble {
  const d = new DocumentDouble();
  (globalThis as { document?: unknown }).document = d;
  return d;
}

export function retirerDocument(): void {
  delete (globalThis as { document?: unknown }).document;
}
