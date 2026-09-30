import { useEffect, useRef } from 'react';

/**
 * LISTER-VRAI-1 (AUDIT-B+2 F-57) — THE PHONE'S BACK STAYS IN THE APP.
 *
 * Both pages ship to a browser. Before this, Android's back gesture left the
 * page at once and took with it everything held only in memory: a listing
 * half typed, its photographs, a readiness photo picked and not yet sent.
 *
 * THE RULE, the one Shop+'s buyer app already keeps: a LAYER that opens (the
 * wizard, the Studio, a result pane, a product's fiche, the photo viewer, a
 * picked photo) adds ONE history entry; Back takes it and closes the layer as
 * the app's own back would; closing it from the app takes the entry back
 * itself. At the root there is no entry, so Back does what the browser does.
 *
 * ONE STACK FOR THE WHOLE PAGE, because layers live in different components
 * and a popstate must close exactly one — the top one. A layer that stays open
 * while its DEPTH changes (the wizard stepping back from 3 to 2) keeps its one
 * entry; when Back closes it but the app only stepped (the layer is still
 * open), it is re-armed with a fresh entry, so the next Back steps again.
 *
 * ONE STEP FOR LAYERS THAT CLOSE TOGETHER. « Retour » on « C'est publié »
 * closes the result pane AND the wizard in the same moment. Two history steps
 * in one task is something browsers do not agree on (some honour only the
 * first), and his next real Back would then do nothing once. So the entries
 * the app takes back in one task are taken back as ONE `go(-n)`, which fires
 * one popstate (verifier MINOR, LISTER-VRAI-1).
 *
 * NOTHING ON A PHONE: without a browser history this does nothing at all.
 */

interface Couche {
  readonly fermer: () => void;
}

interface Historique {
  pushState(data: unknown, unused: string): void;
  go(delta: number): void;
}
interface Fenetre {
  readonly history?: Historique;
  addEventListener?(type: 'popstate', f: () => void): void;
}

const pile: Couche[] = [];
/** Entries the app took back itself: their popstate closes nothing. */
let ignorer = 0;
/** The window whose popstate is heard — one listener per page. */
let ecouteSur: object | null = null;
/** Entries the app is taking back in this task — gathered into one step. */
let aReprendre = 0;

function reprendre(w: NonNullable<ReturnType<typeof fenetre>>): void {
  aReprendre += 1;
  if (aReprendre > 1) return;
  queueMicrotask(() => {
    const n = aReprendre;
    aReprendre = 0;
    ignorer += 1; // one go(-n), one popstate
    w.history.go(-n);
  });
}

function fenetre(): (Fenetre & { history: Historique; addEventListener(type: 'popstate', f: () => void): void }) | null {
  const w = (globalThis as { window?: Fenetre }).window;
  if (w === undefined || typeof w.history?.pushState !== 'function' || typeof w.addEventListener !== 'function') return null;
  return w as Fenetre & { history: Historique; addEventListener(type: 'popstate', f: () => void): void };
}

function ecouter(w: NonNullable<ReturnType<typeof fenetre>>): void {
  if (ecouteSur === w) return;
  ecouteSur = w;
  w.addEventListener('popstate', () => {
    if (ignorer > 0) {
      ignorer -= 1;
      return;
    }
    pile.pop()?.fermer();
  });
}

function retirer(c: Couche): boolean {
  const i = pile.indexOf(c);
  if (i < 0) return false;
  pile.splice(i, 1);
  return true;
}

/**
 * Join the page's back stack while `cle` is not null. `fermer` is what the
 * app's own back does for this layer. A new `cle` for a layer that is still
 * open keeps its entry; `null` closes it.
 */
export function useCouche(cle: string | null, fermer: () => void): void {
  const fermerRef = useRef(fermer);
  fermerRef.current = fermer;
  const couche = useRef<Couche | null>(null);

  useEffect(() => {
    const w = fenetre();
    if (w === null) return;
    ecouter(w);
    if (cle === null) {
      const c = couche.current;
      couche.current = null;
      if (c !== null && retirer(c)) reprendre(w);
      return;
    }
    if (couche.current === null || !pile.includes(couche.current)) {
      const c: Couche = { fermer: () => fermerRef.current() };
      couche.current = c;
      pile.push(c);
      w.history.pushState({ boutikCouche: pile.length }, '');
    }
  }, [cle]);

  // Unmounted while open (a tab switch, a new screen): its entry goes too.
  useEffect(
    () => () => {
      const w = fenetre();
      const c = couche.current;
      if (w !== null && c !== null && retirer(c)) reprendre(w);
    },
    [],
  );
}
