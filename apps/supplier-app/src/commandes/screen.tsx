import { useCallback, useEffect, useMemo, useState } from 'react';
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
  storeCleC,
  type LivraisonRow,
} from '../operations/dispatch-service';
import { readStoredCleFonds, resolveFondsService } from '../fonds/service';
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
  const mediaBase = useMemo(() => resolveMediaBase(), []);

  const charger = useCallback(async (): Promise<void> => {
    setRead({ kind: 'chargement' });
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

  const segments = segmenter(read.orders, claims ?? new Set());
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
        segment === 'terminees' ? (
          <DetailTerminee row={row} service={service} cle={cle} mediaBase={mediaBase} />
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

/** Terminée: the supplier's photo proof, then the buyer — everything the
 *  dispatch decision needs on one card. The dispatch BUTTON itself is RB-2:
 *  no dead primary action ships here (the SE-LIVE-4c lesson). */
function DetailTerminee({
  row,
  service,
  cle,
  mediaBase,
}: {
  row: PaidOrderRow;
  service: OperationsServicePort;
  cle: string;
  mediaBase: string | null;
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
              </>
            ) : (
              <Text style={CORPS}>{t('commandes.cliente_sans_contact')}</Text>
            )}
            <Text style={[PETIT, { marginTop: 6 }]}>{row.zoneTo}</Text>
          </View>
        )}
      </View>
      {/* RB-2 — the dispatch act itself, the fold this detail was built for. */}
      <ConfierCoursier row={row} buyer={typeof buyer === 'object' ? buyer : null} />
    </View>
  );
}
