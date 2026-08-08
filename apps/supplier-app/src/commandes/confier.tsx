import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnSoft, C07BtnPrimary, Card, Input } from '../v2/components';
import { readStoredCleCoursiers, storeCleCoursiers, clearStoredCleCoursiers } from '../coursiers/service';
import {
  lirePin,
  resolveSeraDispatch,
  type BoardSera,
  type SeraDispatchPort,
} from './sera-service';
import type { LivraisonRow } from '../operations/dispatch-service';
import type { PaidOrderRow } from '../operations/service';

/**
 * ═══ RB-2 — « CONFIER À UN COURSIER », the founder's dispatch act ═══
 *
 * The whole road on one card, honest at every step:
 *
 *   1. THE TASK. Séra fabricates nothing (his ruling, SE-LIVE-2c option 1):
 *      the founder composes the delivery task himself — GPS pin pasted from
 *      his maps app, zone and repère prefilled from what the BUYER typed.
 *      CONFIER-ALLEGE (founder report 2026-08-08): directions and relay id
 *      are canon-optional and were pure friction here — the form stopped
 *      asking; the worker receives honest '' for both. Séra's admission gate
 *      still governs his own hand: unfunded or unprepared refuses WITH ITS
 *      REASON, said in plain French here, never flattened into « échec ».
 *   2. THE RIDER. Only riders Séra itself calls free (`assignable`) are
 *      offered — an off-shift or loaded rider is never a button.
 *   3. THE HANDOVER. On assign, the rider's own Séra app carries the course;
 *      this card says exactly that and stops. Custody is Séra's from here.
 *
 * The Séra key is the SAME one the « Coursiers » zone types — same slot,
 * typed once, cleared on refusal. The window offered is visible before the
 * tap: aujourd'hui, six heures — his act, stated, never hidden.
 */

const TITRE = role({ f: 'BG', w: 800, s: 15 }, P.ink);
const CORPS = role({ f: 'IS', w: 400, s: 13 }, P.sub);
const PETIT = role({ f: 'IS', w: 400, s: 12 }, P.sub);

const FENETRE_HEURES = 6;

type Etape =
  | { kind: 'porte' }
  | { kind: 'chargement' }
  | { kind: 'echec' }
  | { kind: 'composer' }
  | { kind: 'choisir'; taskId: string; board: BoardSera }
  | { kind: 'deja' }
  | { kind: 'confiee'; nom: string };

export function ConfierCoursier({ row, buyer }: { row: PaidOrderRow; buyer: LivraisonRow | null }) {
  const service = useMemo(() => resolveSeraDispatch(), []);
  const [cle, setCle] = useState<string | null>(() => readStoredCleCoursiers());
  const [etape, setEtape] = useState<Etape>(cle === null ? { kind: 'porte' } : { kind: 'chargement' });
  const [avis, setAvis] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (service === null) {
    return (
      <View style={{ marginTop: 12 }}>
        <Banner tone="info">{t('confier.pas_relie')}</Banner>
      </View>
    );
  }
  return (
    <ConfierAvecService
      service={service}
      row={row}
      buyer={buyer}
      cle={cle}
      setCle={setCle}
      etape={etape}
      setEtape={setEtape}
      avis={avis}
      setAvis={setAvis}
      busy={busy}
      setBusy={setBusy}
    />
  );
}

