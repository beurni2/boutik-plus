import { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { SCROLL, TNUM, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnSoft, Card, Input } from '../v2/components';
import { formatF } from '../v2/money';
import {
  clearStoredCleC,
  readStoredCleC,
  resolveGainsService,
  storeCleC,
  type GainRow,
} from '../operations/dispatch-service';
import { clearStoredCleCoursiers, readStoredCleCoursiers } from '../coursiers/service';
import { resolveSeraDispatch, type BoardSera } from '../commandes/sera-service';
import { nomCoursierPour, ordonnerGains } from './view';

/**
 * ═══ RB-3 — « VOS GAINS », the real money tab (founder direction 2026-08-08) ═══
 *
 * « The gains tab […] the successful orders completed with the money share
 * well explained between supplier, reseller, and fees and which rider
 * delivered. »
 *
 * Every franc on this screen is a FROZEN byte of the order's immutable Quote,
 * served by the Shop+ Worker behind key C and rendered field by field — this
 * screen adds nothing, derives nothing, rounds nothing (Ten Laws #1/#2). The
 * Worker refuses to serve any split canon's reconciliation rejects, so a card
 * shown here reconciles to the franc by construction.
 *
 * The rider line is Séra's OWN book (the board's live assignments), joined
 * only when the Séra key already sits in its slot — no second door on this
 * screen. An order with no live carrier says so honestly; « livrée » as a
 * settled fact arrives with SE-LIVE-5.
 */

const TITRE = role({ f: 'BG', w: 800, s: 22 }, P.ink);
const CORPS = role({ f: 'IS', w: 400, s: 13 }, P.sub);
const PETIT = role({ f: 'IS', w: 400, s: 12 }, P.sub);
const GROS_MONTANT = role({ f: 'BG', w: 800, s: 24 }, P.greenDeep);
const LIGNE_NOM = role({ f: 'IS', w: 500, s: 13 }, P.sub);
const LIGNE_MONTANT = role({ f: 'BG', w: 700, s: 14 }, P.ink);

type Etat =
  | { kind: 'porte' }
  | { kind: 'chargement' }
  | { kind: 'echec' }
  | { kind: 'pret'; rows: readonly GainRow[]; board: BoardSera | null };

export function SGainsReel() {
  const service = resolveGainsService();
  if (service === null) {
    return (
      <View style={[{ flex: 1 }, SCROLL.tabs]}>
        <Text style={TITRE}>{t('gains.titre')}</Text>
        <View style={{ marginTop: 12 }}>
          <Banner tone="info">{t('gains.pas_relie')}</Banner>
        </View>
      </View>
    );
  }
  return <GainsAvecService />;
}

function GainsAvecService() {
  const [cle, setCle] = useState<string | null>(() => readStoredCleC());
  const [etat, setEtat] = useState<Etat>({ kind: cle === null ? 'porte' : 'chargement' });
  const [cleDraft, setCleDraft] = useState('');
  const [recharge, setRecharge] = useState(0);

  useEffect(() => {
    if (cle === null) return void 0;
    const service = resolveGainsService();
    if (service === null) return void 0;
    let alive = true;
    setEtat({ kind: 'chargement' });
    void (async () => {
      const answer = await service.listGains(cle);
      if (!alive) return;
      if (!answer.ok) {
        if (answer.reason === 'bad_key') {
          clearStoredCleC();
          setCle(null);
          setEtat({ kind: 'porte' });
        } else {
          setEtat({ kind: 'echec' });
        }
        return;
      }
      // The rider join is BEST EFFORT and never blocks the money: the Séra
      // key may be absent from this device, the Worker unreachable — the
      // cards still render, the carrier line says what it honestly can.
      let board: BoardSera | null = null;
      const cleSera = readStoredCleCoursiers();
      const sera = resolveSeraDispatch();
      if (cleSera !== null && sera !== null) {
        const b = await sera.board(cleSera);
        if (!alive) return;
        if (b.kind === 'ok') board = b.value;
        else if (b.kind === 'bad_key') clearStoredCleCoursiers();
      }
      setEtat({ kind: 'pret', rows: ordonnerGains(answer.rows), board });
    })();
    return () => {
      alive = false;
    };
  }, [cle, recharge]);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={SCROLL.tabs}>
      <Text style={TITRE}>{t('gains.titre')}</Text>
      <Text style={[CORPS, { marginTop: 4 }]}>{t('gains.explique')}</Text>

      {etat.kind === 'porte' ? (
        <Card variant="Llg" style={{ marginTop: 14 }}>
          <Banner tone="info">{t('gains.cle_requise')}</Banner>
          <View style={{ marginTop: 10, gap: 8 }}>
            <Input label={t('commandes.cle_c_placeholder')} value={cleDraft} onChangeText={setCleDraft} />
            <BtnSoft
              label={t('commandes.cle_entrer')}
              onPress={() => {
                if (cleDraft.trim() === '') return void 0;
                storeCleC(cleDraft.trim());
                setCle(cleDraft.trim());
              }}
            />
          </View>
        </Card>
      ) : etat.kind === 'chargement' ? (
        <Text style={[CORPS, { marginTop: 14 }]}>{t('commandes.chargement')}</Text>
      ) : etat.kind === 'echec' ? (
        <View style={{ marginTop: 14, gap: 8 }}>
          <Text style={CORPS}>{t('commandes.echec')}</Text>
          <BtnSoft label={t('commandes.reessayer')} onPress={() => setRecharge((n) => n + 1)} />
        </View>
      ) : etat.rows.length === 0 ? (
        <Card variant="Llg" style={{ marginTop: 14 }}>
          <Text style={CORPS}>{t('gains.vide')}</Text>
        </Card>
      ) : (
        <View style={{ marginTop: 14, gap: 12 }}>
          <Text style={PETIT}>{t('gains.reconcilie')}</Text>
          {etat.rows.map((row) => (
            <CarteGain key={row.orderId} row={row} coursier={nomCoursierPour(row.orderId, etat.board)} />
          ))}
          <BtnSoft label={t('commandes.reessayer')} onPress={() => setRecharge((n) => n + 1)} />
        </View>
      )}
    </ScrollView>
  );
}

