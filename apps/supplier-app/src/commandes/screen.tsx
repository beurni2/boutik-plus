import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { role } from '../ui/v2/styles';
import { GEO } from '../ui/v2/tokens';
import { t } from '../i18n';
import { Banner, BtnSoft, C07BtnPrimary, Card, ChipSegment, Input, PageTitle, VignetteProduit } from '../v2/components';
import {
  clearStoredOpsKey,
  readStoredOpsKey,
  resolveOperationsService,
  storeOpsKey,
  type OperationsServicePort,
  type OrderEvidence,
  type PaidOrderRow,
  type SupplierContact,
} from '../operations/service';
import {
  clearStoredCleC,
  readStoredCleC,
  resolveDispatchService,
  resolveGainsService,
  storeCleC,
  type LivraisonRow,
  type RemboursementOperateur,
} from '../operations/dispatch-service';
import { readStoredCleFonds, resolveFondsService } from '../fonds/service';
import { readStoredCleCoursiers } from '../coursiers/service';
import { resolveSeraDispatch, type BoardSera } from './sera-service';
import { nomCoursierPour } from '../gains/view';
import { resolveMediaBase } from '../supply/media';
import { photoUri } from '../supply/produits-view';
import { ConfierCoursier } from './confier';
import { SignalerRefus } from './signaler';
import { telEnPaires } from './telephone';
import {
  attenteDepuis,
  nomFournisseur,
  pilluleCommande,
  raisonBlocage,
  segmenter,
  tonAttente,
  type SegmentCommandes,
} from './view';
// PURGE-ESSAI — the two-tap decision is PURE and lives with the other ops
// decisions; these components hold substance only.
import {
  RETRAIT_IDLE,
  retraitAnnule,
  retraitDemande,
  retraitSettled,
  retraitStart,
  sweepAnnule,
  sweepAvance,
  sweepDemande,
  sweepFini,
  sweepStart,
  type RetraitUi,
} from '../operations/view';

/**
 * ═══ RB-1 — THE COMMANDES TAB, REAL (founder direction 2026-08-08) ═══
 *
 * « If a buyer buys a product it comes on commandes » — this screen IS the
 * paid-order book now, the same reads the ops console's board and Livraisons
 * zones made, moved to the tab where the work actually happens. The console
 * zones retire in this same slice (his order).
 *
 * THREE DOORS, ALL ALREADY HIS, NONE RETYPED NEEDLESSLY:
 *   · the ops key (FULFILLMENT_OPS_SECRET) opens the book — SAME localStorage
 *     slot the console used, so a key he typed there opens here.
 *   · key C (CHECKOUT_OPS_SECRET) opens the buyer's contact on the Terminées
 *     detail — same slot as the old Livraisons zone.
 *   · the fund key, IF he has opened the Fonds zone once, joins the claims
 *     book so Incidents fills; absent, Incidents says honestly how to connect
 *     it rather than showing an empty list that reads as « no incidents ».
 *
 * THE 5-SECOND TEST for this screen: whose order is waiting, on whom, since
 * when. The SUPPLIER'S NAME is the loudest line of every row (his words:
 * « very noticeably visible »).
 */

const NOM_FORT = role({ f: 'BG', w: 800, s: 18 }, P.ink);
const TITRE = role({ f: 'BG', w: 800, s: 17 }, P.ink);
const CORPS = role({ f: 'IS', w: 400, s: 13 }, P.sub);
const PETIT = role({ f: 'IS', w: 400, s: 12 }, P.sub);
const DUREE = role({ f: 'BG', w: 800, s: 22 }, P.ink);

type Read =
  | { kind: 'chargement' }
  | { kind: 'echec' }
  | { kind: 'ok'; orders: readonly PaidOrderRow[]; contacts: readonly SupplierContact[] };

export function SCommandesReel() {
  const [cle, setCle] = useState<string | null>(() => readStoredOpsKey());
  const service = useMemo(() => resolveOperationsService(), []);

  // UNSET ⇒ nothing, never demo — the standing law of this app's outbound
  // ports. A Commandes tab showing invented orders would have him phoning
  // suppliers about sales that never happened.
  if (service === null) {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <PageTitle>{t('commandes.titre')}</PageTitle>
        <View style={{ marginTop: 16 }}>
          <Banner tone="info">{t('commandes.pas_relie')}</Banner>
        </View>
      </ScrollView>
    );
  }
  if (cle === null) {
    return (
      <PorteCommandes
        onOuverte={(k) => {
          storeOpsKey(k);
          setCle(k);
        }}
      />
    );
  }
  return (
    <LivreCommandes
      service={service}
      cle={cle}
      onCleRefusee={() => {
        clearStoredOpsKey();
        setCle(null);
      }}
    />
  );
}

/** The same door as the console's: his operator key, typed once, his device. */
function PorteCommandes({ onOuverte }: { onOuverte: (cle: string) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <PageTitle>{t('commandes.titre')}</PageTitle>
      <Card variant="Llg" style={{ marginTop: 16 }}>
        <Text style={TITRE}>{t('commandes.cle_titre')}</Text>
        <Text style={[CORPS, { marginTop: 6 }]}>{t('commandes.cle_aide')}</Text>
        <View style={{ marginTop: 16 }}>
          <Input label={t('commandes.cle_placeholder')} value={draft} onChangeText={setDraft} />
        </View>
        <View style={{ marginTop: 16 }}>
          <C07BtnPrimary
            label={t('commandes.cle_entrer')}
            icon="check"
            onPress={() => {
              if (draft.trim() !== '') onOuverte(draft.trim());
            }}
          />
        </View>
      </Card>
    </ScrollView>
  );
}

