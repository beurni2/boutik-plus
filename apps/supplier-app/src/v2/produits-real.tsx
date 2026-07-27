import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { SCROLL, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnSoft, C07BtnPrimary, PageTitle } from './components';
import { S03Produits, SOffreFiche } from './screens1';
import { resolveSupplyService, type SupplierOfferRow, type SupplyServicePort } from '../supply/service';
import { mintCommandId } from '../offline/commandId';
import { resolveMediaBase, resolveMediaService } from '../supply/media';
import { produitsView, type ProduitsRead } from '../supply/produits-view';
import type { A, S } from './machine';

/**
 * PRODUITS-READ-1 — « Produits », REAL (founder rulings 2026-07-25).
 *
 * WHY A WRAPPER AND NOT A MACHINE CHANGE: the same shape as `SListerReal`. The
 * screen renders what it is handed; this component owns the impure substance —
 * the resolved service, the read, the four honest states, the retry. `machine.ts`
 * §4 and `seed.ts` §3.3 are **untouched**: `st.products` / `st.porder` keep
 * serving the Commandes demo board, and Produits simply stops reading them.
 *
 * THAT IS OPTION (b), AND ITS PROOF IS A CAPABILITY CHECK, NOT AN ABSENCE PROOF
 * (founder condition, stated here so the weaker instrument cannot be misread
 * later). What is provable today: **Produits holds no binding to seed data**, so
 * no mock can reach a tile. What is NOT proven: that the seed strings are absent
 * from the shipped bundle — they must REMAIN, because Commandes still needs
 * them. **THE ABSENCE PROOF IS OWED, and comes due when Commandes converts off
 * the seed.** See JOURNAL.md.
 *
 * THE CACHE IS IN MEMORY AND SHELL-HELD, NEVER PERSISTED. A list of offers that
 * no longer exist is a fabrication with a timestamp: there is no invalidation
 * signal, so a persisted list would keep showing a taken-down or lapsed offer
 * indefinitely. Queued ≠ done; cached ≠ current. It survives tab switches (the
 * ref lives in AppV2) and dies with the process, so a relaunch always re-reads.
 */

/** Shell-held so it survives this component unmounting on every tab switch. */
export interface ProduitsCache {
  rows: readonly SupplierOfferRow[] | null;
  asOf: string | null;
}