/** One sale, part by part — every figure the frozen quote's OWN, in the
 *  app's one FCFA formatter. No sums happen here: the parts and the total
 *  are each stored bytes, and canon already proved they meet to the franc. */
function CarteGain({ row, coursier }: { row: GainRow; coursier: string | null }) {
  const s = row.split;
  return (
    <Card variant="Llg">
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[PETIT, TNUM]} numberOfLines={1}>
          {`${t('gains.commande_du')} ${row.createdAt.slice(0, 10)}`}
        </Text>
        <Text style={[PETIT, TNUM]} numberOfLines={1}>{row.orderId}</Text>
      </View>
      {row.zoneTo !== '' ? (
        <Text style={[PETIT, { marginTop: 2 }]} numberOfLines={1}>{row.zoneTo}</Text>
      ) : null}

      {row.livree ? (
        // SE-LIVE-5c — the ecosystem's badge words, only when Séra's validated
        // signal folded the settlement records: never a default, never a guess.
        <View style={{ marginTop: 8, alignSelf: 'flex-start', backgroundColor: P.successBg, borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 }}>
          <Text style={role({ f: 'IS', w: 700, s: 11.5 }, P.successFg)}>{t('gains.livree')}</Text>
        </View>
      ) : null}

      <Text style={[LIGNE_NOM, { marginTop: 10 }]}>{t('gains.total')}</Text>
      <Text style={[GROS_MONTANT, TNUM]}>{formatF(s.buyerTotal)}</Text>

      {/* FRAIS-ZERO (founder 2026-08-25): no frais rows — the rate is 0, and
          a « 0 F » fee line would name a charge that does not exist. */}
      <View style={{ marginTop: 10, gap: 6 }}>
        <LigneGain nom={t('gains.part_fournisseur')} montant={s.sellerNet} />
        <LigneGain nom={t('gains.part_revendeuse')} montant={s.resellerNet} />
        <LigneGain nom={t('gains.livraison')} montant={s.deliveryFee} />
      </View>

      <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: '#EDE6D8', paddingTop: 8 }}>
        {coursier !== null ? (
          <Text style={LIGNE_NOM} numberOfLines={1}>{`${t('gains.coursier')} ${coursier}`}</Text>
        ) : row.livree ? (
          // Delivered: the live board no longer carries this course, and
          // « pas encore connu » would read as doubt about a finished thing.
          null
        ) : (
          <Text style={PETIT}>{t('gains.coursier_inconnu')}</Text>
        )}
      </View>
    </Card>
  );
}

function LigneGain({ nom, montant }: { nom: string; montant: number }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={LIGNE_NOM} numberOfLines={1}>{nom}</Text>
      <Text style={[LIGNE_MONTANT, TNUM]}>{formatF(montant)}</Text>
    </View>
  );
}