function LivreCommandes({
  service,
  cle,
  onCleRefusee,
}: {
  service: OperationsServicePort;
  cle: string;
  onCleRefusee: () => void;
}) {
  const [read, setRead] = useState<Read>({ kind: 'chargement' });
  const [segment, setSegment] = useState<SegmentCommandes>('a_traiter');
  const [ouvert, setOuvert] = useState<string | null>(null);
  /** Claim-carrying orderIds, null = the fund key is not connected. */
  const [claims, setClaims] = useState<ReadonlySet<string> | null>(null);
  /**
   * BOUTIK-FLOW (founder 2026-08-09) — the two facts that split the road into
   * his three stages, each from ITS OWN authority and never inferred:
   *   · the Séra board — whose live assignments say EN ROUTE (and name the
   *     carrier on the row);
   *   · the gains read — whose `livree` says DELIVERED (the settlement's own
   *     word, SE-LIVE-5).
   * Both best-effort: a missing key or a down Worker degrades rows toward
   * « Prêt à livrer » — true-but-colder, and the confier door re-refuses a
   * double relay by itself.
   */
  const [boardSera, setBoardSera] = useState<BoardSera | null>(null);
  const [livrees, setLivrees] = useState<ReadonlySet<string>>(new Set());
  /**
   * REMBOURSEMENT-2 + REMBOURSABLE-1 (AUDIT-B+2 F-69) — the key-C rows, read
   * ONCE for the whole tab: the refunds Shop+ is running AND, for the card he
   * opens, the buyer's number the courier brief needs. Each card used to read
   * every page of every buyer again; it now takes its row from here.
   * `cle_c_absente` when no key C is on this device (or Shop+ refused it).
   */
  const [livraisons, setLivraisons] = useState<ReadonlyMap<string, LivraisonRow> | 'chargement' | 'cle_c_absente' | 'echec'>(
    () => (readStoredCleC() === null ? 'cle_c_absente' : 'chargement'),
  );
  /** REMBOURSABLE-1 (F-61) — one of the best-effort reads (Séra, gains, Shop+)
   *  did not answer. Said once at the top: the book's own marks still class
   *  every order, but what only those reads know is missing. */
  const [lectureEchouee, setLectureEchouee] = useState(false);
  /** Shop+ refused the key C this device held — the door says so. */
  const [cleCRefusee, setCleCRefusee] = useState(false);
  const mediaBase = useMemo(() => resolveMediaBase(), []);

  const charger = useCallback(async (): Promise<void> => {
    // QUIET refresh (verifier finding, RELAIS-REPRISE): a recharge that
    // already holds the book keeps it on screen while refetching — the
    // post-confier reload must read as the row MOVING to « En route », never
    // as the whole screen flashing back to a loader.
    setRead((prev) => (prev.kind === 'ok' ? prev : { kind: 'chargement' }));
    const [orders, contacts] = await Promise.all([
      service.listPaidOrders(cle),
      service.listSupplierContacts(cle),
    ]);
    if (!orders.ok) {
      if (orders.reason === 'bad_key') onCleRefusee();
      else setRead({ kind: 'echec' });
      return;
    }
    // A contacts failure never blanks the BOOK — names degrade to supplier
    // ids (true, just colder); the board itself is the load-bearing read.
    setRead({ kind: 'ok', orders: orders.orders, contacts: contacts.ok ? contacts.contacts : [] });

    let echec = false;
    const cleSera = readStoredCleCoursiers();
    const dispatchSera = cleSera === null ? null : resolveSeraDispatch();
    if (cleSera !== null && dispatchSera !== null) {
      const b = await dispatchSera.board(cleSera);
      if (b.kind === 'ok') setBoardSera(b.value);
      else echec = true;
    }
    const cleC = readStoredCleC();
    const gains = resolveGainsService();
    if (cleC !== null && gains !== null) {
      const g = await gains.listGains(cleC);
      if (g.ok) setLivrees(new Set(g.rows.filter((r) => r.livree).map((r) => r.orderId)));
      else echec = true;
    }
    const dispatch = resolveDispatchService();
    if (cleC === null || dispatch === null) setLivraisons('cle_c_absente');
    else {
      const l = await dispatch.listLivraisons(cleC);
      if (l.ok) {
        setLivraisons(new Map(l.rows.map((r) => [r.orderId, r] as const)));
        // A sweep the page cap cut short is a partial read, said as one.
        if (l.incomplet) echec = true;
      }
      else if (l.reason === 'bad_key') {
        // A refused key C clears back to its door — the rotation moment, same
        // law as every stored key in this app.
        clearStoredCleC();
        setCleCRefusee(true);
        setLivraisons('cle_c_absente');
      } else {
        echec = true;
        setLivraisons('echec');
      }
    }
    setLectureEchouee(echec);

    // Incidents: joined from the claims book ONLY when the fund key is
    // already on this device (typed once in the Fonds zone). Best-effort —
    // a failure leaves null, and null renders the honest « pas relié » state,
    // never an empty list pretending nothing is signaled.
    const cleFonds = readStoredCleFonds();
    const fonds = cleFonds === null ? null : resolveFondsService();
    if (cleFonds !== null && fonds !== null) {
      const lecture = await fonds.lire(cleFonds);
      if (lecture.ok) {
        setClaims(new Set(lecture.livre.reclamations.map((r) => r.orderId)));
      }
    }
  }, [service, cle, onCleRefusee]);

  useEffect(() => {
    void charger();
  }, [charger]);

  if (read.kind === 'chargement') {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <PageTitle>{t('commandes.titre')}</PageTitle>
        <Card variant="Llg" style={{ marginTop: 16 }}>
          <Text style={CORPS}>{t('commandes.chargement')}</Text>
        </Card>
      </ScrollView>
    );
  }
  if (read.kind === 'echec') {
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <PageTitle>{t('commandes.titre')}</PageTitle>
        <Card variant="Llg" style={{ marginTop: 16 }}>
          <Text style={CORPS}>{t('commandes.echec')}</Text>
          <View style={{ marginTop: 12 }}>
            <BtnSoft label={t('commandes.reessayer')} onPress={() => void charger()} />
          </View>
        </Card>
      </ScrollView>
    );
  }

  const enRoute = new Set(boardSera?.affectations.map((a) => a.orderId) ?? []);
  /**
   * COLIS-FOURNISSEUR-1 — for an order in a package, the names of every
   * article in it (the rider's door reads them: refuse one, keep the rest).
   * A product name, bounded to the one line Séra accepts; an article whose
   * name is unknown is simply not named (the rider then reads « Article n »).
   * An article its supplier refused does not travel (Séra holds it
   * `cancelled`), so it is never named: Séra refuses a name outside the bag.
   */
  const articlesColis = (row: PaidOrderRow): { orderId: string; libelle: string }[] =>
    (row.colis?.orderIds ?? []).flatMap((id) => {
      const membre = read.orders.find((o) => o.orderId === id);
      if (membre?.fulfillment?.refusedAt !== undefined) return [];
      const nom = membre?.productName.trim() ?? '';
      if (nom === '') return [];
      return [{ orderId: id, libelle: nom.length > 80 ? `${nom.slice(0, 79)}…` : nom }];
    });
  const remboursements = new Map<string, RemboursementOperateur>(
    typeof livraisons === 'object'
      ? [...livraisons.values()].flatMap((r) => (r.remboursement !== undefined ? [[r.orderId, r.remboursement] as const] : []))
      : [],
  );
  const segments = segmenter(read.orders, claims ?? new Set(), enRoute, livrees, new Set(remboursements.keys()));
  const rows = segments[segment];
  const now = Date.now();
  const bloques = [...remboursements.values()].filter((r) => r.etat === 'bloque').length;
  const livraisonDe = (orderId: string): LivraisonRow | 'chargement' | 'cle_c_absente' | 'echec' =>
    typeof livraisons === 'object' ? (livraisons.get(orderId) ?? 'echec') : livraisons;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <PageTitle>{t('commandes.titre')}</PageTitle>
      {/* REMBOURSEMENT-2 — a buyer's refund that cannot finish by itself is
          the one thing on this tab nobody else will notice: said at the top,
          whatever segment is open. */}
      {bloques > 0 ? (
        <View style={{ marginTop: 12 }}>
          <Banner tone="danger">
            {bloques === 1
              ? t('commandes.remb_bloque_un')
              : t('commandes.remb_bloques_n').replace('{n}', String(bloques))}
          </Banner>
        </View>
      ) : null}
      {lectureEchouee ? (
        <View style={{ marginTop: 12 }}>
          <Banner tone="info">{t('commandes.lecture_partielle')}</Banner>
        </View>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginTop: 14 }}
        contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
      >
        <ChipSegment label={t('commandes.seg_a_traiter')} count={segments.a_traiter.length} active={segment === 'a_traiter'} onPress={() => { setSegment('a_traiter'); setOuvert(null); }} />
        <ChipSegment label={t('commandes.seg_pret')} count={segments.pret.length} active={segment === 'pret'} onPress={() => { setSegment('pret'); setOuvert(null); }} />
        <ChipSegment label={t('commandes.seg_en_route')} count={segments.en_route.length} active={segment === 'en_route'} onPress={() => { setSegment('en_route'); setOuvert(null); }} />
        <ChipSegment label={t('commandes.seg_terminees')} count={segments.terminees.length} active={segment === 'terminees'} onPress={() => { setSegment('terminees'); setOuvert(null); }} />
        <ChipSegment label={t('commandes.seg_incidents')} count={segments.incidents.length} active={segment === 'incidents'} onPress={() => { setSegment('incidents'); setOuvert(null); }} />
      </ScrollView>

      {segment === 'incidents' && claims === null ? (
        <View style={{ marginTop: 12 }}>
          <Banner tone="info">{t('commandes.incidents_pas_relie')}</Banner>
        </View>
      ) : null}

      {rows.length === 0 ? (
        <Card variant="Llg" style={{ marginTop: 16 }}>
          <Text style={CORPS}>
            {t(
              segment === 'a_traiter'
                ? 'commandes.vide_a_traiter'
                : segment === 'pret'
                  ? 'commandes.vide_pret'
                  : segment === 'en_route'
                    ? 'commandes.vide_en_route'
                    : segment === 'terminees'
                      ? 'commandes.vide_terminees'
                      : 'commandes.vide_incidents',
            )}
          </Text>
        </Card>
      ) : (
        <View style={{ marginTop: 12, gap: 10 }}>
          {rows.map((o) => (
            <RangCommande
              key={o.orderId}
              row={o}
              segment={segment}
              contacts={read.contacts}
              nowMs={now}
              ouvert={ouvert === o.orderId}
              onToggle={() => setOuvert(ouvert === o.orderId ? null : o.orderId)}
              service={service}
              cle={cle}
              mediaBase={mediaBase}
              coursier={nomCoursierPour(o.orderId, boardSera)}
              articlesColis={articlesColis(o)}
              remboursement={remboursements.get(o.orderId)}
              livraison={livraisonDe(o.orderId)}
              cleCRefusee={cleCRefusee}
              onCleC={(k) => {
                storeCleC(k);
                setCleCRefusee(false);
                setLivraisons('chargement');
                void charger();
              }}
              onCleCRefusee={() => {
                clearStoredCleC();
                setCleCRefusee(true);
                setLivraisons('cle_c_absente');
              }}
              onChanged={() => void charger()}
              onCleRefusee={onCleRefusee}
            />
          ))}
        </View>
      )}

      {/* PURGE-ESSAI — the sweep, UNDER the list and never above it: a
          destructive control does not greet him. It loops the rows he can
          SEE, one named call each; the Worker has no « retirer tout ». */}
      {rows.length > 0 ? (
        // KEYED BY SEGMENT (verifier MAJOR, round 1): switching tabs must
        // START THE QUESTION OVER, never carry a standing confirmation onto
        // a different set of rows. Belt and braces — the confirmed ids now
        // travel inside the question too, so the loop can only ever remove
        // what he was actually shown.
        <BalayageEssai
          key={segment}
          rows={rows}
          service={service}
          cle={cle}
          onChanged={() => void charger()}
          onCleRefusee={onCleRefusee}
        />
      ) : null}
    </ScrollView>
  );
}

