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
  | 'livree'
  /**
   * RETOUR-VIVANT-1 (Séra SE6.2) — the buyer refused and the coursier brought
   * the colis BACK; his own confirmed RETURN code marks it. Terminal, like
   * livrée: nothing to do, the colis is in his hands again. It sits in the
   * « Livré et terminé » archive with its own sentence — the zone's meaning
   * is « done as far as the platform can prove », and a return is done.
   */
  | 'retournee'
  /**
   * REMBOURSEMENT-2 — HE refused it (« je ne peux pas fournir »): terminal,
   * nothing to do, the buyer is refunded. In the archive with its own
   * sentence, like a return.
   */
  | 'refusee'
  /**
   * REMBOURSABLE-1 (AUDIT-B+2 F-02) — the FOUNDER cancelled it (« Annuler et
   * rembourser »). Terminal like his own refusal, with its own sentence: he
   * never reads « vous avez refusé » about an act he did not do.
   */
  | 'annulee'
  /**
   * REMBOURSABLE-1 (AUDIT-B+2 F-08) — the rider REFUSED the colis at pickup.
   * Terminal: the order is cancelled, the buyer refunded, the colis stays with
   * him — so no « en route », and no return code to type (it never left).
   */
  | 'ramassage_refuse';

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
  retournee: 'livrees',
  refusee: 'livrees',
  annulee: 'livrees',
  ramassage_refuse: 'livrees',
};

/** Each zone's own empty sentence — « rien à faire » and « rien en route »
 *  are different facts, and a supplier reads the difference. */
const ZONE_VIDE: Record<ZoneCommandes, string> = {
  commandes: 'fournisseur.vide',
  en_route: 'fournisseur.vide_en_route',
  livrees: 'fournisseur.vide_livrees',
};

/**
 * ⚠ AND « NOTHING TO DO » IS NOT « NO ORDERS » (verifier, 2026-08-10). The
 * Commandes screen kept one sentence — « Aucune commande pour l'instant. Dès
 * qu'un client paie, elle apparaît ici. » — which became a lie the moment his
 * orders merely MOVED to the two new screens: he has commandes, they are on
 * the road. An empty zone over a non-empty book says so.
 */
const ZONE_VIDE_MAIS_ACTIF: Partial<Record<ZoneCommandes, string>> = {
  commandes: 'fournisseur.vide_a_faire',
};

export interface CommandeVue extends CommandeRow {
  readonly etape: EtapeCommande;
}

/**
 * COLIS-FOURNISSEUR-1 — what his screen shows: one card per order alone, and
 * ONE card per colis (founder ruling 2026-09-23; B6.2 as amended: « made
 * ready in ONE act — one photo, one confirmation per order under it »). A
 * colis's step is its LEAST advanced article that he did not refuse: the
 * card asks for the next act the bag still needs, and an article refused
 * inside it stays listed there with its own line.
 */
export type CarteFournisseur =
  | { readonly kind: 'commande'; readonly commande: CommandeVue }
  | {
      readonly kind: 'colis';
      readonly packageId: string;
      readonly etape: EtapeCommande;
      readonly articles: readonly CommandeVue[];
    };

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
      /** COLIS-FOURNISSEUR-1 — the same rows, as the cards he sees: an order
       *  alone is its own card, a colis is ONE card holding its articles. */
      readonly cartes: readonly CarteFournisseur[];
      /** How many need an act — the screen's honest headline number (a
       *  colis is one act for him, so it counts once). */
      readonly aFaire: number;
    };

/**
 * The order's true state, read from the marks the book keeps — never from
 * anything this app remembers. LATEST MARK WINS, in the road's own order:
 * delivered beats handed-over beats ready beats accepted.
 */
export function etapeOf(row: CommandeRow): EtapeCommande {
  // His refusal — or the founder's cancel — ends the order before any road
  // began (both close at « prêt »).
  if (row.fulfillment?.refusedAt !== undefined) return row.fulfillment.refusPar === 'fondateur' ? 'annulee' : 'refusee';
  // The rider's refusal at pickup ends it AFTER his handover check: it outranks
  // the handover, or the card would say the rider has the colis forever.
  if (row.fulfillment?.pickupRefusedAt !== undefined) return 'ramassage_refuse';
  if (row.fulfillment?.deliveredAt !== undefined) return 'livree';
  // A return ends the road after the handover, as a delivery does: the
  // colis is back in his hands, and « en route » would be a lie.
  if (row.fulfillment?.returnedAt !== undefined) return 'retournee';
  if (row.fulfillment?.handedOverAt !== undefined) return 'en_route';
  if (row.fulfillment?.readyAt !== undefined) return 'prete';
  if (row.fulfillment?.acceptedAt !== undefined) return 'a_preparer';
  return 'a_accepter';
}

