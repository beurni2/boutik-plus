import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { SCROLL, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnSoft, C07BtnPrimary, PageTitle } from './components';
import { S03Produits } from './screens1';
import { resolveSupplyService, type SupplierOfferRow, type SupplyServicePort } from '../supply/service';
import { resolveMediaBase } from '../supply/media';
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
  const [read, setRead] = useState<ProduitsRead>(() =>
    service === null ? { kind: 'not_configured' } : { kind: 'loading' },
  );
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

  if (view.kind === 'list') return <S03Produits rows={view.rows} mediaBase={mediaBase} d={d} header />;

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
            <S03Produits rows={view.staleRows} mediaBase={mediaBase} d={d} />
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
