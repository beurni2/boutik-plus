import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { SCROLL, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnSoft, C07BtnPrimary, PageTitle } from './components';
import { S03Produits, SOffreFiche } from './screens1';
import { ChipCategory } from './components';
import { resolveSupplyService, type SupplierOfferRow, type SupplyServicePort } from '../supply/service';
import { mintCommandId } from '../offline/commandId';
import { resolveMediaBase, resolveMediaService } from '../supply/media';
import { produitsView, type ProduitsRead } from '../supply/produits-view';
import { chipsProduits, fournisseursALire, fusionner, memeEnsemble, montreAttribution, TOUS, type RangeeAttribuee } from './produits-filtre';
import { lireFournisseurs } from './lister-pour-choix';
import { readStoredOpsKey, resolveOperationsService } from '../operations/service';
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
  /** The scope a read asked for while another was running — replayed after it. */
  const enAttente = useRef<string | null>(null);
  /** True when his ops key is on the device and the inventory read REFUSED —
   *  the list is then his own products, not « Tous », and the screen says so. */
  const [inventaireRefuse, setInventaireRefuse] = useState(false);
  // PRODUITS-PAR-FOURNISSEUR (founder order 2026-08-03) — he lists FOR every
  // supplier and monitors all of them, so his own Produits screen filters by
  // whose product it is. The roster is the SAME code inventory the publish
  // picker reads with his ops key; no key in this browser ⇒ no chips, and the
  // screen is exactly what it was before (his own products), never an empty
  // filter row implying suppliers he cannot see.
  /**
   * ⚠ TWO SOURCES, EACH REPLACEABLE — and the union DERIVED, never accumulated
   * (RETRAIT-ACCÈS, founder 2026-08-11: « their products and their chip on
   * boutik+ gets removed as well when they have been cut access »).
   *
   * These answer different questions and both belong: who holds a DOOR (an
   * active code — so a supplier who has listed nothing still gets his honest
   * « rien encore »), and who OWNS products (so nothing is unreachable). The
   * first version merged them into one accumulating set, which could only ever
   * GROW: a supplier cut off while this tab was open kept his chip until the app
   * was killed — the same silent-staleness family as the bug this screen already
   * cost him once. Replacing each source separately lets the union shrink.
   */
  const [codes, setCodes] = useState<readonly string[]>([]);
  const [proprietaires, setProprietaires] = useState<readonly string[]>([]);
  /** The two sources, unioned and SORTED so the value is stable across renders
   *  — the chip row and the fan-out plan both key off this. */
  const roster = useMemo(
    () => [...new Set([...codes, ...proprietaires])].sort((a, b) => a.localeCompare(b, 'fr')),
    [codes, proprietaires],
  );
  /**
   * HIS DEFAULT IS « TOUS » WHEN HIS OPS KEY IS ON THE DEVICE.
   *
   * The chip row has always listed « Tous » first and called it « the founder's
   * monitoring default », while the selection started on « Vous » — so the
   * default view was his own products only. That is what let ORPHANS hide: a
   * product whose supplier's code was revoked is in nobody's scoped list, and
   * he would have had to tap a chip he had no reason to suspect. He monitors
   * every supplier; the screen now opens on every supplier.
   *
   * Without the key (anyone but him) it stays '' — himself — exactly as before.
   */
  const [choix, setChoix] = useState<string>(() => (readStoredOpsKey() !== null ? TOUS : ''));
  /** Whose product each row is — only ever the id the READ was scoped to. */
  const [attribue, setAttribue] = useState<readonly RangeeAttribuee[]>([]);

  useEffect(() => {
    let alive = true;
    const opsKey = readStoredOpsKey();
    const ops = resolveOperationsService();
    if (opsKey === null || ops === null) return undefined;
    void lireFournisseurs(ops, opsKey).then((res) => {
      if (alive && res.kind === 'liste') {
        // REPLACED, not merged — a revoked code must be able to LEAVE.
        setCodes((tenu) => memeEnsemble(tenu, [...new Set(res.ids)]));
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  const loadRef = useRef<(cible?: string) => Promise<void>>(async () => {});
  const load = async (cible: string = choix): Promise<void> => {
    if (service === null) return;
    /**
     * A READ ASKED FOR WHILE ANOTHER IS IN FLIGHT IS REMEMBERED, NOT DROPPED.
     *
     * It used to `return` — and that silently lost the re-read the supplier
     * roster triggers when it lands, because the mount read is still running at
     * that moment. On « Tous » the screen then kept the fan-out's first answer,
     * which had only HIS id to ask for: every other supplier's products missing,
     * with no error and nothing to retry. A walk caught it; reading could not.
     */
    if (inFlight.current) {
      enAttente.current = cible;
      return;
    }
    inFlight.current = true;
    setRead({ kind: 'loading' });
    try {
      /**
       * ═══ INVENTAIRE-COMPLET (founder report 2026-08-11, with a screenshot of
       * three products still on Opportunités) ═══
       *
       * WHEN HIS OPS KEY IS ON THIS DEVICE, THE INVENTORY IS THE SOURCE OF
       * TRUTH — not the fan-out below.
       *
       * The fan-out can only ask `?supplierId=…`, and it took those ids from
       * the ACTIVE-CODE roster. So a product whose supplier's code was revoked
       * — or who never held one — fell out of every read this screen could
       * make: invisible here, undeletable here, and still served to Shop+'s
       * Opportunités forever, because that collection walks the INDEX and the
       * index does not care who holds a code. He reported it as « deleted and
       * still there »; it had never been deletable at all.
       *
       * A code is a DOOR. The index is the INVENTORY. Asking the inventory is
       * the fix, and it also makes « Tous » true for the first time.
       *
       * THE FAN-OUT STAYS as the fallback: no ops key on this device (anyone
       * but him) means no inventory read, and the screen is exactly what it
       * was — his own products, by the write key alone.
       */
      const opsKey = readStoredOpsKey();
      const ops = resolveOperationsService();
      if (opsKey !== null && ops !== null) {
        const inv = await ops.listInventaire(opsKey);
        if (inv.ok) {
          setInventaireRefuse(false);
          const tous = cible === TOUS;
          const vise = cible === '' ? supplierId : cible;
          const gardees = inv.rows.filter((r) => tous || r.supplierId === vise);
          const attribuees = gardees.map((r) => {
            const { supplierId: proprietaire, ...row } = r;
            return { row: row as SupplierOfferRow, supplierId: proprietaire };
          });
          setAttribue(attribuees);
          const rows = attribuees.map((m) => m.row);
          cache.current = { rows, asOf: new Date().toISOString() };
          // Whoever OWNS a product is a supplier this screen must be able to
          // name — that is what makes an orphan reachable. REPLACED, not merged
          // (see the two-source note above): a supplier whose products were
          // retired must be able to leave this set. The UNION with code-holders
          // still happens — derived below — so a door-holder who has listed
          // nothing keeps his honest « rien encore ».
          setProprietaires((tenu) => memeEnsemble(tenu, [...new Set(inv.rows.map((r) => r.supplierId))]));
          setRead({ kind: 'ok', rows });
          return;
        }
        // A refused or unreachable inventory falls through to the fan-out
        // rather than blanking his screen — but it is NAMED (verifier MAJOR).
        // Falling through in silence while the screen still says « Tous » shows
        // a list that is not tous with nothing admitting it, which is a worse
        // version of the very complaint this slice answers.
        setInventaireRefuse(true);
      }
      // « Tous » is COMPOSED from reads he is entitled to make — the service
      // requires a scope and answers 400 without one (see produits-filtre.ts).
      const cibles = fournisseursALire(cible, roster, supplierId);
      const blocs: { supplierId: string; rows: readonly SupplierOfferRow[] }[] = [];
      let asOf: string | null = null;
      for (const id of cibles) {
        const res = await service.listOffers(id);
        // ONE FAILED READ FAILS THE SCREEN, deliberately: a partial list that
        // silently omits a supplier's products is the silent-disappearance
        // family this project refuses. He retries and sees everything or a
        // named failure — never a quiet half-truth.
        if (!res.ok) {
          setRead({ kind: 'failed' });
          return;
        }
        blocs.push({ supplierId: id, rows: res.value.items });
        asOf = res.value.asOf;
      }
      const merged = fusionner(blocs);
      setAttribue(merged);
      const rows = merged.map((m) => m.row);
      cache.current = { rows, asOf };
      setRead({ kind: 'ok', rows });
    } finally {
      inFlight.current = false;
      const differe = enAttente.current;
      enAttente.current = null;
      // THROUGH THE REF, never this render's closure (verifier MAJOR): the
      // replay exists for the case where the roster lands mid-read, and the
      // mount-render's `load` closes over an EMPTY roster — so the correction
      // would have re-run the same wrong fan-out it was added to correct.
      if (differe !== null) void loadRef.current(differe);
    }
  };

  useEffect(() => {
    void load();
    // one read per mount — a tab switch re-reads, which is what makes a freshly
    // published product appear without a relaunch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * THE ROSTER ARRIVES AFTER THE FIRST READ, and « Tous » depends on it.
   *
   * Caught by a walk, not by reading: the mount read fires with an EMPTY roster,
   * so on « Tous » the fan-out asked for HIS id alone and every other supplier's
   * products were missing until he tapped a chip. (The fake that hid it answered
   * the same rows for every scope; making it honour the scope made it visible.)
   *
   * `memeEnsemble` keeps the reference stable when the set has not really
   * changed, so this fires ONCE per genuine roster change and cannot loop with
   * the inventory read that also sets it.
   */
  const clefRoster = [...roster].sort().join('|');
  useEffect(() => {
    if (clefRoster === '' || choix !== TOUS) return;
    /**
     * THE FAN-OUT ONLY (verifier MAJOR). The inventory read ALREADY returns
     * every supplier's products, and it also SETS the roster — so leaving this
     * effect to fire on that path made the first read re-trigger itself, then
     * the code roster arrived and flipped the set again: two to four full
     * catalogue reads per mount, each blanking the list to « Chargement… » on
     * the way. The fan-out is the only path that needs the roster first.
     */
    if (readStoredOpsKey() !== null) return;
    void load(TOUS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clefRoster]);

  // THE ONE DECISION IS PURE (`supply/produits-view.ts`) — this component only
  // renders it. That is what lets a test put a state IN and read the sentence
  // OUT, instead of asserting the ORDER of branches in this file.
  loadRef.current = load;
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

  // PRODUITS-PAR-FOURNISSEUR — the chip row, ABOVE the list. `chipsProduits`
  // answers [] when he is the only supplier, and then nothing renders: a filter
  // that cannot filter is chrome. Tapping re-reads with the new scope, so the
  // list on screen is always the list the service just answered — never a
  // client-side slice of a stale merge pretending to be a fresh read.
  const chips = chipsProduits(roster, supplierId);
  /**
   * THE PARTIAL-LIST SENTENCE (verifier MAJOR). When his ops key is on the
   * device and the inventory read REFUSED, the screen falls back to the
   * fan-out — which is his own products — while the selection still reads
   * « Tous ». Saying nothing there would be showing a list that is not tous
   * with nothing admitting it. It sits ABOVE the chips, where the claim it
   * corrects is made.
   */
  const filtre = (
    <>
      {inventaireRefuse ? (
        <Banner tone="warn" style={{ marginTop: 12 }}>{t('produits.inventaire_refuse')}</Banner>
      ) : null}
      {chips.length === 0 ? null : (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 }}>
        {chips.map((c) => (
          <ChipCategory
            key={c.id}
            label={c.labelKey !== null ? t(c.labelKey) : c.id}
            active={choix === c.id}
            onPress={() => {
              setChoix(c.id);
              void load(c.id);
            }}
          />
        ))}
      </View>
      )}
    </>
  );

  if (view.kind === 'list') {
    return (
      <S03Produits
        rows={view.rows}
        mediaBase={mediaBase}
        d={d}
        header
        onOpen={setOpenOffer}
        filtre={filtre}
        {...(montreAttribution(attribue.map((a) => a.supplierId))
          ? { attribution: attribue.map((a) => a.supplierId) }
          : {})}
      />
    );
  }

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