/**
 * PURGE-ESSAI — « Retirer les commandes d'essai » for the segment on screen.
 *
 * ONE CONFIRMATION FOR THE SET, naming the count he is about to lose and
 * saying plainly that his products stay. Then one call per row, sequential
 * (the board is small and a serial loop keeps the progress line true), each
 * failure counted rather than swallowed: the closing sentence says how many
 * left and how many did not, and the rows that survived are still on screen
 * to try again. Nothing here reports a removal the book did not confirm.
 */
function BalayageEssai({ rows, service, cle, onChanged, onCleRefusee }: {
  rows: readonly PaidOrderRow[];
  service: OperationsServicePort;
  cle: string;
  onChanged: () => void;
  onCleRefusee: () => void;
}) {
  const [ui, setUi] = useState<RetraitUi>(RETRAIT_IDLE);
  /** REMBOURSABLE-1 (F-37) — rows the book kept because a refund notice has
   *  not reached Shop+ yet: counted apart, and said, never « pas pu ». */
  const [enAttente, setEnAttente] = useState(0);
  const sweep = ui.sweep;
  return (
    <View style={{ marginTop: 22, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#EDE6D8', gap: 8 }}>
      {sweep.kind === 'encours' ? (
        <Text style={PETIT}>
          {t('operations.balayage_encours').replace('{n}', String(sweep.faits)).replace('{t}', String(sweep.total))}
        </Text>
      ) : sweep.kind === 'demande' ? (
        <>
          <Text style={CORPS}>
            {t('operations.balayage_question').replace('{n}', String(sweep.orderIds.length))}
          </Text>
          <BtnSoft
            label={t('operations.balayage_oui')}
            onPress={() => {
              const started = sweepStart(ui);
              if (started === null) return void 0;
              setUi(started.ui);
              // Sequential on purpose: the progress line must be true, and a
              // console mid-purge must not fire a burst at the book.
              void (async () => {
                let vivant = started.ui;
                let faits = 0;
                let echecs = 0;
                let attente = 0;
                let cleRefusee = false;
                // THE CONFIRMED SET, never the current rows (verifier MAJOR).
                for (const orderId of started.orderIds) {
                  const r = await service.retirerCommande(cle, orderId);
                  if (r.ok) faits += 1;
                  else if (r.reason === 'refus_en_attente') attente += 1;
                  else {
                    echecs += 1;
                    // A refused key is not N stubborn orders — say the true
                    // thing once and stop blaming the rows.
                    if (r.reason === 'bad_key') cleRefusee = true;
                  }
                  vivant = sweepAvance(vivant);
                  setUi(vivant);
                  if (cleRefusee) break;
                }
                setEnAttente(attente);
                setUi(sweepFini(vivant, faits, echecs));
                if (cleRefusee) onCleRefusee();
                else onChanged();
              })();
            }}
          />
          <BtnSoft label={t('operations.retrait_annuler')} onPress={() => setUi(sweepAnnule(ui))} />
        </>
      ) : sweep.kind === 'fini' ? (
        <>
          <Text style={PETIT}>
            {sweep.echecs === 0
              ? t('operations.balayage_fini').replace('{n}', String(sweep.faits))
              : t('operations.balayage_reste')
                  .replace('{n}', String(sweep.faits))
                  .replace('{e}', String(sweep.echecs))}
          </Text>
          {enAttente > 0 ? (
            <Text style={PETIT}>{t('operations.balayage_refus_en_attente').replace('{n}', String(enAttente))}</Text>
          ) : null}
        </>
      ) : (
        <BtnSoft
          label={t('operations.balayage_action')}
          onPress={() => {
            const asked = sweepDemande(ui, rows.map((o) => o.orderId));
            if (asked === null) return void 0;
            setUi(asked);
          }}
        />
      )}
    </View>
  );
}

function RangCommande({
  row,
  segment,
  contacts,
  nowMs,
  ouvert,
  onToggle,
  service,
  cle,
  mediaBase,
  coursier,
  articlesColis,
  remboursement,
  livraison,
  cleCRefusee,
  onCleC,
  onCleCRefusee,
  onChanged,
  onCleRefusee,
}: {
  row: PaidOrderRow;
  segment: SegmentCommandes;
  contacts: readonly SupplierContact[];
  nowMs: number;
  ouvert: boolean;
  onToggle: () => void;
  service: OperationsServicePort;
  cle: string;
  mediaBase: string | null;
  /** The carrier's name off the Séra board join — En route rows only. */
  coursier: string | null;
  /** COLIS-FOURNISSEUR-1 — the named articles of this order's package. */
  articlesColis: readonly { orderId: string; libelle: string }[];
  /** REMBOURSEMENT-2 — the buyer's refund on this order, when there is one. */
  remboursement: RemboursementOperateur | undefined;
  /** REMBOURSABLE-1 (F-69) — this order's key-C row, from the tab's ONE read. */
  livraison: LivraisonRow | 'chargement' | 'cle_c_absente' | 'echec';
  /** Shop+ refused the key C this device held (it was cleared). */
  cleCRefusee: boolean;
  /** Key C typed at a card's door: kept, and the tab reads again. */
  onCleC: (cle: string) => void;
  onCleCRefusee: () => void;
  onChanged: () => void;
  /** Threaded down for the retire control: a refused key escalates to the
   *  console's own surface instead of dying silently on this card. */
  onCleRefusee: () => void;
}) {
  const qui = nomFournisseur(row.supplierId, contacts);
  const pill = pilluleCommande(row, segment, remboursement);
  const raison = raisonBlocage(remboursement);
  const attente = attenteDepuis(row.paidAt, nowMs);
  const pillBg = pill.ton === 'ok' ? '#E5F0E5' : pill.ton === 'alerte' ? '#F6E2DC' : '#F6E9C8';
  const pillFg = pill.ton === 'ok' ? '#2F5D3A' : pill.ton === 'alerte' ? '#7C2D12' : '#5F4403';
  return (
    <Card variant="Llg">
      <Pressable onPress={onToggle} accessibilityRole="button">
        {/* PHOTO-À-TRAITER — the photograph on the LEFT of the whole header, so
            the supplier's name stays the loudest LINE (his explicit ask) while
            the card can be recognised by the product at a glance. A row with
            no photograph keeps the exact layout it has today. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: GEO.gap.grid }}>
          <VignetteProduit uri={photoUri(row.productPhotoRef, mediaBase)} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={[NOM_FORT, { flexShrink: 1 }]} numberOfLines={1}>{qui.nom}</Text>
              <View style={{ backgroundColor: pillBg, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, marginLeft: 8 }}>
                <Text style={[role({ f: 'BG', w: 800, s: 11 }, pillFg)]}>{t(pill.label)}</Text>
              </View>
            </View>
            <Text style={[CORPS, { marginTop: 4 }]} numberOfLines={1}>
              {row.productName !== '' ? row.productName : row.productVersionId} · {row.zoneTo}
            </Text>
            <Text style={[PETIT, { marginTop: 2 }]} numberOfLines={1}>{row.orderId}</Text>
            {raison !== null ? (
              <Text style={[CORPS, { marginTop: 4 }]}>{t(raison)}</Text>
            ) : row.fulfillment?.refusedAt !== undefined ? (
              <Text style={[CORPS, { marginTop: 4 }]}>
                {t(row.fulfillment.refusPar === 'fondateur' ? 'commandes.annulee_ligne' : 'commandes.refusee_ligne')}
              </Text>
            ) : row.fulfillment?.pickupRefusedAt !== undefined ? (
              <Text style={[CORPS, { marginTop: 4 }]}>{t('commandes.ramassage_refuse_ligne')}</Text>
            ) : null}
          </View>
        </View>
      </Pressable>
      {ouvert ? (
        segment === 'pret' || segment === 'en_route' || segment === 'terminees' ? (
          <DetailTerminee row={row} service={service} cle={cle} mediaBase={mediaBase} etape={segment} coursier={coursier} articlesColis={articlesColis} buyer={livraison} cleCRefusee={cleCRefusee} onCleC={onCleC} onChanged={onChanged} />
        ) : (
          <>
            <DetailATraiter
              row={row}
              qui={qui}
              attente={attente}
              nowMs={nowMs}
              service={service}
              cle={cle}
              // REMBOURSEMENT-2 — nudging a supplier to prepare an order that is
              // refused or being refunded would send him after a dead order.
              relancePossible={
                remboursement === undefined && row.fulfillment?.refusedAt === undefined &&
                row.fulfillment?.pickupRefusedAt === undefined
              }
              // REMBOURSABLE-1 (verifier MINOR) — an ENDED order waits for no
              // one: « En attente depuis… Appelez le fournisseur » on an order
              // he cancelled, or the rider refused, would be false.
              ferme={
                row.fulfillment?.refusedAt !== undefined || row.fulfillment?.pickupRefusedAt !== undefined ||
                row.fulfillment?.returnedAt !== undefined
              }
              onChanged={onChanged}
            />
            {/* REMBOURSABLE-1 (F-02) — HIS « Annuler et rembourser », while the
                order can still be cancelled: before « prêt » (after it the colis
                is on Séra's road) and before any refund has begun. */}
            {row.fulfillment?.readyAt === undefined && row.fulfillment?.refusedAt === undefined && remboursement === undefined ? (
              <AnnulerRembourser row={row} service={service} cle={cle} onChanged={onChanged} onCleRefusee={onCleRefusee} />
            ) : null}
            {/* REMBOURSABLE-1 (F-10) — « Signaler », back where a course that
                failed at her door lands. Never on an order the SUPPLIER refused
                or the RIDER refused at pickup: nothing she did caused those, and
                the ladder would count it against her. */}
            {segment === 'incidents' && row.fulfillment?.refusedAt === undefined && row.fulfillment?.pickupRefusedAt === undefined ? (
              livraison === 'cle_c_absente' ? (
                // Verifier MINOR — never a fold that silently vanishes: without
                // a key C (never typed, or just refused) the way back is HERE.
                <View style={{ marginTop: 12 }}>
                  <PorteCleC refusee={cleCRefusee} onCleC={onCleC} />
                </View>
              ) : (
                <SignalerRefus
                  orderId={row.orderId}
                  cleC={readStoredCleC()}
                  aUnNumero={typeof livraison === 'object' && livraison.contact !== null}
                  onCleCRefusee={onCleCRefusee}
                />
              )
            ) : null}
          </>
        )
      ) : null}
      {/* PURGE-ESSAI — the retire lives HERE, under whichever detail is open:
          one place for all five segments, and reachable only on a card the
          founder deliberately opened. It whispers (§5: one primary action per
          screen — this is never it) and it asks before it acts. */}
      {ouvert ? (
        <RetraitCommande row={row} service={service} cle={cle} onChanged={onChanged} onCleRefusee={onCleRefusee} />
      ) : null}
    </Card>
  );
}