export function SProduitsReal({ st, d, supplierId, cache }: {
  st: S;
  d: (a: A) => void;
  supplierId: string;
  cache: { current: ProduitsCache };
}) {
  const service = useMemo<SupplyServicePort | null>(() => resolveSupplyService(), []);
  const mediaBase = useMemo(() => resolveMediaBase(), []);
  const mediaService = useMemo(() => resolveMediaService(), []);
  const [read, setRead] = useState<ProduitsRead>(() =>
    service === null ? { kind: 'not_configured' } : { kind: 'loading' },
  );
  /** The open fiche (founder device ruling 2026-07-26: tap a product, see all
   * its photographs and details). Local to the tab: a tab switch unmounts it,
   * and the machine's demo `view: 'product'` route is never involved — a real
   * offer has no entry in `st.products`, and the id-miss guard is not a fiche. */
  const [openOffer, setOpenOffer] = useState<SupplierOfferRow | null>(null);
  const inFlight = useRef(false);

  const load = async (): Promise<void> => {
    if (service === null || inFlight.current) return;
    inFlight.current = true;
    setRead({ kind: 'loading' });
    try {
      const res = await service.listOffers(supplierId);
      if (res.ok) {
        cache.current = { rows: res.value.items, asOf: res.value.asOf };
        setRead({ kind: 'ok', rows: res.value.items });
      } else {
        setRead({ kind: 'failed' });
      }
    } finally {
      inFlight.current = false;
    }
  };

  useEffect(() => {
    void load();
    // one read per mount — a tab switch re-reads, which is what makes a freshly
    // published product appear without a relaunch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // THE ONE DECISION IS PURE (`supply/produits-view.ts`) — this component only
  // renders it. That is what lets a test put a state IN and read the sentence
  // OUT, instead of asserting the ORDER of branches in this file.
  const view = produitsView(read, cache.current.rows);

  // OFFER-DELETE-1 (founder 2026-07-27): remove the open offer from EVERY wire
  // — his list and the supply projections Shop+ reads. On success the fiche
  // closes, the CACHE IS DROPPED (a list still carrying the deleted row is a
  // fabrication), and a fresh read paints the honest state. On failure the
  // fiche shows its designed sentence; nothing here guesses.
  //
  // MEDIA-REVOKE-1 (founder 2026-07-27: "continue the cleaning of the bytes
  // after the delete"): once the offer is gone from every wire, the row's
  // photographs are revoked too — origin object destroyed, caches drain within
  // their TTLs (bounded-latency, the standing wording). STRICTLY AFTER the
  // delete and STRICTLY BEST-EFFORT: a failed revoke never un-deletes the
  // product; at worst the bytes orphan behind their 122-bit tokens, exactly as
  // every delete before this slice left them. The refs come from the ROW, not
  // a server echo, ON PURPOSE — on an idempotent replay (first answer lost in
  // transit) the entry is already gone but the row still names its photos, so
  // the retry still cleans them.
  const deleteOpen = async (): Promise<boolean> => {
    if (service === null || openOffer === null) return false;
    const res = await service.deleteOffer({
      commandId: mintCommandId(),
      offerId: openOffer.offerId,
      productVersionId: openOffer.productVersionId,
    });
    if (!res.ok) return false;
    if (mediaService !== null) {
      try {
        for (const ref of openOffer.assetRefs) {
          // belt-and-braces prefix filter (the wire only carries media/ refs);
          // the result is deliberately unread — see BEST-EFFORT above.
          if (ref.startsWith('media/')) await mediaService.revokeImage(ref);
        }
      } catch {
        // revokeImage returns typed results and should never throw — but a
        // cleanup that DID throw must never strand the fiche on 'pending'
        // after a delete that already succeeded (verifier finding 2026-07-27).
        // The remaining bytes orphan, same as any failed revoke.
      }
    }
    setOpenOffer(null);
    cache.current = { rows: null, asOf: null };
    void load();
    return true;
  };

  if (openOffer !== null) {
    return (
      <SOffreFiche
        row={openOffer}
        mediaBase={mediaBase}
        onBack={() => setOpenOffer(null)}
        {...(service === null ? {} : { onDelete: deleteOpen })}
      />
    );
  }

  if (view.kind === 'list') return <S03Produits rows={view.rows} mediaBase={mediaBase} d={d} header onOpen={setOpenOffer} />;

  if (view.kind === 'failed') {
    return (
      <Shell d={d}>
        <Banner tone="warn">{t(view.message)}</Banner>
        <View style={{ marginTop: 14 }}>
          <C07BtnPrimary label={t('produits.reessayer')} icon="retry" onPress={() => { void load(); }} />
        </View>
        {view.staleRows !== null && view.staleMessage !== null && (
          // A stale list is shown ONLY with its label — never silently, and
          // never as if it were current.
          <>
            <View style={{ marginTop: 16 }}>
              <Banner tone="info">{t(view.staleMessage)}</Banner>
            </View>
            <S03Produits rows={view.staleRows} mediaBase={mediaBase} d={d} onOpen={setOpenOffer} />
          </>
        )}
      </Shell>
    );
  }

  if (view.kind === 'loading') {
    return (
      <Shell d={d}>
        <Text style={role({ f: 'IS', w: 400, s: 13 }, P.sub)}>{t(view.message)}</Text>
      </Shell>
    );
  }

  // `empty` and `not_configured` — both honest states, neither an error, and
  // NEITHER reachable from a failed read (that is `produitsView`'s job).
  return (
    <Shell d={d}>
      <Banner tone="info">{t(view.message)}</Banner>
    </Shell>
  );
}

/** The page chrome the non-list states share — one title, one primary action. */
function Shell({ d, children }: { d: (a: A) => void; children: React.ReactNode }) {
  return (
    <ScrollView contentContainerStyle={SCROLL.tabs} showsVerticalScrollIndicator={false}>
      <PageTitle>Produits</PageTitle>
      <View style={{ marginTop: 14 }}>{children}</View>
      <View style={{ marginTop: 16 }}>
        <BtnSoft label="Lister un produit — gratuit" icon="plus" onPress={() => d({ t: 'OPEN_WIZ' })} />
      </View>
    </ScrollView>
  );
}