/**
 * FOURNISSEUR-VRAI-1 (AUDIT-B+2 F-09) — the payment way (« Tout est payé » /
 * « Reste à payer à la porte ») is a fact about an order STILL MOVING. On a
 * delivered one nothing is left to pay, and on a refused or returned one « tout
 * est payé » would sit beside « le client sera remboursé ». His price is shown
 * on its own line at every stage; this line only while the order moves.
 */
export function modeVisible(etape: EtapeCommande): boolean {
  return etape === 'a_accepter' || etape === 'a_preparer' || etape === 'prete' || etape === 'en_route';
}

const ETAPE_RANK: Record<EtapeCommande, number> = {
  a_accepter: 0, a_preparer: 1, prete: 2, en_route: 3, livree: 4, retournee: 4, refusee: 4, annulee: 4, ramassage_refuse: 4,
};

/** Rows that need no act read as an archive — newest first. */
const ARCHIVE: readonly EtapeCommande[] = ['prete', 'en_route', 'livree', 'retournee', 'refusee', 'annulee', 'ramassage_refuse'];

/** REMBOURSABLE-1 — the steps that end an article OFF the road (his refusal,
 *  the founder's cancel, the rider's refusal at pickup): a colis's step is read
 *  from its other articles, and each of these keeps its own line on the card. */
export const HORS_ROUTE: readonly EtapeCommande[] = ['refusee', 'annulee', 'ramassage_refuse'];

/** COLIS-FOURNISSEUR-1 — the colis's one step: its least advanced article he
 *  did not refuse (a delivered bag with one article home reads « revenu »). */
export function etapeDuColis(articles: readonly CommandeVue[]): EtapeCommande {
  const vivants = articles.filter((a) => !HORS_ROUTE.includes(a.etape));
  if (vivants.length === 0) {
    // Nothing left on the road: the bag says how it ended — the rider's
    // refusal first (it is the one that happened to the colis itself).
    if (articles.some((a) => a.etape === 'ramassage_refuse')) return 'ramassage_refuse';
    if (articles.some((a) => a.etape === 'annulee')) return 'annulee';
    return 'refusee';
  }
  const min = Math.min(...vivants.map((a) => ETAPE_RANK[a.etape]));
  const au = vivants.filter((a) => ETAPE_RANK[a.etape] === min).map((a) => a.etape);
  if (min === ETAPE_RANK.livree) return vivants.some((a) => a.etape === 'retournee') ? 'retournee' : 'livree';
  return au[0]!;
}

/** COLIS-FOURNISSEUR-1 — the articles « Accepter le colis » accepts. */
export function aAccepterDuColis(articles: readonly CommandeVue[]): string[] {
  return articles.filter((a) => a.etape === 'a_accepter').map((a) => a.orderId);
}

/** The rows as his cards: a colis's articles gathered on one card, in the
 *  order the package lists them. */
function cartesDe(rows: readonly CommandeVue[]): CarteFournisseur[] {
  const cartes: CarteFournisseur[] = [];
  const vus = new Set<string>();
  for (const c of rows) {
    if (c.colis === undefined) {
      cartes.push({ kind: 'commande', commande: c });
      continue;
    }
    if (vus.has(c.colis.packageId)) continue;
    vus.add(c.colis.packageId);
    const ordre = c.colis.orderIds;
    const articles = rows
      .filter((r) => r.colis?.packageId === c.colis!.packageId)
      .sort((a, b) => ordre.indexOf(a.orderId) - ordre.indexOf(b.orderId));
    cartes.push({ kind: 'colis', packageId: c.colis.packageId, etape: etapeDuColis(articles), articles });
  }
  return cartes;
}

const etapeDeCarte = (c: CarteFournisseur): EtapeCommande => (c.kind === 'colis' ? c.etape : c.commande.etape);
const paidAtDeCarte = (c: CarteFournisseur): string =>
  c.kind === 'colis' ? c.articles.map((a) => a.paidAt).sort()[0] ?? '' : c.commande.paidAt;

