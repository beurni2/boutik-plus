import type { CommandeRow, ProduitRow, ReadyResult } from './service';

/**
 * READINESS-WIRE-1b-ii — every decision the fournisseur screen renders, PURE
 * (the produits-real pattern, fourth application). The 5-second test for its
 * owner — a supplier, mid-literacy, hot phone: « which of my orders need my
 * hands right now? » One primary action per card, dictated by the TRUE state:
 * accept it, or ready it, or nothing (it is done as far as the platform can
 * prove).
 */

export type FournisseurRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'not_configured' }
  | { readonly kind: 'bad_code' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ok'; readonly rows: readonly CommandeRow[] };

/** The card's one primary action follows the order's true state. */
export type EtapeCommande =
  /** Paid, not yet accepted — « Accepter la commande » is the action. */
  | 'a_accepter'
  /** Accepted, not yet readied — « Produit prêt » (photo) is the action. */
  | 'a_preparer'
  /** Readiness confirmed with evidence — the colis waits for the coursier,
   *  and the ramassage check is the one act left on this card. */
  | 'prete'
  /**
   * BOUTIK-SUIVI (founder, 2026-08-09) — his own ramassage check CONFIRMED,
   * so the colis left his hands: « the product leaves from commandes screen
   * to that en route screen ». Nothing to do; the road is Séra's now.
   */
  | 'en_route'
  /** Séra delivered it and the fact reached us: « livré et terminé ». */
  | 'livree';

/**
 * BOUTIK-SUIVI — the three screens the founder asked for, as data. A zone is
 * a FILTER over the one list, never a second read: the same `/fulfillment/mine`
 * answer feeds all three, so a row cannot appear in two places or vanish
 * between them.
 */
export type ZoneCommandes = 'commandes' | 'en_route' | 'livrees';

const ZONE_DE: Record<EtapeCommande, ZoneCommandes> = {
  a_accepter: 'commandes',
  a_preparer: 'commandes',
  prete: 'commandes',
  en_route: 'en_route',
  livree: 'livrees',
};

/** Each zone's own empty sentence — « rien à faire » and « rien en route »
 *  are different facts, and a supplier reads the difference. */
const ZONE_VIDE: Record<ZoneCommandes, string> = {
  commandes: 'fournisseur.vide',
  en_route: 'fournisseur.vide_en_route',
  livrees: 'fournisseur.vide_livrees',
};

export interface CommandeVue extends CommandeRow {
  readonly etape: EtapeCommande;
}

export type FournisseurVue =
  | { readonly kind: 'loading'; readonly message: string }
  | { readonly kind: 'not_configured'; readonly message: string }
  | { readonly kind: 'bad_code'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'empty'; readonly message: string }
  | {
      readonly kind: 'liste';
      /** Orders needing the supplier's HANDS first (à accepter, then à
       *  préparer, oldest paid first inside each) — then the done ones,
       *  newest first: the work stays above the archive. */
      readonly commandes: readonly CommandeVue[];
      /** How many need an act — the screen's honest headline number. */
      readonly aFaire: number;
    };

/**
 * The order's true state, read from the marks the book keeps — never from
 * anything this app remembers. LATEST MARK WINS, in the road's own order:
 * delivered beats handed-over beats ready beats accepted.
 */
export function etapeOf(row: CommandeRow): EtapeCommande {
  if (row.fulfillment?.deliveredAt !== undefined) return 'livree';
  if (row.fulfillment?.handedOverAt !== undefined) return 'en_route';
  if (row.fulfillment?.readyAt !== undefined) return 'prete';
  if (row.fulfillment?.acceptedAt !== undefined) return 'a_preparer';
  return 'a_accepter';
}

const ETAPE_RANK: Record<EtapeCommande, number> = {
  a_accepter: 0, a_preparer: 1, prete: 2, en_route: 3, livree: 4,
};

/** Rows that need no act read as an archive — newest first. */
const ARCHIVE: readonly EtapeCommande[] = ['prete', 'en_route', 'livree'];

export function fournisseurVue(read: FournisseurRead, zone: ZoneCommandes = 'commandes'): FournisseurVue {
  if (read.kind === 'loading') return { kind: 'loading', message: 'fournisseur.chargement' };
  if (read.kind === 'not_configured') return { kind: 'not_configured', message: 'fournisseur.non_configure' };
  if (read.kind === 'bad_code') return { kind: 'bad_code', message: 'fournisseur.code_refuse' };
  if (read.kind === 'failed') return { kind: 'failed', message: 'fournisseur.echec' };
  const commandes = read.rows
    .map((r) => ({ ...r, etape: etapeOf(r) }))
    .filter((c) => ZONE_DE[c.etape] === zone)
    .sort((a, b) => {
      if (ETAPE_RANK[a.etape] !== ETAPE_RANK[b.etape]) return ETAPE_RANK[a.etape] - ETAPE_RANK[b.etape];
      // inside the work: oldest paid first (the longest-waiting buyer wins);
      // inside the done: newest first (the archive reads backwards).
      return ARCHIVE.includes(a.etape) ? (a.paidAt < b.paidAt ? 1 : -1) : (a.paidAt < b.paidAt ? -1 : 1);
    });
  // EMPTY IS PER ZONE (BOUTIK-SUIVI): « aucune commande » on a screen whose
  // orders have all moved on would be a lie about the book, not about the
  // zone — each screen says what IT is missing.
  if (commandes.length === 0) return { kind: 'empty', message: ZONE_VIDE[zone] };
  return {
    kind: 'liste',
    commandes,
    aFaire: commandes.filter((c) => !ARCHIVE.includes(c.etape)).length,
  };
}

/* ───────────── the « Produit prêt » flow, as a pure reducer ───────────── */

/**
 * The flow is Law-7 honest at every step: nothing is ever shown as done
 * before the book says so, and every server refusal keeps its own name —
 * because each one asks a DIFFERENT act of the supplier (expired → simply
 * try again, fresh challenge fetched silently; terms mismatch → call the
 * founder; already ready → nothing, it worked).
 */
export type PretUi =
  | { readonly etat: 'repos' }
  /** The photo is chosen and shown; « Envoyer la preuve » is armed. */
  | { readonly etat: 'photo_choisie'; readonly orderId: string; readonly previewUri: string }
  /** Challenge + upload + confirmation in flight — one spinner, one sentence. */
  | { readonly etat: 'envoi'; readonly orderId: string }
  | { readonly etat: 'refus'; readonly orderId: string; readonly messageKey: string };

export const PRET_REPOS: PretUi = { etat: 'repos' };

/** One flow at a time: choosing a photo while another order sends is ignored. */
export function pretChoisir(ui: PretUi, orderId: string, previewUri: string): PretUi | null {
  if (ui.etat === 'envoi') return null;
  return { etat: 'photo_choisie', orderId, previewUri };
}

export function pretEnvoyer(ui: PretUi): PretUi | null {
  if (ui.etat !== 'photo_choisie') return null;
  return { etat: 'envoi', orderId: ui.orderId };
}

export type PretIssue =
  | { readonly ui: PretUi; readonly then: 'refresh' }
  | { readonly ui: PretUi; readonly then: 'bad_code' }
  | { readonly ui: PretUi; readonly then: 'none' };

/** Every refusal, its own sentence — the mapping the tests pin. */
export function pretRefusKey(reason: Exclude<ReadyResult, { ok: true }>['reason']): string {
  switch (reason) {
    case 'challenge_expired':
    case 'challenge_missing_or_mismatched':
    case 'challenge_already_used':
      return 'fournisseur.pret_defi_perime';
    case 'locked_terms_mismatch':
      return 'fournisseur.pret_termes';
    case 'not_accepted':
      return 'fournisseur.pret_pas_acceptee';
    case 'already_ready':
      return 'fournisseur.pret_deja';
    case 'not_yours_or_unknown':
    case 'not_canonical_or_foreign_secret':
      return 'fournisseur.pret_impossible';
    case 'bad_code':
    case 'unreachable':
      return 'fournisseur.pret_echec';
  }
}

export function pretIssue(orderId: string, result: ReadyResult | { readonly ok: false; readonly reason: 'photo_echec' }): PretIssue {
  if ('ok' in result && result.ok) return { ui: PRET_REPOS, then: 'refresh' };
  if (result.reason === 'bad_code') return { ui: PRET_REPOS, then: 'bad_code' };
  if (result.reason === 'already_ready') return { ui: PRET_REPOS, then: 'refresh' }; // it IS ready — show the truth
  if (result.reason === 'photo_echec') {
    return { ui: { etat: 'refus', orderId, messageKey: 'fournisseur.pret_photo_echec' }, then: 'none' };
  }
  return { ui: { etat: 'refus', orderId, messageKey: pretRefusKey(result.reason) }, then: 'none' };
}


/* ───────────── LISTER-POUR-1c — « Mes produits », pure ───────────── */

/**
 * The founder lists; the supplier WATCHES. This view can express no edit —
 * not as a hidden button, but structurally: there is no action in the shape.
 * Every state is named; « we could not read your products » and « you have no
 * products yet » are different sentences (the honest-states law).
 */
export type ProduitsRead =
  | { readonly kind: 'loading' }
  | { readonly kind: 'not_configured' }
  | { readonly kind: 'bad_code' }
  | { readonly kind: 'failed' }
  | { readonly kind: 'ok'; readonly rows: readonly ProduitRow[] };

export interface ProduitVue extends ProduitRow {
  /** The one status sentence under the name: live, or WHY not — the wire's
   *  own reason mapped to his words, never re-derived locally. */
  readonly etatKey: string;
}

export type ProduitsVue =
  | { readonly kind: 'loading'; readonly message: string }
  | { readonly kind: 'not_configured'; readonly message: string }
  | { readonly kind: 'bad_code'; readonly message: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'empty'; readonly message: string }
  | { readonly kind: 'liste'; readonly produits: readonly ProduitVue[]; readonly enLigne: number };

/** Each wire reason, its own sentence — pinned one by one in the tests. */
export function produitEtatKey(reason: ProduitRow['hiddenReason']): string {
  switch (reason) {
    case undefined:
      return 'fournisseur.produit_en_ligne';
    case 'product_not_active':
    case 'offer_not_active':
      return 'fournisseur.produit_retire';
    case 'product_not_approved':
      return 'fournisseur.produit_en_attente';
    case 'offer_not_effective':
      return 'fournisseur.produit_pas_encore';
  }
}

export function produitsVue(read: ProduitsRead): ProduitsVue {
  if (read.kind === 'loading') return { kind: 'loading', message: 'fournisseur.chargement' };
  if (read.kind === 'not_configured') return { kind: 'not_configured', message: 'fournisseur.non_configure' };
  if (read.kind === 'bad_code') return { kind: 'bad_code', message: 'fournisseur.code_refuse' };
  if (read.kind === 'failed') return { kind: 'failed', message: 'fournisseur.echec' };
  if (read.rows.length === 0) return { kind: 'empty', message: 'fournisseur.produits_vide' };
  // LIVE FIRST (what earns money now), then the marked ones — each still
  // shown, each with its reason: « SHOW THEM, MARKED » is the standing ruling
  // this list inherits from the founder's own produits screen.
  const produits = read.rows
    .map((r) => ({ ...r, etatKey: produitEtatKey(r.hiddenReason) }))
    .sort((a, b) => {
      const av = a.hiddenReason === undefined ? 0 : 1;
      const bv = b.hiddenReason === undefined ? 0 : 1;
      if (av !== bv) return av - bv;
      return a.name.localeCompare(b.name, 'fr');
    });
  return {
    kind: 'liste',
    produits,
    enLigne: produits.filter((p) => p.hiddenReason === undefined).length,
  };
}