/**
 * PURGE-ESSAI (founder ruling 2026-08-10) — retire ONE test order.
 *
 * TWO TAPS, and the decision belongs to `operations/view.ts`: this component
 * holds substance only. The question names what leaves and what STAYS — his
 * products are not touched, and a founder mid-cleanup should not have to
 * remember that. A failure says so and keeps the row; nothing here reports a
 * removal the book did not confirm.
 */
function RetraitCommande({ row, service, cle, onChanged, onCleRefusee }: {
  row: PaidOrderRow;
  service: OperationsServicePort;
  cle: string;
  onChanged: () => void;
  /** ⚠ VERIFIER MAJOR (round 1) — A REFUSED KEY MUST NOT BE A SILENT NO-OP.
   *  The first cut handled only `refresh`, so a mid-session key refusal reset
   *  the card to its button with no sentence at all: he taps, nothing
   *  happens, nothing explains. Every other act on this console escalates;
   *  so does this one now. */
  onCleRefusee: () => void;
}) {
  const [ui, setUi] = useState<RetraitUi>(RETRAIT_IDLE);
  return (
    <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: '#EDE6D8', paddingTop: 12 }}>
      {ui.busy === row.orderId ? (
        <Text style={PETIT}>{t('operations.retrait_encours')}</Text>
      ) : ui.demande === row.orderId ? (
        <View style={{ gap: 8 }}>
          <Text style={CORPS}>{t('operations.retrait_question')}</Text>
          <BtnSoft
            label={t('operations.retrait_oui')}
            onPress={() => {
              const started = retraitStart(ui, row.orderId);
              if (started === null) return void 0;
              setUi(started);
              void service.retirerCommande(cle, row.orderId).then((r) => {
                const settled = retraitSettled(row.orderId, r);
                setUi(settled.ui);
                if (settled.then === 'refresh') onChanged();
                else if (settled.then === 'bad_key') onCleRefusee();
              });
            }}
          />
          <BtnSoft label={t('operations.retrait_annuler')} onPress={() => setUi(retraitAnnule(ui))} />
        </View>
      ) : (
        <BtnSoft
          label={t('operations.retrait_action')}
          onPress={() => {
            const asked = retraitDemande(ui, row.orderId);
            if (asked === null) return void 0;
            setUi(asked);
          }}
        />
      )}
      {ui.echec === row.orderId ? (
        <Text style={[PETIT, { marginTop: 6 }]}>{t('operations.retrait_echec')}</Text>
      ) : null}
      {/* REMBOURSABLE-1 (F-37) — the book refused because the buyer's refund
          notice has not reached Shop+ yet: a wait, said as one. */}
      {ui.enAttente === row.orderId ? (
        <Text style={[PETIT, { marginTop: 6 }]}>{t('operations.retrait_refus_en_attente')}</Text>
      ) : null}
    </View>
  );
}

