/**
 * CATALOGUE-PAGES-1 (the slice's verifier, MAJOR 2) — A CUT OR A RE-MINT
 * WHOSE PRODUCT WALK DID NOT FINISH, remembered by the DEVICE, not by a screen.
 *
 * Held in the codes section's one failure slot, the line « certains de ses
 * produits sont encore en vente » vanished the moment he cut another supplier,
 * reread a code or reloaded the page — and a cut supplier's row offers no
 * other way back to the walk: his products stayed on sale with nothing saying
 * so. This is the F-68 pattern (the photos still to destroy): his browser
 * storage, with a page-lifetime copy where the browser refuses storage. The
 * line leaves only when « Terminer » reaches the end, when his door changes
 * again, or when he is erased.
 */
export type ActeProduits = 'revoke' | 'mint';

export interface Inacheve {
  readonly supplierId: string;
  readonly acte: ActeProduits;
}

const STORAGE = 'boutik.produits.inacheves';
let secours: readonly Inacheve[] = [];

function lire(): readonly Inacheve[] {
  try {
    if (typeof localStorage === 'undefined') return secours;
    const brut = localStorage.getItem(STORAGE);
    if (brut === null) return [];
    const lu: unknown = JSON.parse(brut);
    if (!Array.isArray(lu)) return [];
    return lu.filter(
      (e): e is Inacheve =>
        typeof e === 'object' && e !== null &&
        typeof (e as Inacheve).supplierId === 'string' && (e as Inacheve).supplierId !== '' &&
        ((e as Inacheve).acte === 'revoke' || (e as Inacheve).acte === 'mint'),
    );
  } catch {
    return secours;
  }
}

function ecrire(liste: readonly Inacheve[]): readonly Inacheve[] {
  secours = liste;
  try {
    if (typeof localStorage !== 'undefined') {
      if (liste.length === 0) localStorage.removeItem(STORAGE);
      else localStorage.setItem(STORAGE, JSON.stringify(liste));
    }
  } catch {
    // storage refused — the page-lifetime copy above still holds them
  }
  return liste;
}

/** The walks this device knows are unfinished. */
export function produitsInacheves(): readonly Inacheve[] {
  return lire();
}

/** His latest door act on this supplier did not finish its walk (replaces any older one). */
export function noterInacheve(supplierId: string, acte: ActeProduits): readonly Inacheve[] {
  return ecrire([...lire().filter((e) => e.supplierId !== supplierId), { supplierId, acte }]);
}

/** Nothing is left to finish for this supplier. */
export function oublierInacheve(supplierId: string): readonly Inacheve[] {
  return ecrire(lire().filter((e) => e.supplierId !== supplierId));
}
