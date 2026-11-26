import type { Route } from './rendu';

/**
 * ═══ THE FUND BOOK'S READS, PLAYED BACK FOR THE CONSOLE'S WALKS ═══
 *
 * The console's fund desk and its Commandes tab read the platform's
 * protection book (`protection-service`, one FondsDO behind one Bearer door).
 * The walks cannot start that Worker in this repo's CI (it lives in the
 * platform repo), so this stand-in answers its READS — and it may only say
 * what the real book says.
 *
 * TWO MODES, the two books the console meets:
 *   · `pages` — the paged reading: `?part=open` is every open claim, never
 *     paged; `?part=closed[&limit][&before]` is the closed claims newest
 *     closed first, with `nextBefore`; anything else asked of `part`, or a
 *     page out of bounds, is `400 invalid_page`; no `part` is the full list.
 *   · `ancien` — the book still live before the paged reading ships: it
 *     ignores every parameter and answers the full list, with no
 *     `nextBefore`.
 *
 * CERTIFIED, NOT ASSUMED: `livre-fonds-substitut.e2e.test.ts` seeds the REAL
 * book (both readings, each from its own platform build) through its own
 * routes, builds this stand-in from what the real book then lists, and
 * deep-compares status and body for every read the console makes, every
 * page to the end and every refusal. The claim builder below is compared,
 * field for field, with claims the real book stored.
 *
 * ITS BOUNDS, said plainly:
 *   · reads only (GET /claims, GET /fund) — a request with a body is not
 *     answered here, so a walk that writes would get the harness's 404;
 *   · `/fund` is a book with NO declaration (the committed figure follows the
 *     book's own counting rule, certified on a mixed book);
 *   · closing order is the order the book gives a book it numbers once: the
 *     last step's time, then the order id. The walks give each closed claim
 *     its own time, so that order is the order they were closed in.
 */

export const FONDS_ACTEUR = 'ops:protection:fondateur';

export type FauteStockee = 'seller' | 'buyer' | 'payment_provider' | 'platform_system' | 'unresolved';
export type EtatStocke = 'opened' | 'under_review' | 'resolved' | 'closed_no_payout';

/** A claim exactly as the book stores and lists it. */
export interface ReclamationStockee {
  readonly claim: {
    readonly orderId: string;
    readonly reason: string;
    readonly amount: number;
    readonly faultClass: FauteStockee;
    readonly evidenceBundleId: string;
    readonly state: EtatStocke;
  };
  readonly openedAt: string;
  readonly openedBy: string;
  readonly refundRequired?: {
    readonly orderId: string;
    readonly reason: string;
    readonly faultClass: 'seller';
    readonly buyerPriority: true;
    readonly amountFcfa: number;
    readonly recordedAt: string;
  };
  readonly advanced: readonly {
    readonly to: EtatStocke;
    readonly at: string;
    readonly by: string;
    readonly settlementRef?: string;
    readonly closedReason?: string;
  }[];
}

/** The motif, proof, payment reference and close reason the certification
 *  seeds the real book with — the builder's defaults, so both sides match. */
export const motifDe = (orderId: string): string => `Motif ${orderId}`;
export const preuveDe = (orderId: string): string => `evb-${orderId}`;
export const refDe = (orderId: string): string => `ref-${orderId}`;
export const MOTIF_CLASSEMENT = 'Rien à payer';

/** One stored claim, built the way the book builds it from its own acts:
 *  opened (+ its refund record for a seller fault), then each step. */
export function reclamation(o: {
  readonly orderId: string;
  readonly faute: FauteStockee;
  readonly etat: EtatStocke;
  readonly ouverteLe: string;
  /** When it went under review (under_review, and resolved). */
  readonly examineeLe?: string;
  /** When it reached its terminal state (resolved, closed_no_payout). */
  readonly fermeeLe?: string;
  readonly montantFcfa?: number;
}): ReclamationStockee {
  const amount = o.montantFcfa ?? 5_000;
  const reason = motifDe(o.orderId);
  const examen = { to: 'under_review' as const, at: o.examineeLe ?? o.ouverteLe, by: FONDS_ACTEUR };
  const fin = o.fermeeLe ?? o.ouverteLe;
  const advanced =
    o.etat === 'opened'
      ? []
      : o.etat === 'under_review'
        ? [examen]
        : o.etat === 'resolved'
          ? [examen, { to: 'resolved' as const, at: fin, by: FONDS_ACTEUR, settlementRef: refDe(o.orderId) }]
          : [{ to: 'closed_no_payout' as const, at: fin, by: FONDS_ACTEUR, closedReason: MOTIF_CLASSEMENT }];
  return {
    claim: {
      orderId: o.orderId,
      reason,
      amount,
      faultClass: o.faute,
      evidenceBundleId: preuveDe(o.orderId),
      state: o.etat,
    },
    openedAt: o.ouverteLe,
    openedBy: FONDS_ACTEUR,
    ...(o.faute === 'seller'
      ? {
          refundRequired: {
            orderId: o.orderId,
            reason,
            faultClass: 'seller' as const,
            buyerPriority: true as const,
            amountFcfa: amount,
            recordedAt: o.ouverteLe,
          },
        }
      : {}),
    advanced,
  };
}