export function fournisseurVue(read: FournisseurRead, zone: ZoneCommandes = 'commandes'): FournisseurVue {
  if (read.kind === 'loading') return { kind: 'loading', message: 'fournisseur.chargement' };
  if (read.kind === 'not_configured') return { kind: 'not_configured', message: 'fournisseur.non_configure' };
  if (read.kind === 'bad_code') return { kind: 'bad_code', message: 'fournisseur.code_refuse' };
  if (read.kind === 'failed') return { kind: 'failed', message: 'fournisseur.echec' };
  const cartes = cartesDe(read.rows.map((r) => ({ ...r, etape: etapeOf(r) })))
    .filter((c) => ZONE_DE[etapeDeCarte(c)] === zone)
    .sort((a, b) => {
      const ea = etapeDeCarte(a);
      const eb = etapeDeCarte(b);
      if (ETAPE_RANK[ea] !== ETAPE_RANK[eb]) return ETAPE_RANK[ea] - ETAPE_RANK[eb];
      // inside the work: oldest paid first (the longest-waiting buyer wins);
      // inside the done: newest first (the archive reads backwards).
      const pa = paidAtDeCarte(a);
      const pb = paidAtDeCarte(b);
      return ARCHIVE.includes(ea) ? (pa < pb ? 1 : -1) : (pa < pb ? -1 : 1);
    });
  const commandes = cartes.flatMap((c) => (c.kind === 'colis' ? c.articles : [c.commande]));
  // EMPTY IS PER ZONE (BOUTIK-SUIVI): « aucune commande » on a screen whose
  // orders have all moved on would be a lie about the book, not about the
  // zone — each screen says what IT is missing.
  if (commandes.length === 0) {
    const actif = read.rows.length > 0 ? ZONE_VIDE_MAIS_ACTIF[zone] : undefined;
    return { kind: 'empty', message: actif ?? ZONE_VIDE[zone] };
  }
  return {
    kind: 'liste',
    commandes,
    cartes,
    aFaire: cartes.filter((c) => !ARCHIVE.includes(etapeDeCarte(c))).length,
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
  /**
   * FOURNISSEUR-VRAI-1 (AUDIT-B+2 F-22) — a refusal that another tap can
   * cure KEEPS the photo he chose (`previewUri`): the card goes on showing it
   * with « Envoyer la preuve » armed, so « Réessayez » and « Appuyez à nouveau
   * sur Envoyer la preuve » name a button that is on screen. A refusal no
   * retry can cure (terms mismatch, not his order) drops it, as before.
   */
  | { readonly etat: 'refus'; readonly orderId: string; readonly messageKey: string; readonly previewUri?: string };

export const PRET_REPOS: PretUi = { etat: 'repos' };

/** One flow at a time: choosing a photo while another order sends is ignored. */
export function pretChoisir(ui: PretUi, orderId: string, previewUri: string): PretUi | null {
  if (ui.etat === 'envoi') return null;
  return { etat: 'photo_choisie', orderId, previewUri };
}

export function pretEnvoyer(ui: PretUi): PretUi | null {
  if (ui.etat === 'repos' || pretPhotoEnMain(ui) === null) return null;
  return { etat: 'envoi', orderId: ui.orderId };
}

/** The photo the card still holds, ready to send — chosen, or kept through a
 *  refusal a retry can cure (F-22). `null` means « Choisir la photo » is the act. */
export function pretPhotoEnMain(ui: PretUi): string | null {
  if (ui.etat === 'photo_choisie') return ui.previewUri;
  if (ui.etat === 'refus') return ui.previewUri ?? null;
  return null;
}

/**
 * FOURNISSEUR-VRAI-1 (AUDIT-B+2 F-21) — the photo he picked could not be
 * opened (a format this phone cannot decode, or bytes the privacy strip
 * cannot prove clean): its own sentence on HIS card, never a silent dead tap.
 * `null` while another card is sending, so a refusal on card B can never
 * overwrite card A's send in flight.
 */
export function pretPhotoRefusee(ui: PretUi, orderId: string, messageKey: string): PretUi | null {
  if (ui.etat === 'envoi') return null;
  return { etat: 'refus', orderId, messageKey };
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

/** The refusals another send can cure — the photo stays in his hand (F-22). */
const PRET_RETENTABLE: readonly string[] = [
  'photo_echec', 'unreachable', 'challenge_expired', 'challenge_missing_or_mismatched', 'challenge_already_used',
];

export function pretIssue(
  orderId: string,
  result: ReadyResult | { readonly ok: false; readonly reason: 'photo_echec' },
  previewUri?: string,
): PretIssue {
  if ('ok' in result && result.ok) return { ui: PRET_REPOS, then: 'refresh' };
  if (result.reason === 'bad_code') return { ui: PRET_REPOS, then: 'bad_code' };
  if (result.reason === 'already_ready') return { ui: PRET_REPOS, then: 'refresh' }; // it IS ready — show the truth
  const garde = previewUri !== undefined && PRET_RETENTABLE.includes(result.reason) ? { previewUri } : {};
  if (result.reason === 'photo_echec') {
    return { ui: { etat: 'refus', orderId, messageKey: 'fournisseur.pret_photo_echec', ...garde }, then: 'none' };
  }
  return { ui: { etat: 'refus', orderId, messageKey: pretRefusKey(result.reason), ...garde }, then: 'none' };
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
    // FOURNISSEUR-VRAI-1 (AUDIT-B+2 F-07) — STOCK-JOURNAL-1's freeze. The
    // cause only: the founder confirms stock, so there is no act to ask of him.
    case 'stock_unconfirmed':
      return 'fournisseur.produit_stock_gele';
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
