/**
 * CONSOLE-1 — the operator's client to the LIVE fulfillment book
 * (`GET /fulfillment/orders` on offer-service, ORDER-PAID-WIRE-1c).
 *
 * ═══ THE KEY IS TYPED BY THE FOUNDER, NEVER BUNDLED ═══
 *
 * Every other credential this app presents ships inside the published bundle
 * (the write key — a scanner-stopper, not a secret). THIS one is different in
 * kind: `FULFILLMENT_OPS_SECRET` unlocks supplier identities and every paid
 * order on the platform, it exists in exactly two places — the Worker's
 * encrypted store and the founder's head — and it must never become a third.
 * So there is NO `EXPO_PUBLIC_*` for it, deliberately: the resolver takes the
 * key as an argument from the screen that asked the founder for it, and the
 * only persistence is the founder's own browser (`localStorage`, his device,
 * his choice to save it there). An attacker with the public bundle holds
 * nothing.
 *
 * UNSET RESOLVES TO NOTHING, NEVER TO DEMO — the standing law of this app's
 * outbound ports (`supply/service.ts` states the scar in full). There is no
 * demo book and no import of one.
 *
 * RN-safe: no `@platform/*` runtime import (Metro law). The record shape is
 * mirrored locally; the SERVICE validated the canon event at intake, so what
 * this port reads is already refused-or-true.
 */

/**
 * CONSOLE-2 — the operator's own chase mark, merged onto the row by the book.
 * « J'ai appelé le fournisseur », with the SERVER's clock. Never readiness:
 * canon readiness (B+I-06 — photo + `sellerReadinessChallenge`) is the
 * supplier's evidenced act and gates custody; this is a phone call.
 */
export interface RelanceMark {
  readonly at: string;
  readonly count: number;
}

/**
 * READINESS-WIRE-1a — the REAL preparation signal, merged onto the row by the
 * book: the supplier ACCEPTED (B6.1) and/or confirmed « Produit prêt » with
 * evidence + the challenge (B6.2). Server clocks both. This is the signal the
 * founder's 10-minute rule was always waiting for — a relance is his phone
 * call; THIS is the supplier's own act.
 */
export interface FulfillmentMark {
  readonly acceptedAt?: string;
  readonly readyAt?: string;
  /** REMBOURSEMENT-2 — the supplier refused the order (« je ne peux pas
   *  fournir »); the buyer is refunded. */
  readonly refusedAt?: string;
  /** REMBOURSABLE-1 (F-02) — present when the refusal was HIS « Annuler et
   *  rembourser », never the supplier's. */
  readonly refusPar?: 'fondateur' | 'delai';
  /** REMBOURSABLE-1 (F-61) — the book's own road marks, so a finished order is
   *  classed without any other Worker's read: the supplier's confirmed handover,
   *  Séra's delivery, the colis back home, the rider's refusal at pickup. */
  readonly handedOverAt?: string;
  readonly deliveredAt?: string;
  readonly returnedAt?: string;
  readonly pickupRefusedAt?: string;
}

/** Mirrors `PaidOrderRecord` (offer-service `worker/fulfillment-do.ts`). */
export interface PaidOrderRow {
  readonly orderId: string;
  readonly productVersionId: string;
  /** Enriched at intake from the offer store's own entry; '' when unknown. */
  readonly productName: string;
  /**
   * PHOTO-À-TRAITER — the product's square hero, joined by the Worker at READ
   * time from the same offer entry the name comes from. A media REF, not a
   * url: the screen builds `${mediaBase}/${ref}` exactly as the produits
   * screens do, and reads are unauthenticated.
   *
   * '' IS THE HONEST ABSENCE and covers FOUR different truths — the pv is
   * unknown to the store · the product carries no assets · this app is talking
   * to a Worker built before the join existed · or the row fell past the
   * Worker's per-read lookup cap (`PHOTO_LOOKUP_MAX`, oldest rows first). All
   * four render the row with no picture; none of them ever substitutes a
   * stand-in image. The fourth is the only one that can differ between two
   * reads of the SAME row, which is why the screen must never treat '' as a
   * fact about the product.
   */
  readonly productPhotoRef: string;
  readonly offerVersion: string;
  readonly paymentMode: string;
  readonly paidAt: string;
  readonly zoneTo: string;
  readonly sellerBasePrice: number;
  readonly supplierId: string;
  readonly supplierResolved: boolean;
  readonly registeredAt: string;
  /** Absent until the operator has called about this order. */
  readonly relance?: RelanceMark;
  /** Absent until the supplier has accepted or confirmed ready. */
  readonly fulfillment?: FulfillmentMark;
  /** STOCK-VENDU-1b — the sale arrived on an EMPTY counter (money moved,
   *  stock did not exist); rows from before the mark never carry it. */
  readonly oversold?: boolean;
  /** COLIS-FOURNISSEUR-1 — the package this order travels in (one buyer, one
   *  supplier, one course): its id and every order in it. Absent when alone. */
  readonly colis?: { readonly packageId: string; readonly orderIds: readonly string[] };
}

export type PaidOrdersResult =
  /** CROISSANCE-1 — `incomplet` TRUE means the page cap ended the sweep with
   *  pages still standing: the rows are real, the book is declared partial. */
  | { readonly ok: true; readonly orders: readonly PaidOrderRow[]; readonly incomplet?: boolean }
  /** The key was REFUSED — a different honest sentence from « unreachable »:
   *  one asks the founder to re-check what he typed, the other to retry. */
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

export type RelanceResult =
  | { readonly ok: true }
  /** `unknown_order`: the book has no such order — the board is stale, so the
   *  screen re-reads rather than pretending the call was logged. */
  | { readonly ok: false; readonly reason: 'bad_key' | 'unknown_order' | 'unreachable' };

/**
 * PURGE-ESSAI (founder ruling 2026-08-10) — retiring ONE test order.
 *
 * There is deliberately no `unknown_order` arm: the Worker answers 200
 * `inconnu` for an order it never knew or already retired, because a sweep
 * that re-runs after a lost response must converge quietly instead of
 * painting a red row for work that is already done. « Gone » is the outcome
 * the founder asked for, and it is true in both cases.
 */
export type RetraitResult =
  | { readonly ok: true }
  /** REMBOURSABLE-1 (F-37) — `refus_en_attente`: a refund notice for this
   *  order has not reached Shop+ yet, and retiring it now would lose it. The
   *  book refuses by name; the row stays and he can try again shortly. */
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' | 'refus_en_attente' };