const TERMINAUX: readonly string[] = ['resolved', 'closed_no_payout'];
/** The book's counting rule for what is still engaged (its coverage list). */
const COMPTE_ENGAGE: Readonly<Record<string, boolean>> = {
  seller: true,
  buyer: false,
  payment_provider: false,
  platform_system: true,
  unresolved: true,
};
const NOTE_SOLVABILITE =
  'WATCH/RESTRICTED indisponibles — la formule de dimensionnement (\u23f3 §12) attend la décision du fondateur.';

const CHIFFRES = /^\d{1,15}$/;

export interface Reponse {
  readonly status: number;
  readonly json: Record<string, unknown>;
}

export interface LivreSubstitut {
  /** For `wire()`: answers GET /claims and GET /fund, nothing else. */
  readonly route: Route;
  /** Every read asked of it, as `path?query` — the record a walk asks
   *  « which reads did the screen make ». */
  readonly lus: string[];
  /** The answer to one GET, as the real book would give it. */
  repondre(path: string, query: string, authorization: string | undefined): Reponse | null;
}

export function livreFondsSubstitut(o: {
  readonly cle: string;
  readonly claims: readonly ReclamationStockee[];
  readonly mode: 'pages' | 'ancien';
}): LivreSubstitut {
  const cleDe = (c: ReclamationStockee): string => `claim:${c.claim.orderId}`;
  const parCle = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  // The full list: opening time, then the stored key (the book sorts its
  // key-ordered rows by openedAt, and that sort is stable).
  const tous = [...o.claims].sort((a, b) => a.openedAt.localeCompare(b.openedAt) || parCle(cleDe(a), cleDe(b)));
  const ouvertes = tous.filter((c) => !TERMINAUX.includes(c.claim.state));
  const fin = (c: ReclamationStockee): string => c.advanced[c.advanced.length - 1]?.at ?? '';
  // Closing numbers 1..n, in closing order.
  const fermees = o.claims
    .filter((c) => TERMINAUX.includes(c.claim.state))
    .sort((a, b) => parCle(fin(a), fin(b)) || parCle(cleDe(a), cleDe(b)));
  const engages = o.claims
    .filter((c) => !TERMINAUX.includes(c.claim.state) && COMPTE_ENGAGE[c.claim.faultClass] !== false)
    .reduce((s, c) => s + c.claim.amount, 0);
  const lus: string[] = [];

  function repondre(path: string, query: string, authorization: string | undefined): Reponse | null {
    if (path !== '/claims' && path !== '/fund') return null;
    if (authorization !== `Bearer ${o.cle}` || o.cle === '') return { status: 401, json: { error: 'unauthorized' } };
    if (path === '/fund') {
      return {
        status: 200,
        json: {
          declaration: null,
          declarationCount: 0,
          committedClaimsAmountFcfa: engages,
          solvency: { state: null, availableAfterCommitmentsFcfa: null },
          solvencyNote: NOTE_SOLVABILITE,
        },
      };
    }
    const q = new URLSearchParams(query);
    const part = q.get('part');
    if (o.mode === 'ancien' || part === null) return { status: 200, json: { claims: tous } };
    const refus: Reponse = { status: 400, json: { error: 'invalid_page' } };
    if (part === 'open') {
      if (q.has('limit') || q.has('before')) return refus;
      return { status: 200, json: { claims: ouvertes } };
    }
    if (part !== 'closed') return refus;
    const brutLimite = q.get('limit');
    const brutAvant = q.get('before');
    const limite = brutLimite === null ? 20 : CHIFFRES.test(brutLimite) ? Number(brutLimite) : NaN;
    const avant = brutAvant === null ? undefined : CHIFFRES.test(brutAvant) ? Number(brutAvant) : NaN;
    if (!(limite >= 1 && limite <= 100)) return refus;
    if (avant !== undefined && !(avant >= 1)) return refus;
    // Closing number n is fermees[n - 1]; a page is the numbers below
    // `before`, newest first.
    const haut = avant === undefined ? fermees.length : Math.min(avant - 1, fermees.length);
    const bas = Math.max(haut - limite, 0);
    const page = fermees.slice(bas, haut).reverse();
    const plusVieux = page.length === 0 ? 0 : bas + 1;
    return { status: 200, json: { claims: page, nextBefore: plusVieux > 1 ? plusVieux : null } };
  }

  const route: Route = (path, body, search, headers) => {
    if (body !== null || (path !== '/claims' && path !== '/fund')) return null;
    const query = search.toString();
    lus.push(query === '' ? path : `${path}?${query}`);
    return repondre(path, query, headers['authorization']);
  };
  return { route, lus, repondre };
}