function ConfierAvecService({
  service,
  row,
  buyer,
  cle,
  setCle,
  etape,
  setEtape,
  avis,
  setAvis,
  busy,
  setBusy,
}: {
  service: SeraDispatchPort;
  row: PaidOrderRow;
  buyer: LivraisonRow | null;
  cle: string | null;
  setCle: (v: string | null) => void;
  etape: Etape;
  setEtape: (e: Etape) => void;
  avis: string | null;
  setAvis: (v: string | null) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
}) {
  const [cleDraft, setCleDraft] = useState('');
  const [pin, setPin] = useState('');
  const [zone, setZone] = useState(buyer?.contact?.quartier ?? row.zoneTo);
  const [repere, setRepere] = useState(buyer?.contact?.repere ?? '');

  const charger = useCallback(async (): Promise<void> => {
    if (cle === null) return;
    setEtape({ kind: 'chargement' });
    const answer = await service.board(cle);
    if (answer.kind === 'bad_key') {
      clearStoredCleCoursiers();
      setCle(null);
      setEtape({ kind: 'porte' });
      return;
    }
    if (answer.kind !== 'ok') {
      setEtape({ kind: 'echec' });
      return;
    }
    const tache = answer.value.queued.find((q) => q.orderId === row.orderId);
    if (tache !== undefined) setEtape({ kind: 'choisir', taskId: tache.taskId, board: answer.value });
    else setEtape({ kind: 'composer' });
  }, [service, cle, row.orderId, setCle, setEtape]);

  useEffect(() => {
    if (cle !== null && (etape.kind === 'porte' || etape.kind === 'chargement')) void charger();
    // `charger` identity covers cle/orderId; etape.kind deliberately absent —
    // this effect runs the FIRST load only, not on every step change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, charger]);

  const composer = async (): Promise<void> => {
    if (busy || cle === null) return;
    // Canon v3.11.0 (founder ruling 2026-08-08): the pin is FACULTATIF. Blank
    // means none — the rider navigates by the repère. Typed but unreadable
    // still refuses: a half-pasted coordinate must never reach a rider.
    const point = pin.trim() === '' ? undefined : lirePin(pin);
    if (point === null) {
      setAvis(t('confier.pin_invalide'));
      return;
    }
    if (zone.trim() === '' || repere.trim() === '') {
      setAvis(t('confier.champs_manquants'));
      return;
    }
    setBusy(true);
    setAvis(null);
    const start = new Date();
    const end = new Date(start.getTime() + FENETRE_HEURES * 3_600_000);
    const answer = await service.composerTache(
      cle,
      row.orderId,
      {
        ...(point !== undefined ? { pin: point } : {}),
        zone: zone.trim(),
        landmark: repere.trim(),
        // CONFIER-ALLEGE (founder report 2026-08-08): canon makes these two
        // optional — an honest absence beats a fake « relais-1 » typed to
        // pass a gate. The buyer's repère is the navigation.
        directions: '',
        maskedRelay: '',
      },
      { start: start.toISOString(), end: end.toISOString() },
    );
    setBusy(false);
    if (answer.kind === 'bad_key') {
      clearStoredCleCoursiers();
      setCle(null);
      setEtape({ kind: 'porte' });
      return;
    }
    if (answer.kind === 'unreachable') {
      setAvis(t('confier.injoignable'));
      return;
    }
    if (answer.kind === 'refused') {
      // Séra's gate refusing THE FOUNDER is a fact with a name — the two
      // projection reasons mean « the facts have not arrived yet », which an
      // at-least-once outbox usually repairs within a minute.
      setAvis(
        t(
          answer.reason === 'funding_projection_stale'
            ? 'confier.pas_finance'
            : answer.reason === 'readiness_projection_stale'
              ? 'confier.pas_prete'
              : 'confier.refus_generique',
        ),
      );
      return;
    }
    await charger();
  };

  const confier = async (taskId: string, riderId: string, nom: string): Promise<void> => {
    if (busy || cle === null) return;
    setBusy(true);
    setAvis(null);
    const answer = await service.confier(cle, taskId, riderId);
    setBusy(false);
    if (answer.kind === 'bad_key') {
      clearStoredCleCoursiers();
      setCle(null);
      setEtape({ kind: 'porte' });
      return;
    }
    if (answer.kind === 'unreachable') {
      setAvis(t('confier.injoignable'));
      return;
    }
    if (answer.kind === 'refused') {
      // 409: the lease moved under him (rider went off shift, task taken).
      setAvis(t('confier.confier_refuse'));
      await charger();
      return;
    }
    setEtape({ kind: 'confiee', nom });
  };

  return (
    <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: '#EDE6D8', paddingTop: 12 }}>
      <Text style={TITRE}>{t('confier.titre')}</Text>

      {avis !== null ? (
        <View style={{ marginTop: 10 }}>
          <Banner tone="warn">{avis}</Banner>
        </View>
      ) : null}

      {etape.kind === 'porte' ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          <Text style={CORPS}>{t('confier.cle_aide')}</Text>
          <Input label={t('coursiers.cle_placeholder')} value={cleDraft} onChangeText={setCleDraft} />
          <BtnSoft
            label={t('commandes.cle_entrer')}
            onPress={() => {
              if (cleDraft.trim() === '') return void 0;
              storeCleCoursiers(cleDraft.trim());
              setCle(cleDraft.trim());
              setEtape({ kind: 'chargement' });
            }}
          />
        </View>
      ) : etape.kind === 'chargement' ? (
        <Text style={[CORPS, { marginTop: 10 }]}>{t('commandes.chargement')}</Text>
      ) : etape.kind === 'echec' ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          <Text style={CORPS}>{t('commandes.echec')}</Text>
          <BtnSoft label={t('commandes.reessayer')} onPress={() => void charger()} />
        </View>
      ) : etape.kind === 'composer' ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          <Text style={CORPS}>{t('confier.composer_aide')}</Text>
          <Input label={t('confier.pin')} value={pin} onChangeText={setPin} />
          <Input label={t('confier.zone')} value={zone} onChangeText={setZone} />
          <Input label={t('confier.repere')} value={repere} onChangeText={setRepere} />
          <Text style={PETIT}>{t('confier.fenetre')}</Text>
          <C07BtnPrimary label={t('confier.creer')} icon="check" onPress={() => void composer()} />
        </View>
      ) : etape.kind === 'choisir' ? (
        <View style={{ marginTop: 10, gap: 8 }}>
          <Text style={CORPS}>{t('confier.choisir_aide')}</Text>
          {etape.board.riders.filter((r) => r.assignable).length === 0 ? (
            <>
              <Banner tone="info">{t('confier.aucun_libre')}</Banner>
              {/* FOUNDER REPORT (2026-08-08): he registered a rider, saw this
                  banner, tapped Réessayer, and NOTHING on any screen said the
                  rider was uncertified and off-shift. The board has always
                  carried the reason — now each rider is named with the one
                  step that unblocks them, so the retry has a visible target. */}
              {etape.board.riders.map((r) => (
                <Text key={r.riderId} style={PETIT}>
                  {`${r.displayName} : ${t(
                    !r.certified
                      ? 'confier.blocage_certif'
                      : !r.enService
                        ? 'confier.blocage_service'
                        : 'confier.blocage_occupe',
                  )}`}
                </Text>
              ))}
            </>
          ) : (
            etape.board.riders
              .filter((r) => r.assignable)
              .map((r) => (
                <C07BtnPrimary
                  key={r.riderId}
                  label={`${t('confier.confier_a')} ${r.displayName}`}
                  icon="check"
                  onPress={() => void confier(etape.taskId, r.riderId, r.displayName)}
                />
              ))
          )}
          <BtnSoft label={t('commandes.reessayer')} onPress={() => void charger()} />
        </View>
      ) : etape.kind === 'confiee' ? (
        <Card variant="Llg" style={{ marginTop: 10 }}>
          <Banner tone="success" check>
            {`${t('confier.confiee')} ${etape.nom}. ${t('confier.confiee_suite')}`}
          </Banner>
        </Card>
      ) : (
        <View style={{ marginTop: 10 }}>
          <Banner tone="info">{t('confier.deja')}</Banner>
        </View>
      )}
    </View>
  );
}