/**
 * REMBOURSABLE-1 (AUDIT-B+2 F-02) — « Annuler et rembourser ».
 * `already_refused` is a SUCCESS for him: the order was already refunding (his
 * earlier tap, or the supplier's own refusal), and the book said so.
 * `deja_prete`: the colis is on Séra's road — the rider's check is the refusal
 * there. `inconnue`: the book no longer holds this order (retired meanwhile).
 */
export type AnnulerResult =
  | { readonly ok: true; readonly status: 'annulee' | 'already_refused' }
  | { readonly ok: false; readonly reason: 'bad_key' | 'deja_prete' | 'inconnue' | 'unreachable' };

/**
 * CONSOLE-3 — one active door per supplier, as the book holds it. Mirrors the
 * DO's /codes allowlist: supplierId + mintedAt, NOTHING else ever arrives
 * (no hash, no code — a code's plaintext exists only in the mint answer).
 */
export interface CodeRow {
  readonly supplierId: string;
  readonly mintedAt: string;
  /** CODE-REVU (founder ruling 2026-08-09): true when « Voir le code » can
   *  answer — false for codes minted before the plaintext was kept. Absent
   *  on the wire reads FALSE, never « probably yes ». */
  readonly revelable: boolean;
  /**
   * RETRAIT-ACCÈS (founder 2026-08-11) — WHEN his access was cut, if it was.
   * Absent means an ACTIVE door.
   *
   * The row survives a revoke on purpose: erasing it left him with « the
   * supplier's name and everything is gone, there is no way to remint code
   * under the same supplier again ». Every reader must decide what to do with a
   * marked row — the console shows him with a way back, the Produits chip row
   * drops him — and none may treat it as a live door.
   */
  readonly revokedAt?: string;
  /**
   * REMBOURSABLE-1 (AUDIT-B+2 F-02) — how many of his PAID orders are still
   * open (not refused or cancelled, delivered, returned, or refused at pickup),
   * so « Couper l'accès » is never blind to them. Absent when the Worker did not
   * say (one built before the count) — never a zero nobody measured.
   */
  readonly commandesOuvertes?: number;
}

/**
 * INVENTAIRE-COMPLET (founder report 2026-08-11) — EVERY offer on the platform,
 * each tagged with whose it is.
 *
 * The scoped list (`supply/service.ts`) can only ask for one supplier at a
 * time, and his screen sourced those ids from the ACTIVE-CODE roster — so a
 * product whose supplier no longer holds a code was invisible AND undeletable
 * from Boutik+, while `/supply-projections` went on serving it to Shop+. He saw
 * that as « deleted and still on Opportunités »; it had never been deletable.
 *
 * The row is the SAME shape the scoped list returns, plus `supplierId`, because
 * the Worker builds both through one builder — the two reads cannot disagree
 * about a product.
 */
export interface InventaireRow {
  readonly offerId: string;
  readonly productVersionId: string;
  readonly name: string;
  readonly category: string;
  readonly basePrice: number;
  readonly resellerCommission: number;
  readonly available: number;
  readonly assetRefs: readonly string[];
  readonly supplierId: string;
  readonly videoRef?: string;
  readonly variantsNote?: string;
  readonly hiddenReason?: string;
  /** STOCK-JOURNAL-1 — when the count was last vouched for; absent = never. */
  readonly stockConfirmedAt?: string;
}

export type InventaireResult =
  | { readonly ok: true; readonly rows: readonly InventaireRow[]; readonly incomplet?: boolean }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

export type CodesResult =
  | { readonly ok: true; readonly codes: readonly CodeRow[] }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

export type MintResult =
  /** The plaintext code — shown ONCE, never stored anywhere by this app. */
  | {
      readonly ok: true; readonly code: string; readonly supplierId: string; readonly mintedAt: string;
      /** CATALOGUE-PAGES-1 — the code stands, but not every product he had
       *  retired is back on sale yet: « Finir » walks the rest. */
      readonly produitsIncomplets?: true;
    }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

/**
 * PURGE-FOURNISSEUR (founder 2026-08-11: « add a button to remove and erase
 * completely the supplier and all its products »). IRREVERSIBLE.
 *
 * `refs` is what the service could not destroy itself — the photographs' opaque
 * keys. The media revoke credential is the founder's alone and never enters the
 * offer Worker, so the CONSOLE destroys the bytes with them. An erase that
 * dropped the records and left every photograph readable at its url would be
 * « erased » as a word, not as a fact.
 *
 * The two refusals that are NOT failures are named: `acces_actif` (cut him off
 * first — the erase is a second, deliberate step) and `a_des_commandes` (money
 * history makes a supplier un-erasable; the ledger wins over tidiness).
 */
export type EffacerResult =
  | { readonly ok: true; readonly supprimes: number; readonly refs: readonly string[] }
  /**
   * ⚠ THE PARTIAL THAT MUST NOT BE FLATTENED (verifier BLOCKER). The service
   * deletes the CATALOGUE first and the registry row last; when the second half
   * fails it answers `registre_echoue` — 502, but CARRYING the media refs it
   * already orphaned. The first version of this type had no such case, so the
   * branch collapsed to `unreachable` and the refs were DROPPED: the products
   * were gone forever and every photograph stayed readable at its url, with no
   * second chance, because a retry re-walks an index those offers already left
   * and recomputes `refs: []`. A permanent leak, on an irreversible act, in the
   * one branch the design claims to cover.
   */
  | { readonly ok: false; readonly reason: 'registre_echoue'; readonly supprimes: number; readonly refs: readonly string[] }
  /**
   * CATALOGUE-PAGES-1 (F-05) — the erase goes a page at a time now, and one
   * page failing after others succeeded leaves part of his catalogue gone:
   * those refs are the only road to their photographs, so they travel here
   * exactly as the registry partial's do. Pressing again finishes the rest.
   */
  | { readonly ok: false; readonly reason: 'purge_inachevee'; readonly supprimes: number; readonly refs: readonly string[] }
  /** REMBOURSABLE-1 (F-33) — `paiement_en_cours`: a buyer holds one of his
   *  units while she pays; nothing was erased, and the hold lapses within a
   *  quarter of an hour. */
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' | 'inconnu' | 'acces_actif' | 'a_des_commandes' | 'purge_echouee' | 'paiement_en_cours' };