/**
 * REMBOURSABLE-1 (AUDIT-B+2 F-02) — « ANNULER ET REMBOURSER », his act on a
 * paid order no supplier will serve (unanswered, his access cut, or a product
 * nobody could attribute). The buyer's money must never wait on a supplier's
 * tap (B+I-13), and until now it did.
 *
 * TWO TAPS, like every act here that cannot be taken back: the question says
 * what happens — she is refunded in full, the supplier sees HIS cancel — and
 * the way out comes first. It claims nothing the book did not confirm: « Vous
 * avez annulé » appears only once the re-read carries the mark, and the refund
 * itself is Shop+'s to state. The automatic timer is NOT here (his ruling).
 */
function AnnulerRembourser({ row, service, cle, onChanged, onCleRefusee }: {
  row: PaidOrderRow;
  service: OperationsServicePort;
  cle: string;
  onChanged: () => void;
  onCleRefusee: () => void;
}) {
  const [etat, setEtat] = useState<'repos' | 'question' | 'envoi' | 'echec' | 'deja_prete' | 'inconnue'>('repos');
  if (etat === 'deja_prete' || etat === 'inconnue') {
    return (
      <View style={{ marginTop: 14 }}>
        <Text style={CORPS}>{t(etat === 'deja_prete' ? 'commandes.annuler_deja_prete' : 'commandes.annuler_inconnue')}</Text>
      </View>
    );
  }
  return (
    <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: '#EDE6D8', paddingTop: 12, gap: 8 }}>
      {etat === 'envoi' ? (
        <Text style={PETIT}>{t('commandes.annuler_encours')}</Text>
      ) : etat === 'question' ? (
        <>
          <Text style={CORPS}>{t('commandes.annuler_question')}</Text>
          <BtnSoft label={t('commandes.annuler_garder')} onPress={() => setEtat('repos')} />
          <BtnSoft
            label={t('commandes.annuler_oui')}
            labelStyle={{ color: P.dangerFg }}
            onPress={() => {
              setEtat('envoi');
              void service.annulerCommande(cle, row.orderId).then((r) => {
                if (r.ok) {
                  onChanged();
                  return;
                }
                if (r.reason === 'bad_key') onCleRefusee();
                else if (r.reason === 'deja_prete') setEtat('deja_prete');
                else if (r.reason === 'inconnue') setEtat('inconnue');
                else setEtat('echec');
              });
            }}
          />
        </>
      ) : (
        <>
          <BtnSoft label={t('commandes.annuler_action')} onPress={() => setEtat('question')} />
          {etat === 'echec' ? <Text style={PETIT}>{t('commandes.annuler_echec')}</Text> : null}
        </>
      )}
    </View>
  );
}

