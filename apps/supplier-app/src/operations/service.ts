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
}

export type PaidOrdersResult =
  | { readonly ok: true; readonly orders: readonly PaidOrderRow[] }
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
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

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
}

export type InventaireResult =
  | { readonly ok: true; readonly rows: readonly InventaireRow[] }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

export type CodesResult =
  | { readonly ok: true; readonly codes: readonly CodeRow[] }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

export type MintResult =
  /** The plaintext code — shown ONCE, never stored anywhere by this app. */
  | { readonly ok: true; readonly code: string; readonly supplierId: string; readonly mintedAt: string }
  | { readonly ok: false; readonly reason: 'bad_key' | 'unreachable' };

export type RevokeResult =
  | { readonly ok: true; readonly status: 'revoked' | 'no_code' }
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
  /** CONSOLE-3 — the code inventory (who holds a door, since when). */
  listCodes(opsKey: string): Promise<CodesResult>;
  /** Mint (or re-mint — the book replaces atomically) one supplier's code. */
  mintCode(opsKey: string, supplierId: string): Promise<MintResult>;
  /** Cut a supplier off. Idempotent — `no_code` is an honest answer. */
  revokeCode(opsKey: string, supplierId: string): Promise<RevokeResult>;
  /** CODE-REVU — reread a code already given (founder ruling 2026-08-09).
   *  `code_anterieur` names a pre-ruling code the book cannot show back. */
  revealCode(opsKey: string, supplierId: string): Promise<RevealResult>;
}

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
  return {
    async listPaidOrders(opsKey: string): Promise<PaidOrdersResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/orders`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${opsKey}` },
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      const body = (await res.json().catch(() => null)) as { ok?: boolean; orders?: unknown } | null;
      if (body?.ok !== true || !Array.isArray(body.orders)) return { ok: false, reason: 'unreachable' };
      // Shape-READ row by row: a record the book never wrote is DROPPED, never
      // rendered half-formed — the console's whole worth is that every line on
      // it is true. Reading (not just guarding) matters for the two fields
      // records written BEFORE the productName enrichment lack: they normalize
      // to '', so the screen's fallback-to-pv-id renders instead of a blank
      // title on precisely the oldest rows.
      const orders: PaidOrderRow[] = [];
      for (const raw of body.orders) {
        const row = readPaidOrderRow(raw);
        if (row !== null) orders.push(row);
      }
      return { ok: true, orders };
    },

    async listInventaire(opsKey: string): Promise<InventaireResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/offers/inventaire`, {
          headers: { Accept: 'application/json', Authorization: `Bearer ${opsKey}` },
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      const body = (await res.json().catch(() => null)) as { items?: unknown } | null;
      if (!Array.isArray(body?.items)) return { ok: false, reason: 'unreachable' };
      // A malformed row is DROPPED, never rendered half-formed — the standing
      // law of every read on this console.
      const rows: InventaireRow[] = [];
      for (const raw of body.items) {
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
        });
      }
      return { ok: true, rows };
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
      // Anything else non-2xx is « we do not know that it happened » — the row
      // stays on the board and he can ask again. Never a cheerful default.
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      return { ok: true };
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
        res = await fetch(`${trimmed}/fulfillment/supplier-code`, {
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
      return { ok: true, code: body['code'], supplierId: body['supplierId'], mintedAt: body['mintedAt'] };
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

    async revokeCode(opsKey: string, supplierId: string): Promise<RevokeResult> {
      let res: Response;
      try {
        res = await fetch(`${trimmed}/fulfillment/supplier-code/revoke`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${opsKey}` },
          body: JSON.stringify({ supplierId }),
        });
      } catch {
        return { ok: false, reason: 'unreachable' };
      }
      if (res.status === 401) return { ok: false, reason: 'bad_key' };
      if (!res.ok) return { ok: false, reason: 'unreachable' };
      const body = (await res.json().catch(() => null)) as { ok?: boolean; status?: unknown } | null;
      if (body?.ok !== true || (body.status !== 'revoked' && body.status !== 'no_code')) {
        return { ok: false, reason: 'unreachable' };
      }
      return { ok: true, status: body.status };
    },
  };
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
  };
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
    (r['offerVersion'] === undefined || typeof r['offerVersion'] === 'string');
  if (!ok) return null;
  const relance = readRelance(r['relance']);
  const fulfillment = readFulfillment(r['fulfillment']);
  return {
    ...(relance !== null ? { relance } : {}),
    ...(fulfillment !== null ? { fulfillment } : {}),
    orderId: r['orderId'] as string,
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
  const acceptedAt = validIso(r['acceptedAt']) ? r['acceptedAt'] : undefined;
  const readyAt = validIso(r['readyAt']) ? r['readyAt'] : undefined;
  if (acceptedAt === undefined && readyAt === undefined) return null;
  return {
    ...(acceptedAt !== undefined ? { acceptedAt } : {}),
    ...(readyAt !== undefined ? { readyAt } : {}),
  };
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