export type RevokeResult =
  /** `produitsIncomplets` — the door is shut, but not every product is off
   *  sale yet (CATALOGUE-PAGES-1): « Finir » walks the rest. */
  | { readonly ok: true; readonly status: 'revoked' | 'no_code'; readonly produitsIncomplets?: true }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

/** RB-1 — the founder's own card per supplier (name + phone, his decision
 *  2026-08-08). `phone` may be '' — a named supplier with no number renders
 *  the call button's honest empty state. */
export interface SupplierContact {
  readonly supplierId: string;
  readonly name: string;
  readonly phone: string;
}

export type ContactsResult =
  | { readonly ok: true; readonly contacts: readonly SupplierContact[] }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

export type SaveContactResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' | 'malformed' };

/** RB-1 — the supplier's readiness proof, one order at a time. The photoRef is
 *  the canon MediaRef the supplier attached to « Produit prêt »; the renderer
 *  builds `${mediaBase}/${ref}` exactly as the produits screens do. */
export interface OrderEvidence {
  readonly photoRef: { readonly ref: string; readonly sha256: string; readonly mimeType: string };
  readonly readyAt: string;
  readonly qty: number;
  readonly variant: string;
}

export type EvidenceResult =
  | { readonly ok: true; readonly evidence: OrderEvidence }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' | 'not_ready' | 'unknown_order' };

export interface OperationsServicePort {
  listPaidOrders(opsKey: string): Promise<PaidOrdersResult>;
  /** RB-1 — read his contact cards, save one (last write wins), and read one
   *  order's readiness proof. Same key as the board: one door, one identity. */
  listSupplierContacts(opsKey: string): Promise<ContactsResult>;
  /** INVENTAIRE-COMPLET — every offer, whoever it belongs to. His key only. */
  listInventaire(opsKey: string): Promise<InventaireResult>;
  saveSupplierContact(opsKey: string, card: SupplierContact): Promise<SaveContactResult>;
  orderEvidence(opsKey: string, orderId: string): Promise<EvidenceResult>;
  /** Records « j'ai appelé le fournisseur ». NO timestamp crosses the wire —
   *  the Worker stamps its own clock. */
  recordRelance(opsKey: string, orderId: string): Promise<RelanceResult>;
  /** PURGE-ESSAI — retire ONE test order from the book. One id per call: the
   *  Worker has no « retirer tout » and must never grow one. */
  retirerCommande(opsKey: string, orderId: string): Promise<RetraitResult>;
  /** REMBOURSABLE-1 (F-02) — « Annuler et rembourser »: HIS cancellation of a
   *  paid order not yet ready. One id; the Worker stamps the clock and names the
   *  act as his. */
  annulerCommande(opsKey: string, orderId: string): Promise<AnnulerResult>;
  /** CONSOLE-3 — the code inventory (who holds a door, since when). */
  listCodes(opsKey: string): Promise<CodesResult>;
  /** Mint (or re-mint — the book replaces atomically) one supplier's code. */
  mintCode(opsKey: string, supplierId: string): Promise<MintResult>;
  /** Cut a supplier off. Idempotent — `no_code` is an honest answer. */
  revokeCode(opsKey: string, supplierId: string): Promise<RevokeResult>;
  /** CATALOGUE-PAGES-1 — finish the product half of a cut (`revoke`) or a
   *  re-mint (`mint`) from the start, without touching the code itself. */
  finirProduits(opsKey: string, supplierId: string, acte: 'revoke' | 'mint'): Promise<FinirProduitsResult>;
  /** PURGE-FOURNISSEUR — erase him and every product he owns. IRREVERSIBLE, and
   *  refused by name when his access is still live or he has paid orders. */
  effacerFournisseur(opsKey: string, supplierId: string): Promise<EffacerResult>;
  /** CODE-REVU — reread a code already given (founder ruling 2026-08-09).
   *  `code_anterieur` names a pre-ruling code the book cannot show back. */
  revealCode(opsKey: string, supplierId: string): Promise<RevealResult>;
  /** STOCK-JOURNAL-1 — « Confirmer le stock »: the count HE TYPED for one
   *  offer. Equal to the counter the service journals `confirme`, different it
   *  journals `ajuste` and sets the counter; either restarts the freeze clock.
   *  His key only — the bundled write key never opens this door. */
  confirmStock(opsKey: string, cmd: ConfirmStockCommand): Promise<ConfirmStockResult>;
}

export interface ConfirmStockCommand {
  readonly commandId: string;
  readonly offerId: string;
  readonly available: number;
}

export type ConfirmStockResult =
  | {
      readonly ok: true;
      readonly status: 'confirmed' | 'adjusted' | 'idempotent';
      readonly available: number;
      readonly stockConfirmedAt: string | null;
    }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' | 'invalid_qty' | 'unknown_offer' };

export type FinirProduitsResult =
  | { readonly ok: true; readonly complet: boolean }
  /** `acces_change` — his door changed since (re-minted after a cut, or cut
   *  after a re-mint): walking on would undo his newer act, so nothing moves. */
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' | 'acces_change' };

/**
 * CROISSANCE-1 / CATALOGUE-PAGES-1 (AUDIT-B+2 F-89 c, F-05) — the service now
 * answers these reads a PAGE at a time (each within the platform's
 * per-request budget) with a `next` while more remain. The ports follow the
 * cursor, WHOLE-OR-NOTHING (DISPATCH-PAGES-1's law: a half list dressed as the
 * whole would hide real rows), and an older Worker answers everything with no
 * `next` — one round trip, done.
 */
export const PAGE_CARNET = 100;
export const PAGES_MAX_CARNET = 50;
export const PAGE_CATALOGUE = 40;
export const PAGES_MAX_CATALOGUE = 25;
/**
 * The cut's, the re-mint's and the erase's walks: every page is bounded, so
 * these caps only stop a runaway loop — sized to FINISH a real catalogue
 * (500 × 20 = 10 000 offers on the platform), never to give up at 1 000 (the
 * slice's verifier, MINOR 4: a walk that stops there reports his products
 * unfinished for ever, or the erase as « service unreachable »).
 */
export const PAGES_MAX_ACCES = 500;

export type RevealResult =
  | { readonly ok: true; readonly code: string; readonly supplierId: string }
  | { readonly ok: false; readonly reason: 'bad_key' | 'no_code' | 'code_anterieur' | 'unreachable' };