/** À traiter (and Incidents share it): how long, who, call, notify — and the
 *  card form right where its absence is felt. */
function DetailATraiter({
  row,
  qui,
  attente,
  nowMs,
  service,
  cle,
  relancePossible,
  ferme,
  onChanged,
}: {
  row: PaidOrderRow;
  qui: { nom: string; telephone: string; carteAbsente: boolean };
  attente: string;
  nowMs: number;
  service: OperationsServicePort;
  cle: string;
  relancePossible: boolean;
  /** The order has ended (refused, cancelled, refused at pickup, back home):
   *  no waiting time, no urgency. */
  ferme: boolean;
  onChanged: () => void;
}) {
  const ton = tonAttente(row.paidAt, nowMs);
  const [busy, setBusy] = useState<'relance' | 'carte' | null>(null);
  const [fait, setFait] = useState(false);
  const [nom, setNom] = useState(qui.carteAbsente ? '' : qui.nom);
  const [tel, setTel] = useState(qui.telephone);
  const attenteLabel = attente === 'commandes.instant' ? t('commandes.instant') : attente;

  return (
    <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: '#EDE6D8', paddingTop: 12 }}>
      {!ferme ? (
        <>
          <Text style={PETIT}>{t('commandes.attente_depuis')}</Text>
          <Text style={[DUREE, { marginTop: 2 }]}>{attenteLabel}</Text>
          {ton !== 'calme' ? (
            <View style={{ marginTop: 8 }}>
              <Banner tone={ton === 'fort' ? 'danger' : 'warn'}>
                {t(ton === 'fort' ? 'commandes.attente_forte' : 'commandes.attente_appuyee')}
              </Banner>
            </View>
          ) : null}
          {row.relance !== undefined ? (
            <Text style={[PETIT, { marginTop: 8 }]}>{t('commandes.deja_relance')}</Text>
          ) : null}
        </>
      ) : null}

      <View style={{ marginTop: 14, gap: 8 }}>
        {qui.telephone !== '' ? (
          <C07BtnPrimary
            label={`${t('commandes.appeler')} ${qui.nom}`}
            icon="check"
            onPress={() => {
              // The founder's own device dials; the number never leaves it.
              void Linking.openURL(`tel:${qui.telephone.replace(/\s+/g, '')}`);
            }}
          />
        ) : (
          <Banner tone="info">{t('commandes.pas_de_numero')}</Banner>
        )}
        {relancePossible ? (
          <BtnSoft
            label={fait ? t('commandes.relance_faite') : t('commandes.notifier')}
            onPress={() => {
              if (busy !== null || fait) return void 0;
              setBusy('relance');
              void service.recordRelance(cle, row.orderId).then((r) => {
                setBusy(null);
                if (r.ok) {
                  setFait(true);
                  onChanged();
                }
              });
            }}
          />
        ) : null}
      </View>

      {qui.carteAbsente || qui.telephone === '' ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          <Text style={PETIT}>{t('commandes.carte_titre')}</Text>
          <Input label={t('commandes.carte_nom')} value={nom} onChangeText={setNom} />
          <Input label={t('commandes.carte_tel')} value={tel} onChangeText={setTel} />
          <BtnSoft
            label={t('commandes.carte_enregistrer')}
            onPress={() => {
              if (busy !== null || nom.trim() === '') return void 0;
              setBusy('carte');
              void service
                .saveSupplierContact(cle, { supplierId: row.supplierId, name: nom.trim(), phone: tel.trim() })
                .then((r) => {
                  setBusy(null);
                  if (r.ok) onChanged();
                });
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/** The delivery-road detail, one card per stage (BOUTIK-FLOW, founder
 *  2026-08-09): « Prêt à livrer » carries the proof, the buyer, and the
 *  confier act; « En route » names the carrier instead of re-offering the
 *  act; « Terminées » states the delivery — settled work, no button. */
function DetailTerminee({
  row,
  service,
  cle,
  mediaBase,
  etape,
  coursier,
  articlesColis,
  buyer,
  cleCRefusee,
  onCleC,
  onChanged,
}: {
  row: PaidOrderRow;
  service: OperationsServicePort;
  cle: string;
  mediaBase: string | null;
  etape: 'pret' | 'en_route' | 'terminees';
  coursier: string | null;
  articlesColis: readonly { orderId: string; libelle: string }[];
  /** REMBOURSABLE-1 (F-69) — the buyer's row from the tab's ONE key-C read.
   *  This card used to re-read every page of every buyer each time it opened. */
  buyer: LivraisonRow | 'chargement' | 'cle_c_absente' | 'echec';
  cleCRefusee: boolean;
  onCleC: (cle: string) => void;
  onChanged: () => void;
}) {
  const [preuve, setPreuve] = useState<OrderEvidence | 'chargement' | 'echec'>('chargement');

  useEffect(() => {
    let alive = true;
    void service.orderEvidence(cle, row.orderId).then((r) => {
      if (alive) setPreuve(r.ok ? r.evidence : 'echec');
    });
    return () => {
      alive = false;
    };
  }, [service, cle, row.orderId]);

  return (
    <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: '#EDE6D8', paddingTop: 12, gap: 12 }}>
      <View>
        <Text style={PETIT}>{t('commandes.preuve_titre')}</Text>
        {preuve === 'chargement' ? (
          <Text style={[CORPS, { marginTop: 6 }]}>{t('commandes.chargement')}</Text>
        ) : preuve === 'echec' ? (
          <Text style={[CORPS, { marginTop: 6 }]}>{t('commandes.preuve_echec')}</Text>
        ) : mediaBase === null ? (
          <Text style={[CORPS, { marginTop: 6 }]}>{t('commandes.preuve_sans_media')}</Text>
        ) : (
          <Image
            source={{ uri: `${mediaBase}/${preuve.photoRef.ref}` }}
            // Founder report 2026-08-08: « the photo is too large » — the same
            // desktop-width lesson as the fiche gallery: the PHOTO is capped,
            // never the screen.
            style={{ width: '100%', maxWidth: 340, height: 220, borderRadius: 14, marginTop: 8, backgroundColor: '#EDE6D8' }}
            resizeMode="cover"
          />
        )}
      </View>
      <View>
        <Text style={PETIT}>{t('commandes.cliente_titre')}</Text>
        {buyer === 'chargement' ? (
          <Text style={[CORPS, { marginTop: 6 }]}>{t('commandes.chargement')}</Text>
        ) : buyer === 'cle_c_absente' ? (
          // The key C DOOR lives here now — the Livraisons zone that used to
          // hold it retires in this slice. Typed once, kept on his device,
          // cleared if the Shop+ Worker refuses it.
          <PorteCleC refusee={cleCRefusee} onCleC={onCleC} />
        ) : buyer === 'echec' ? (
          <Text style={[CORPS, { marginTop: 6 }]}>{t('commandes.cliente_echec')}</Text>
        ) : (
          <View style={{ marginTop: 6 }}>
            {buyer.contact !== null ? (
              <>
                {/* TEL-PAIRES (founder 2026-08-09): « 76 16 02 55 » — pairs,
                    exactly as he reads a number to a rider over the phone.
                    PRET-SECTIONS-2 (founder 2026-08-09): the phone and her
                    voice note stay; quartier/repère/zone left this block —
                    they live in their own labelled sections in the compose
                    fold now, and one fact on one card lives in one place. */}
                <Text style={TITRE}>{telEnPaires(buyer.contact.phone)}</Text>
                {buyer.contact.audioRef !== undefined && mediaBase !== null ? (
                  <EcouterRepere url={`${mediaBase}/${buyer.contact.audioRef}`} />
                ) : null}
              </>
            ) : (
              <Text style={CORPS}>{t('commandes.cliente_sans_contact')}</Text>
            )}
          </View>
        )}
      </View>
      {etape === 'en_route' ? (
        /* The carrier, named off the Séra board — the same join the Gains
           tab reads. A board gap degrades to the honest pill, never a guess.
           RAMASSAGE deliberately does NOT live here (founder, 2026-08-09:
           « that screen should be on the supplier's console not mine ») —
           the pickup check is the SUPPLIER's act, on the fournisseur surface. */
        <Banner tone="info">
          {coursier !== null ? `${t('commandes.en_route_avec')} ${coursier}` : t('commandes.pill_en_route')}
        </Banner>
      ) : etape === 'terminees' ? (
        <Banner tone="success" check>
          {t('commandes.livree_banner')}
        </Banner>
      ) : (
        /* RB-2 — the dispatch act itself, the fold this detail was built for.
           COURSE-BRIEF (founder order 2026-08-09): the readiness proof photo
           this very screen is showing travels WITH the relay, so the rider
           checks the package against the same picture the founder just saw. */
        <>
          {/* COLIS-FOURNISSEUR-1 — said before he relays: this one course
              carries every article of the bag. */}
          {row.colis !== undefined ? (
            <View style={{ marginTop: 12 }}>
              <Banner tone="info">{t('commandes.colis_note').replace('{n}', String(row.colis.orderIds.length))}</Banner>
            </View>
          ) : null}
          <ConfierCoursier
            row={row}
            buyer={typeof buyer === 'object' ? buyer : null}
            preuvePhotoRef={typeof preuve === 'object' ? preuve.photoRef.ref : null}
            articles={articlesColis}
            onConfiee={onChanged}
          />
        </>
      )}
    </View>
  );
}

/**
 * The key C door (« Clé Shop+ »), wherever a card needs Shop+: the buyer's
 * number on « Prêt à livrer », « Signaler » on Incidents. Typed once, kept on
 * his device; a refused key comes back here, said as refused.
 */
function PorteCleC({ refusee, onCleC }: { refusee: boolean; onCleC: (cle: string) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <View style={{ marginTop: 6, gap: 8 }}>
      <Banner tone={refusee ? 'warn' : 'info'}>{t(refusee ? 'livraisons.cle_refusee' : 'commandes.cle_c_requise')}</Banner>
      <Input label={t('commandes.cle_c_placeholder')} value={draft} onChangeText={setDraft} />
      <BtnSoft
        label={t('commandes.cle_entrer')}
        onPress={() => {
          if (draft.trim() === '') return void 0;
          onCleC(draft.trim());
        }}
      />
    </View>
  );
}

/** The browser's audio element, structurally — this app's tsconfig carries
 *  no DOM lib (it is a React Native workspace), and the web build is where
 *  this control lives. */
interface LecteurAudio {
  currentTime: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(ev: string, fn: () => void): void;
}

/** « m:ss » — the SAME shape the buyer's own player and the rider's row use,
 *  so one note reads identically wherever it is heard. */
function dureeVoix(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * REPERE-AUDIO-REEL — the buyer's voice note, played where the founder
 * relays it. Web-only by nature (`Audio` is the browser's; the console IS
 * the web app) — on a build without it the control simply does not exist,
 * never a dead button. The label toggles with the truth: écouter ↔ pause.
 *
 * VOIX-ÉTAT-2 (founder 2026-08-09) — « the seconds are not counting ». True
 * here too: the label knew whether it was playing, and nothing knew WHERE. A
 * repère is a sentence; without a clock there is no way to tell a note that is
 * running from one that stalled on a slow load. The pause STATE was already
 * shown (the label says « Pause »), so only the clock was missing — and only
 * the clock is added: this button has never carried an icon, and giving it one
 * would be a redesign nobody asked for.
 */
function EcouterRepere({ url }: { url: string }) {
  const [lecture, setLecture] = useState(false);
  const [seconde, setSeconde] = useState(0);
  const lecteur = useRef<LecteurAudio | null>(null);
  useEffect(() => () => lecteur.current?.pause(), []);
  const AudioCtor = (globalThis as { Audio?: new (src: string) => LecteurAudio }).Audio;
  if (AudioCtor === undefined) return null;
  return (
    <View style={{ marginTop: 8, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <BtnSoft
        label={t(lecture ? 'commandes.repere_voix_pause' : 'commandes.repere_voix_ecouter')}
        onPress={() => {
          let audio = lecteur.current;
          if (audio === null) {
            audio = new AudioCtor(url);
            const repos = (): void => { setLecture(false); setSeconde(0); };
            audio.addEventListener('ended', repos);
            audio.addEventListener('error', repos);
            // EVERY way playback can stop puts the control back — including a
            // pause this code did not ask for (audio focus lost, another tab
            // taking the media session). Without it the label sat on « Pause »
            // over silence, which is the defect this whole change is about.
            // It stops the CLAIM and keeps the POSITION — the same thing the
            // button's own pause does, so the two cannot disagree.
            audio.addEventListener('pause', () => setLecture(false));
            // The position, straight off the element — never a timer of our own
            // counting alongside a note it cannot see.
            audio.addEventListener('timeupdate', () => setSeconde(lecteur.current?.currentTime ?? 0));
            lecteur.current = audio;
          }
          if (lecture) {
            audio.pause();
            setLecture(false); // the position STAYS: he can see where he stopped
            return;
          }
          void audio.play().then(
            () => setLecture(true),
            () => { setLecture(false); setSeconde(0); }, // a refused play never leaves a lying label
          );
        }}
      />
      {/* Blank before the first tap — a clock over a note nobody started would
          be claiming a position that does not exist. */}
      {lecture || seconde > 0 ? (
        <Text style={[CORPS, { fontVariant: ['tabular-nums'] }]}>{dureeVoix(seconde)}</Text>
      ) : null}
    </View>
  );
}
