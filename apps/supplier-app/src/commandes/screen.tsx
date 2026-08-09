import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnSoft, C07BtnPrimary, Card, ChipSegment, Input, PageTitle } from '../v2/components';
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
} from '../operations/dispatch-service';
import { readStoredCleFonds, resolveFondsService } from '../fonds/service';
import { readStoredCleCoursiers } from '../coursiers/service';
import { resolveSeraDispatch, type BoardSera } from './sera-service';
import { nomCoursierPour } from '../gains/view';
import { resolveMediaBase } from '../supply/media';
import { ConfierCoursier } from './confier';
import {
  attenteDepuis,
  nomFournisseur,
  pilluleCommande,
  segmenter,
  tonAttente,
  type SegmentCommandes,
} from './view';

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

    const cleSera = readStoredCleCoursiers();
    const dispatchSera = cleSera === null ? null : resolveSeraDispatch();
    if (cleSera !== null && dispatchSera !== null) {
      const b = await dispatchSera.board(cleSera);
      if (b.kind === 'ok') setBoardSera(b.value);
    }
    const cleC = readStoredCleC();
    const gains = resolveGainsService();
    if (cleC !== null && gains !== null) {
      const g = await gains.listGains(cleC);
      if (g.ok) setLivrees(new Set(g.rows.filter((r) => r.livree).map((r) => r.orderId)));
    }

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
  const segments = segmenter(read.orders, claims ?? new Set(), enRoute, livrees);
  const rows = segments[segment];
  const now = Date.now();

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} showsVerticalScrollIndicator={false}>
      <PageTitle>{t('commandes.titre')}</PageTitle>
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
              onChanged={() => void charger()}
            />
          ))}
        </View>
      )}
    </ScrollView>
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
  onChanged,
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
  onChanged: () => void;
}) {
  const qui = nomFournisseur(row.supplierId, contacts);
  const pill = pilluleCommande(row, segment);
  const attente = attenteDepuis(row.paidAt, nowMs);
  const pillBg = pill.ton === 'ok' ? '#E5F0E5' : pill.ton === 'alerte' ? '#F6E2DC' : '#F6E9C8';
  const pillFg = pill.ton === 'ok' ? '#2F5D3A' : pill.ton === 'alerte' ? '#7C2D12' : '#5F4403';
  return (
    <Card variant="Llg">
      <Pressable onPress={onToggle} accessibilityRole="button">
        {/* THE SUPPLIER'S NAME IS THE LOUDEST LINE — his explicit ask. */}
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
      </Pressable>
      {ouvert ? (
        segment === 'pret' || segment === 'en_route' || segment === 'terminees' ? (
          <DetailTerminee row={row} service={service} cle={cle} mediaBase={mediaBase} etape={segment} coursier={coursier} onChanged={onChanged} />
        ) : (
          <DetailATraiter row={row} qui={qui} attente={attente} nowMs={nowMs} service={service} cle={cle} onChanged={onChanged} />
        )
      ) : null}
    </Card>
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
  onChanged,
}: {
  row: PaidOrderRow;
  qui: { nom: string; telephone: string; carteAbsente: boolean };
  attente: string;
  nowMs: number;
  service: OperationsServicePort;
  cle: string;
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
  onChanged,
}: {
  row: PaidOrderRow;
  service: OperationsServicePort;
  cle: string;
  mediaBase: string | null;
  etape: 'pret' | 'en_route' | 'terminees';
  coursier: string | null;
  onChanged: () => void;
}) {
  const [preuve, setPreuve] = useState<OrderEvidence | 'chargement' | 'echec'>('chargement');
  const [buyer, setBuyer] = useState<LivraisonRow | 'chargement' | 'cle_c_absente' | 'echec'>(
    'chargement',
  );
  const [cleCDraft, setCleCDraft] = useState('');
  const [recharge, setRecharge] = useState(0);

  useEffect(() => {
    let alive = true;
    void service.orderEvidence(cle, row.orderId).then((r) => {
      if (alive) setPreuve(r.ok ? r.evidence : 'echec');
    });
    const cleC = readStoredCleC();
    const dispatch = resolveDispatchService();
    if (cleC === null || dispatch === null) {
      setBuyer('cle_c_absente');
    } else {
      setBuyer('chargement');
      void dispatch.listLivraisons(cleC).then((r) => {
        if (!alive) return;
        if (!r.ok) {
          // A refused key C clears back to its door — the rotation moment,
          // same law as every stored key in this app.
          if (r.reason === 'bad_key') {
            clearStoredCleC();
            setBuyer('cle_c_absente');
          } else setBuyer('echec');
          return;
        }
        setBuyer(r.rows.find((l) => l.orderId === row.orderId) ?? 'echec');
      });
    }
    return () => {
      alive = false;
    };
  }, [service, cle, row.orderId, recharge]);

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
          <View style={{ marginTop: 6, gap: 8 }}>
            <Banner tone="info">{t('commandes.cle_c_requise')}</Banner>
            <Input label={t('commandes.cle_c_placeholder')} value={cleCDraft} onChangeText={setCleCDraft} />
            <BtnSoft
              label={t('commandes.cle_entrer')}
              onPress={() => {
                if (cleCDraft.trim() === '') return void 0;
                storeCleC(cleCDraft.trim());
                setRecharge((n) => n + 1);
              }}
            />
          </View>
        ) : buyer === 'echec' ? (
          <Text style={[CORPS, { marginTop: 6 }]}>{t('commandes.cliente_echec')}</Text>
        ) : (
          <View style={{ marginTop: 6 }}>
            {buyer.contact !== null ? (
              <>
                <Text style={TITRE}>{buyer.contact.phone}</Text>
                <Text style={[CORPS, { marginTop: 4 }]}>{buyer.contact.quartier}</Text>
                <Text style={[CORPS, { marginTop: 2 }]}>{buyer.contact.repere}</Text>
                {/* REPERE-AUDIO-REEL — HER OWN VOICE saying where the door is,
                    right where he reads the contact he relays to the rider. */}
                {buyer.contact.audioRef !== undefined && mediaBase !== null ? (
                  <EcouterRepere url={`${mediaBase}/${buyer.contact.audioRef}`} />
                ) : null}
              </>
            ) : (
              <Text style={CORPS}>{t('commandes.cliente_sans_contact')}</Text>
            )}
            <Text style={[PETIT, { marginTop: 6 }]}>{row.zoneTo}</Text>
          </View>
        )}
      </View>
      {etape === 'en_route' ? (
        // The carrier, named off the Séra board — the same join the Gains tab
        // reads. A board gap degrades to the honest pill alone, never a guess.
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
        <ConfierCoursier
          row={row}
          buyer={typeof buyer === 'object' ? buyer : null}
          preuvePhotoRef={typeof preuve === 'object' ? preuve.photoRef.ref : null}
          onConfiee={onChanged}
        />
      )}
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