/**
 * Dot access on `process.env.EXPO_PUBLIC_*` (member expression), the same
 * Metro-inlining rule `supply/service.ts` documents: a computed access is
 * invisible to the inliner and ships `undefined` forever.
 */
export function resolveOperationsService(): OperationsServicePort | null {
  const base = process.env.EXPO_PUBLIC_OFFER_BASE;
  if (base === undefined || base === '') return null;
  const trimmed = base.replace(/\/$/, '');

  /** CATALOGUE-PAGES-1 — one page of a cut's (or a re-mint's) product walk;
   *  no cursor = from the start (« Finir »). */
  async function pageProduits(
    opsKey: string,
    supplierId: string,
    acte: 'revoke' | 'mint',
    cursor: string | undefined,
  ): Promise<{ ok: true; suite?: string } | { ok: false; reason: 'bad_key' | 'unreachable' | 'acces_change' | 'curseur_perdu' }> {
    let res: Response;
    try {
      res = await fetch(`${trimmed}/fulfillment/supplier-acces/suite`, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${opsKey}` },
        body: JSON.stringify({ supplierId, acte, ...(cursor !== undefined ? { cursor } : {}) }),
      });
    } catch {
      return { ok: false, reason: 'unreachable' };
    }
    if (res.status === 401) return { ok: false, reason: 'bad_key' };
    const body = (await res.json().catch(() => null)) as { ok?: boolean; produits?: unknown; suite?: unknown; reason?: unknown } | null;
    if (res.status === 409 && body?.reason === 'acces_change') return { ok: false, reason: 'acces_change' };
    if (res.status === 409 && body?.reason === 'curseur_perdu') return { ok: false, reason: 'curseur_perdu' };
    // `produits: null` — the page's walk itself failed: not done, whatever else it says.
    if (!res.ok || body?.ok !== true || body.produits === null) return { ok: false, reason: 'unreachable' };
    return typeof body.suite === 'string' && body.suite !== '' ? { ok: true, suite: body.suite } : { ok: true };
  }

  /** Follow the product walk a code act began. TRUE only when it provably
   *  reached the end: a failed first walk (`produits: null`) or any failed
   *  page is « not finished », said on his row, never a silent success. */
  async function suivreProduits(
    opsKey: string,
    supplierId: string,
    acte: 'revoke' | 'mint',
    produits: unknown,
    suite: unknown,
  ): Promise<boolean> {
    if (produits === null) return false;
    let cursor = typeof suite === 'string' && suite !== '' ? suite : undefined;
    let reprise = false;
    for (let tour = 0; cursor !== undefined; tour += 1) {
      if (tour >= PAGES_MAX_ACCES) return false;
      const r = await pageProduits(opsKey, supplierId, acte, cursor);
      if (!r.ok && r.reason === 'curseur_perdu' && !reprise) {
        // an offer deleted between two pages took the cursor: walk again from
        // the start (a walked offer answers « no change » and costs no write)
        reprise = true;
        const depuisDebut = await pageProduits(opsKey, supplierId, acte, undefined);
        if (!depuisDebut.ok) return false;
        cursor = depuisDebut.suite;
        continue;
      }
      if (!r.ok) return false;
      cursor = r.suite;
    }
    return true;
  }

  return {
    async listPaidOrders(opsKey: string): Promise<PaidOrdersResult> {
      const orders: PaidOrderRow[] = [];
      let cursor: string | undefined;
      for (let tour = 0; tour < PAGES_MAX_CARNET; tour += 1) {
        let res: Response;
        try {
          res = await fetch(
            `${trimmed}/fulfillment/orders?limit=${PAGE_CARNET}${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
            { headers: { Accept: 'application/json', Authorization: `Bearer ${opsKey}` } },
          );
        } catch {
          return { ok: false, reason: 'unreachable' };
        }
        if (res.status === 401) return { ok: false, reason: 'bad_key' };
        if (!res.ok) return { ok: false, reason: 'unreachable' };
        const body = (await res.json().catch(() => null)) as { ok?: boolean; orders?: unknown; next?: unknown } | null;
        if (body?.ok !== true || !Array.isArray(body.orders)) return { ok: false, reason: 'unreachable' };
        // Shape-READ row by row: a record the book never wrote is DROPPED, never
        // rendered half-formed — the console's whole worth is that every line on
        // it is true. Reading (not just guarding) matters for the two fields
        // records written BEFORE the productName enrichment lack: they normalize
        // to '', so the screen's fallback-to-pv-id renders instead of a blank
        // title on precisely the oldest rows.
        for (const raw of body.orders) {
          const row = readPaidOrderRow(raw);
          if (row !== null) orders.push(row);
        }
        if (typeof body.next !== 'string' || body.next === '') return { ok: true, orders: plusRecentesDabord(orders) };
        cursor = body.next;
      }
      return { ok: true, orders: plusRecentesDabord(orders), incomplet: true };
    },

    async listInventaire(opsKey: string): Promise<InventaireResult> {
      let rows: InventaireRow[] = [];
      let cursor: string | undefined;
      let reprise = false;
      for (let tour = 0; tour < PAGES_MAX_CATALOGUE; tour += 1) {
        let res: Response;
        try {
          res = await fetch(
            `${trimmed}/offers/inventaire?limit=${PAGE_CATALOGUE}${cursor === undefined ? '' : `&cursor=${encodeURIComponent(cursor)}`}`,
            { headers: { Accept: 'application/json', Authorization: `Bearer ${opsKey}` } },
          );
        } catch {
          return { ok: false, reason: 'unreachable' };
        }
        if (res.status === 401) return { ok: false, reason: 'bad_key' };
        // The row the cursor named left between two pages: sweep once more from
        // the start rather than guess where the list now resumes.
        if (res.status === 409 && !reprise) {
          reprise = true;
          rows = [];
          cursor = undefined;
          continue;
        }
        if (!res.ok) return { ok: false, reason: 'unreachable' };
        const body = (await res.json().catch(() => null)) as { items?: unknown; next?: unknown } | null;
        if (!Array.isArray(body?.items)) return { ok: false, reason: 'unreachable' };
        rows.push(...lireInventaire(body.items));
        if (typeof body.next !== 'string' || body.next === '') return { ok: true, rows };
        cursor = body.next;
      }
      return { ok: true, rows, incomplet: true };
    },

    async confirmStock(opsKey: string, cmd: ConfirmStockCommand): Promise<ConfirmStockResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/offers/stock`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${opsKey}` },
          body: JSON.stringify({ commandId: cmd.commandId, offerId: cmd.offerId, available: cmd.available }),
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      if (res.status === 404) return { ok: false, reason: 'unknown_offer' };
      if (res.status === 400) return { ok: false, reason: 'invalid_qty' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      const body = (await res.json().catch(() => null)) as
        | { status?: unknown; available?: unknown; stockConfirmedAt?: unknown }
        | null;
      if (
        body === null ||
        (body.status !== 'confirmed' && body.status !== 'adjusted' && body.status !== 'idempotent') ||
        typeof body.available !== 'number'
      ) {
        return { ok: false, reason: 'unreachable' };
      }
      return {
        ok: true,
        status: body.status,
        available: body.available,
        stockConfirmedAt: typeof body.stockConfirmedAt === 'string' ? body.stockConfirmedAt : null,
      };
    },

  async listSupplierContacts(opsKey: string): Promise<ContactsResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/supplier-contacts`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${opsKey}` },
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      const body = (await res.json().catch(() => null)) as { ok?: boolean; contacts?: unknown } | null;
      if (body?.ok !== true || !Array.isArray(body.contacts)) return { ok: false, reason: 'unreachable' };
      // Strict rows, the standing law: a malformed card is DROPPED, never
      // rendered half-formed.
      const contacts: SupplierContact[] = [];
      for (const raw of body.contacts) {
        if (raw === null || typeof raw !== 'object') continue;
        const c = raw as Record<string, unknown>;
        if (typeof c['supplierId'] !== 'string' || c['supplierId'] === '') continue;
        if (typeof c['name'] !== 'string' || c['name'] === '') continue;
        contacts.push({
          supplierId: c['supplierId'],
          name: c['name'],
          phone: typeof c['phone'] === 'string' ? c['phone'] : '',
        });
      }
      return { ok: true, contacts };
    },

    async saveSupplierContact(opsKey: string, card: SupplierContact): Promise<SaveContactResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/supplier-contact`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opsKey}`,
          },
          body: JSON.stringify(card),
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      if (res.status === 400) return { ok: false, reason: 'malformed' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      return { ok: true };
    },

    async orderEvidence(opsKey: string, orderId: string): Promise<EvidenceResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/order-evidence?orderId=${encodeURIComponent(orderId)}`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${opsKey}` },
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.status === 404) {
        // The two honest absences, distinguished: « pas encore prêt » is a
        // state of the order; « inconnu » is a typo or a stale row.
        return { ok: false, reason: body?.['reason'] === 'not_ready' ? 'not_ready' : 'unknown_order' };
      }
      if (!res.ok || body?.['ok'] !== true) return { ok: false, reason: 'unreachable' };
      const ref = body['photoRef'];
      if (ref === null || typeof ref !== 'object') return { ok: false, reason: 'unreachable' };
      const r = ref as Record<string, unknown>;
      if (typeof r['ref'] !== 'string' || r['ref'] === '') return { ok: false, reason: 'unreachable' };
      return {
        ok: true,
        evidence: {
          photoRef: {
            ref: r['ref'],
            sha256: typeof r['sha256'] === 'string' ? r['sha256'] : '',
            mimeType: typeof r['mimeType'] === 'string' ? r['mimeType'] : '',
          },
          readyAt: typeof body['readyAt'] === 'string' ? body['readyAt'] : '',
          qty: typeof body['qty'] === 'number' ? body['qty'] : 1,
          variant: typeof body['variant'] === 'string' ? body['variant'] : '',
        },
      };
    },

    async recordRelance(opsKey: string, orderId: string): Promise<RelanceResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/relance`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opsKey}`,
          },
          // ONLY the id. The Worker stamps the time — a client-claimed clock
          // is exactly the class of defect the emitter's `paidAt` round taught.
          body: JSON.stringify({ orderId }),
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      if (res.status === 404) return { ok: false, reason: 'unknown_order' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      return { ok: true };
    },

    async retirerCommande(opsKey: string, orderId: string): Promise<RetraitResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/order/retirer`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opsKey}`,
          },
          // ONLY the id — the same envelope discipline as the relance beside
          // it: nothing a caller invents reaches the object's delete path.
          body: JSON.stringify({ orderId }),
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      if (res.status === 409) {
        const b = (await res.json().catch(() => null)) as { reason?: unknown } | null;
        if (b?.reason === 'refus_en_attente') return { ok: false, reason: 'refus_en_attente' };
      }
      // Anything else non-2xx is « we do not know that it happened » — the row
      // stays on the board and he can ask again. Never a cheerful default.
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      return { ok: true };
    },

    async annulerCommande(opsKey: string, orderId: string): Promise<AnnulerResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/order/annuler`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${opsKey}`,
          },
          // ONLY the id: the book refuses any other field by name.
          body: JSON.stringify({ orderId }),
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      const body = (await res.json().catch(() => null)) as { ok?: unknown; status?: unknown; reason?: unknown } | null;
      if (res.status === 409 && body?.reason === 'already_ready') return { ok: false, reason: 'deja_prete' };
      if (res.status === 404 && body?.reason === 'unknown_order') return { ok: false, reason: 'inconnue' };
      if (!res.ok || body?.ok !== true || (body.status !== 'annulee' && body.status !== 'already_refused')) {
        return { ok: false, reason: 'unreachable' };
      }
      return { ok: true, status: body.status };
    },

    async listCodes(opsKey: string): Promise<CodesResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/supplier-codes`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${opsKey}` },
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      const body = (await res.json().catch(() => null)) as { ok?: boolean; codes?: unknown } | null;
      if (body?.ok !== true || !Array.isArray(body.codes)) return { ok: false, reason: 'unreachable' };
      // Strict rows, the console's standing law: a malformed row is DROPPED,
      // never rendered half-formed.
      const codes: CodeRow[] = [];
      for (const raw of body.codes) {
        const row = readCodeRow(raw);
        if (row !== null) codes.push(row);
      }
      return { ok: true, codes };
    },

    async mintCode(opsKey: string, supplierId: string): Promise<MintResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/supplier-code?limit=20`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${opsKey}` },
          // EXACTLY {supplierId} — the book's exact-key check refuses anything
          // more, and this port will not learn to smuggle.
          body: JSON.stringify({ supplierId }),
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (
        body?.['ok'] !== true ||
        typeof body['code'] !== 'string' || body['code'] === '' ||
        typeof body['supplierId'] !== 'string' || body['supplierId'] === '' ||
        typeof body['mintedAt'] !== 'string' || body['mintedAt'] === ''
      ) {
        return { ok: false, reason: 'unreachable' };
      }
      // CATALOGUE-PAGES-1 — the products this cut had retired come back a
      // page at a time; the code already stands whatever happens below.
      const complet = await suivreProduits(opsKey, body['supplierId'], 'mint', body['produits'], body['suite']);
      return {
        ok: true, code: body['code'], supplierId: body['supplierId'], mintedAt: body['mintedAt'],
        ...(complet ? {} : { produitsIncomplets: true as const }),
      };
    },

    async revealCode(opsKey: string, supplierId: string): Promise<RevealResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/supplier-code/reveal`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${opsKey}` },
          body: JSON.stringify({ supplierId }),
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (res.status === 404 || res.status === 409) {
        const reason = body?.['reason'];
        return { ok: false, reason: reason === 'no_code' || reason === 'code_anterieur' ? reason : 'unreachable' };
      }
      if (!res.ok || body?.['ok'] !== true || typeof body['code'] !== 'string' || body['code'] === '') {
        return { ok: false, reason: 'unreachable' };
      }
      return { ok: true, code: body['code'], supplierId };
    },

    async effacerFournisseur(opsKey: string, supplierId: string): Promise<EffacerResult> {
      /**
       * CATALOGUE-PAGES-1 (F-05) — TWO SWEEPS, a page per request. First the
       * read-only one over his whole catalogue (F-33: nothing removed while a
       * buyer holds a unit), then the erase itself. Every page carries back the
       * refs of what it erased; they are collected across pages so a failure
       * on page five still hands over the photographs of pages one to four.
       */
      const appel = async (corps: Record<string, unknown>): Promise<Response | null> => {
        try {
          return await fetch(`${trimmed}/fulfillment/supplier/effacer`, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${opsKey}` },
            body: JSON.stringify({ supplierId, ...corps }),
          });
        } catch {
          return null;
        }
      };
      let suite: string | undefined;
      let relu = false;
      for (let tour = 0; ; tour += 1) {
        if (tour >= PAGES_MAX_ACCES) return { ok: false, reason: 'unreachable' };
        const v = await appel({ etape: 'verifier', ...(suite !== undefined ? { cursor: suite } : {}) });
        if (v === null) return { ok: false, reason: 'unreachable' };
        if (v.status === 401) return { ok: false, reason: 'bad_key' };
        const vb = (await v.json().catch(() => null)) as { ok?: boolean; verifie?: unknown; suite?: unknown; reason?: unknown } | null;
        if (!v.ok) {
          if (vb?.reason === 'curseur_perdu' && !relu) { relu = true; suite = undefined; continue; }
          return lireEffacement(v.status, vb);
        }
        if (vb?.verifie !== true) {
          // An older Worker ignored the step and erased everything in one
          // request: its answer IS the final one.
          return lireEffacement(v.status, vb);
        }
        if (typeof vb.suite !== 'string' || vb.suite === '') break;
        suite = vb.suite;
      }
      const refs: string[] = [];
      let supprimes = 0;
      suite = undefined;
      relu = false;
      for (let tour = 0; tour < 4 * PAGES_MAX_ACCES; tour += 1) {
        const e = await appel({ etape: 'effacer', ...(suite !== undefined ? { cursor: suite } : {}) });
        const partiel = (): EffacerResult =>
          supprimes > 0 || refs.length > 0
            ? { ok: false, reason: 'purge_inachevee', supprimes, refs: [...new Set(refs)] }
            : { ok: false, reason: 'unreachable' };
        if (e === null) return partiel();
        if (e.status === 401) return supprimes > 0 || refs.length > 0 ? partiel() : { ok: false, reason: 'bad_key' };
        const eb = (await e.json().catch(() => null)) as { ok?: boolean; supprimes?: unknown; refs?: unknown; fini?: unknown; suite?: unknown; reason?: unknown } | null;
        const pageRefs = Array.isArray(eb?.refs) ? eb.refs.filter((x): x is string => typeof x === 'string' && x.startsWith('media/')) : [];
        refs.push(...pageRefs);
        if (typeof eb?.supprimes === 'number') supprimes += eb.supprimes;
        if (!e.ok) {
          if (eb?.reason === 'curseur_perdu' && !relu) { relu = true; suite = undefined; continue; }
          if (eb?.reason === 'registre_echoue') return { ok: false, reason: 'registre_echoue', supprimes, refs: [...new Set(refs)] };
          const r = eb?.reason;
          if (supprimes === 0 && refs.length === 0 && (r === 'acces_actif' || r === 'a_des_commandes' || r === 'inconnu' || r === 'paiement_en_cours')) {
            return { ok: false, reason: r };
          }
          return partiel();
        }
        if (eb?.ok !== true) return partiel();
        if (eb.fini === true) return { ok: true, supprimes, refs: [...new Set(refs)] };
        suite = typeof eb.suite === 'string' && eb.suite !== '' ? eb.suite : undefined;
      }
      return { ok: false, reason: 'purge_inachevee', supprimes, refs: [...new Set(refs)] };
    },

    async revokeCode(opsKey: string, supplierId: string): Promise<RevokeResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/supplier-code/revoke?limit=20`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${opsKey}` },
          body: JSON.stringify({ supplierId }),
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      const body = (await res.json().catch(() => null)) as { ok?: boolean; status?: unknown; produits?: unknown; suite?: unknown } | null;
      if (body?.ok !== true || (body.status !== 'revoked' && body.status !== 'no_code')) {
        return { ok: false, reason: 'unreachable' };
      }
      // CATALOGUE-PAGES-1 (F-05) — the door is shut; his products leave sale a
      // page at a time, and a walk that cannot finish SAYS so on his row.
      const complet = await suivreProduits(opsKey, supplierId, 'revoke', body.produits, body.suite);
      return { ok: true, status: body.status, ...(complet ? {} : { produitsIncomplets: true as const }) };
    },

    async finirProduits(opsKey: string, supplierId: string, acte: 'revoke' | 'mint'): Promise<FinirProduitsResult> {
      let cursor: string | undefined;
      let reprise = false;
      for (let tour = 0; tour < PAGES_MAX_ACCES; tour += 1) {
        const r = await pageProduits(opsKey, supplierId, acte, cursor);
        if (!r.ok && r.reason === 'curseur_perdu' && !reprise) {
          reprise = true;
          cursor = undefined;
          continue;
        }
        if (!r.ok) return { ok: false, reason: r.reason === 'curseur_perdu' ? 'unreachable' : r.reason };
        if (r.suite === undefined) return { ok: true, complet: true };
        cursor = r.suite;
      }
      return { ok: true, complet: false };
    },
  };
}

/**
 * One whole-catalogue erase answer — what a Worker from before
 * CATALOGUE-PAGES-1 gives (it ignores the step and erases in one request), and
 * what any typed refusal looks like. The service's TYPED refusals travel
 * verbatim: « cut him off first » and « he has orders » are answers, not errors.
 */
function lireEffacement(
  status: number,
  body: { ok?: boolean; supprimes?: unknown; refs?: unknown; reason?: unknown } | null,
): EffacerResult {
  if (status === 401) return { ok: false, reason: 'bad_key' };
  const ok = status >= 200 && status < 300;
  if (!ok) {
    // The service's TYPED refusals travel verbatim — « cut him off first »
    // and « he has orders » are answers, not errors, and the screen says
    // each in its own words.
    const r = body?.reason;
    if (r === 'acces_actif' || r === 'a_des_commandes' || r === 'inconnu' || r === 'paiement_en_cours') return { ok: false, reason: r };
    // THE PARTIAL — the catalogue is already gone and the refs came with
    // the failure. They are carried out so the caller can still destroy the
    // bytes; dropping them here is unrecoverable (see the type above).
    if (r === 'registre_echoue') {
      return {
        ok: false,
        reason: 'registre_echoue',
        supprimes: typeof body?.supprimes === 'number' ? body.supprimes : 0,
        refs: Array.isArray(body?.refs)
          ? body.refs.filter((x): x is string => typeof x === 'string' && x.startsWith('media/'))
          : [],
      };
    }
    if (r === 'purge_echouee') return { ok: false, reason: 'purge_echouee' };
    return { ok: false, reason: 'unreachable' };
  }
  if (body?.ok !== true || typeof body.supprimes !== 'number' || !Array.isArray(body.refs)) {
    return { ok: false, reason: 'unreachable' };
  }
  // Strict: a ref outside the minted namespace is not one this system made,
  // and the console must never be talked into revoking an arbitrary key.
  const refs = body.refs.filter((r): r is string => typeof r === 'string' && r.startsWith('media/'));
  return { ok: true, supprimes: body.supprimes, refs };
}

/**
 * CROISSANCE-1 — the book pages in STORAGE order; the board has always shown
 * newest first. The Worker's own comparator, applied to rows in the same
 * storage order, so the paged board lists exactly what the whole-book read did.
 */
function plusRecentesDabord(rows: PaidOrderRow[]): PaidOrderRow[] {
  return rows.sort((a, b) => (a.paidAt < b.paidAt ? 1 : -1));
}

/** A malformed inventory row is DROPPED, never rendered half-formed — the
 *  standing law of every read on this console. */
function lireInventaire(items: readonly unknown[]): InventaireRow[] {
  const rows: InventaireRow[] = [];
  for (const raw of items) {
    if (raw === null || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    if (typeof r['offerId'] !== 'string' || r['offerId'] === '') continue;
    if (typeof r['productVersionId'] !== 'string' || typeof r['supplierId'] !== 'string') continue;
    if (typeof r['name'] !== 'string' || typeof r['available'] !== 'number') continue;
    rows.push({
      offerId: r['offerId'],
      productVersionId: r['productVersionId'],
      name: r['name'],
      category: typeof r['category'] === 'string' ? r['category'] : '',
      basePrice: typeof r['basePrice'] === 'number' ? r['basePrice'] : 0,
      resellerCommission: typeof r['resellerCommission'] === 'number' ? r['resellerCommission'] : 0,
      available: r['available'],
      assetRefs: Array.isArray(r['assetRefs']) ? (r['assetRefs'] as string[]).filter((a) => typeof a === 'string') : [],
      supplierId: r['supplierId'],
      ...(typeof r['videoRef'] === 'string' ? { videoRef: r['videoRef'] } : {}),
      ...(typeof r['variantsNote'] === 'string' ? { variantsNote: r['variantsNote'] } : {}),
      ...(typeof r['hiddenReason'] === 'string' ? { hiddenReason: r['hiddenReason'] } : {}),
      ...(typeof r['stockConfirmedAt'] === 'string' && Number.isFinite(Date.parse(r['stockConfirmedAt']))
        ? { stockConfirmedAt: r['stockConfirmedAt'] }
        : {}),
    });
  }
  return rows;
}

/** A code row must be whole or it is nothing — same law as every reader here. */
function readCodeRow(value: unknown): CodeRow | null {
  if (value === null || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (typeof r['supplierId'] !== 'string' || r['supplierId'] === '') return null;
  if (typeof r['mintedAt'] !== 'string' || r['mintedAt'] === '' || Number.isNaN(Date.parse(r['mintedAt']))) return null;
  return {
    supplierId: r['supplierId'],
    mintedAt: r['mintedAt'],
    revelable: r['revelable'] === true,
    // A non-string reads ABSENT — « active » — because inventing a revocation
    // from a malformed field would hide a real supplier from his own console.
    ...(typeof r['revokedAt'] === 'string' && r['revokedAt'] !== '' ? { revokedAt: r['revokedAt'] } : {}),
    ...(Number.isSafeInteger(r['commandesOuvertes']) && (r['commandesOuvertes'] as number) >= 0
      ? { commandesOuvertes: r['commandesOuvertes'] as number }
      : {}),
  };
}

/** COLIS-FOURNISSEUR-1 — a package that names this order among 2..10
 *  distinct orders, or nothing: a malformed one reads as an order alone (Séra
 *  composes from its own facts either way; only the article names are lost). */
function colisDe(v: unknown, orderId: string): { colis: NonNullable<PaidOrderRow['colis']> } | null {
  if (v === null || typeof v !== 'object') return null;
  const c = v as Record<string, unknown>;
  const ids = c['orderIds'];
  if (typeof c['packageId'] !== 'string' || c['packageId'] === '' || !Array.isArray(ids)) return null;
  if (ids.length < 2 || ids.length > 10 || !ids.every((x) => typeof x === 'string' && x !== '')) return null;
  if (new Set(ids).size !== ids.length || !ids.includes(orderId)) return null;
  return { colis: { packageId: c['packageId'], orderIds: ids as string[] } };
}

function readPaidOrderRow(value: unknown): PaidOrderRow | null {
  if (value === null || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const ok =
    typeof r['orderId'] === 'string' &&
    r['orderId'] !== '' &&
    typeof r['productVersionId'] === 'string' &&
    typeof r['paymentMode'] === 'string' &&
    typeof r['paidAt'] === 'string' &&
    typeof r['zoneTo'] === 'string' &&
    typeof r['sellerBasePrice'] === 'number' &&
    Number.isSafeInteger(r['sellerBasePrice']) &&
    typeof r['supplierId'] === 'string' &&
    typeof r['supplierResolved'] === 'boolean' &&
    typeof r['registeredAt'] === 'string' &&
    (r['productName'] === undefined || typeof r['productName'] === 'string') &&
    (r['productPhotoRef'] === undefined || typeof r['productPhotoRef'] === 'string') &&
    (r['offerVersion'] === undefined || typeof r['offerVersion'] === 'string') &&
    (r['oversold'] === undefined || typeof r['oversold'] === 'boolean');
  if (!ok) return null;
  const relance = readRelance(r['relance']);
  const fulfillment = readFulfillment(r['fulfillment']);
  return {
    ...(relance !== null ? { relance } : {}),
    ...(fulfillment !== null ? { fulfillment } : {}),
    orderId: r['orderId'] as string,
    ...(r['oversold'] === true ? { oversold: true } : {}),
    ...(colisDe(r['colis'], r['orderId'] as string) ?? {}),
    productVersionId: r['productVersionId'] as string,
    productName: typeof r['productName'] === 'string' ? r['productName'] : '',
    // A Worker that has not shipped the join yet omits the field entirely; ''
    // is what the screen reads as « no picture », never a broken <Image>.
    productPhotoRef: typeof r['productPhotoRef'] === 'string' ? r['productPhotoRef'] : '',
    offerVersion: typeof r['offerVersion'] === 'string' ? r['offerVersion'] : '',
    paymentMode: r['paymentMode'] as string,
    paidAt: r['paidAt'] as string,
    zoneTo: r['zoneTo'] as string,
    sellerBasePrice: r['sellerBasePrice'] as number,
    supplierId: r['supplierId'] as string,
    supplierResolved: r['supplierResolved'] as boolean,
    registeredAt: r['registeredAt'] as string,
  };
}

/** A malformed mark is DROPPED, never rendered as a call that may not have
 *  happened — « vous avez appelé » must be true or absent. */
function readRelance(value: unknown): RelanceMark | null {
  if (value === null || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  if (typeof r['at'] !== 'string' || r['at'] === '') return null;
  // An UNPARSEABLE instant is dropped too: `ageMinutes` reads a non-date as 0,
  // which would render the very specific false claim « Appelé à l'instant »
  // about a call whose time this app cannot actually know.
  if (Number.isNaN(Date.parse(r['at']))) return null;
  if (typeof r['count'] !== 'number' || !Number.isSafeInteger(r['count']) || r['count'] < 1) return null;
  return { at: r['at'], count: r['count'] };
}

/** A malformed preparation mark is DROPPED — « Accepté »/« Prêt » must be
 *  true or absent (the same law as the relance mark). A mark with NEITHER
 *  clock is nothing and reads as absent. */
function readFulfillment(value: unknown): FulfillmentMark | null {
  if (value === null || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const validIso = (v: unknown): v is string =>
    typeof v === 'string' && v !== '' && !Number.isNaN(Date.parse(v));
  const marks = ['acceptedAt', 'readyAt', 'refusedAt', 'handedOverAt', 'deliveredAt', 'returnedAt', 'pickupRefusedAt'] as const;
  const lus: { -readonly [K in (typeof marks)[number]]?: string } = {};
  for (const m of marks) {
    const v = r[m];
    if (validIso(v)) lus[m] = v;
  }
  if (Object.keys(lus).length === 0) return null;
  // Who refused is read only BESIDE a readable refusal: « vous avez annulé »
  // must be true or absent, like every other mark here.
  const par = r['refusPar'];
  return { ...lus, ...(lus.refusedAt !== undefined && (par === 'fondateur' || par === 'delai') ? { refusPar: par } : {}) };
}

/* ─────────────────── the founder's key, on HIS device only ─────────────────── */

const OPS_KEY_STORAGE = 'boutik.operateur.cle';

/** Web: his browser's localStorage. Native: nowhere — the console is a webapp
 *  surface by founder ruling, and the parked native app never shows it. */
export function readStoredOpsKey(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(OPS_KEY_STORAGE);
    return v !== null && v !== '' ? v : null;
  } catch {
    return null;
  }
}

export function storeOpsKey(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(OPS_KEY_STORAGE, key);
  } catch {
    // storage refused (private mode) — the session keeps the key in memory only.
  }
}

export function clearStoredOpsKey(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(OPS_KEY_STORAGE);
  } catch {
    // nothing to clear
  }
}

/* ─────────── the photo-delete key, on HIS device only (CLE-FONDATEUR-1) ─────────── */

/**
 * The media service's REVOKE credential (MEDIA_REVOKE_SECRET), typed by him
 * once — never built into the page any more (AUDIT-B+2 F-01). Same
 * storage law as the operator key above: his browser only, removable by him.
 */
const PHOTOS_KEY_STORAGE = 'boutik.photos.cle';

export function readStoredClePhotos(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(PHOTOS_KEY_STORAGE);
    return v !== null && v !== '' ? v : null;
  } catch {
    return null;
  }
}

export function storeClePhotos(key: string): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PHOTOS_KEY_STORAGE, key);
  } catch {
    // storage refused (private mode) — nothing is kept, and the door stays open.
  }
}

export function clearStoredClePhotos(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(PHOTOS_KEY_STORAGE);
  } catch {
    // nothing to clear
  }
}

/** The web-only door to the key screen: boutik-plus-web.pages.dev/#operateur */
export function operateurHashPresent(): boolean {
  try {
    // RN's TS lib has no DOM `window`; on web the global exists at runtime.
    const w = (globalThis as { window?: { location?: { hash?: string } } }).window;
    return w?.location?.hash === '#operateur';
  } catch {
    return false;
  }
}
