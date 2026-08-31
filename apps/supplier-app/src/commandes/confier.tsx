import { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnGhost, BtnSoft, C07BtnPrimary, Card, Input, Overline } from '../v2/components';
import {
  readStoredCleCoursiers,
  storeCleCoursiers,
  clearStoredCleCoursiers,
  resolveCoursiersService,
} from '../coursiers/service';
import { mintCommandId } from '../offline/commandId';
import {
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

/**
 * REFUS-NOMMÉ (verifier BLOCKER, 2026-08-13) — the way out lives WITH the
 * refusal. The first fix pointed « order_already_has_task » at « Retirer cette
 * course » on the Coursiers tab; for a DELIVERED course that control does not
 * exist — the tab's list is built from board.queued (queued-only) +
 * board.assignments (live only), and a delivered course appears in neither.
 * So this card carries its own two-tap retire — the same destructive-act
 * grammar as the Coursiers zone (question → custody caveat → « Oui, retirer »
 * / « Annuler »), calling the same `/ops/order/retirer` door, which sweeps the
 * order's tasks whatever their state. On `retire` OR `inconnu` (idempotency is
 * by state — a re-run that finds nothing converges) he is told plainly and
 * « Créer la course » stays HIS to press — never an auto-retry.
 */
type Retrait =
  | { kind: 'aucun' }
  | { kind: 'propose' }
  | { kind: 'question' }
  | { kind: 'encours' }
  | { kind: 'retiree' };

export function ConfierCoursier({
  row,
  buyer,
  preuvePhotoRef = null,
  onConfiee,
}: {
  row: PaidOrderRow;
  buyer: LivraisonRow | null;
  /** COURSE-BRIEF — the supplier's readiness proof, travelling to the rider. */
  preuvePhotoRef?: string | null;
  onConfiee?: () => void;
}) {
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
      preuvePhotoRef={preuvePhotoRef}
      {...(onConfiee !== undefined ? { onConfiee } : {})}
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
  preuvePhotoRef,
  onConfiee,
}: {
  service: SeraDispatchPort;
  row: PaidOrderRow;
  buyer: LivraisonRow | null;
  /** COURSE-BRIEF — the readiness proof that travels with the relay. */
  preuvePhotoRef: string | null;
  cle: string | null;
  setCle: (v: string | null) => void;
  etape: Etape;
  setEtape: (e: Etape) => void;
  avis: string | null;
  setAvis: (v: string | null) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onConfiee?: () => void;
}) {
  const [cleDraft, setCleDraft] = useState('');
  /**
   * ⚠ PRET-SECTIONS (founder order 2026-08-09) + CONFIER-AUTO (founder,
   * 2026-08-31: « remove the GPS section and the repere section there »):
   * what the buyer GAVE is read from the prop at render time — never copied
   * into state (the old one-shot seed captured null while her row was still
   * loading, and useState never re-seeds). The GPS and repère sections are
   * GONE from the fold entirely: her confirmed pin and her words ride the
   * brief on their own (see `composer`), with nothing for him to read back
   * or retype. The only typed fallback left is the zone, for an order whose
   * contact carries no quartier.
   */
  const [zoneSaisie, setZoneSaisie] = useState(row.zoneTo);
  /** REFUS-NOMMÉ — the retire road, offered ONLY on `order_already_has_task`. */
  const [retrait, setRetrait] = useState<Retrait>({ kind: 'aucun' });
  /** VILLE (founder ruling 2026-08-09, « for the quartier section add the
   *  ouagadougou »): single-city operation — the quartier she gave carries
   *  the city into the section AND onto the rider's task line, unless she
   *  already named it herself. Revisit the constant when a second city opens. */
  const quartierBrut = buyer?.contact?.quartier.trim() ?? '';
  const zoneDeLaCliente =
    quartierBrut === '' ? '' : /ouaga/i.test(quartierBrut) ? quartierBrut : `${quartierBrut}, Ouagadougou`;
  const repereDeLaCliente = buyer?.contact?.repere.trim() ?? '';
  const zone = zoneDeLaCliente !== '' ? zoneDeLaCliente : zoneSaisie;

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
    // CONFIER-AUTO (founder, 2026-08-31): the fold no longer carries a pin
    // field or a repère field — what the BUYER gave rides the brief on its
    // own. Her confirmed pin (canon v3.11.0: FACULTATIF) rides as {lat, lng},
    // accuracy staying behind (capture metadata, never dispatch truth). The
    // landmark is her TYPED words first (SE0.3: the words lead); when she
    // spoke instead, honest words point the rider at her note; when only her
    // point exists, they say so — canon's Location.landmark is trimmed
    // non-empty, and a fabricated place name is the one thing that must
    // never stand in for it.
    const sienne = buyer?.contact?.pin;
    const point = sienne !== undefined ? { lat: sienne.lat, lng: sienne.lng } : undefined;
    const landmark =
      repereDeLaCliente !== ''
        ? repereDeLaCliente
        : buyer?.contact?.audioRef !== undefined
          ? t('confier.repere_voix')
          : point !== undefined
            ? t('confier.repere_gps')
            : '';
    // No repère, no voice note, no pin: nothing on THIS screen can cure it,
    // so the refusal must say what to do, not « fill each field ».
    if (landmark === '') {
      setAvis(t('confier.sans_repere'));
      return;
    }
    if (zone.trim() === '') {
      setAvis(t('confier.champs_manquants'));
      return;
    }
    setBusy(true);
    setAvis(null);
    // A compose that is actually SENT resets the retire road: its answer —
    // not this screen's memory — decides whether the act is offered again.
    setRetrait({ kind: 'aucun' });
    const start = new Date();
    const end = new Date(start.getTime() + FENETRE_HEURES * 3_600_000);
    const answer = await service.composerTache(
      cle,
      row.orderId,
      {
        ...(point !== undefined ? { pin: point } : {}),
        zone: zone.trim(),
        landmark,
        // CONFIER-ALLEGE (founder report 2026-08-08): canon makes these two
        // optional — an honest absence beats a fake « relais-1 » typed to
        // pass a gate. The buyer's repère is the navigation.
        directions: '',
        maskedRelay: '',
      },
      { start: start.toISOString(), end: end.toISOString() },
      /**
       * COURSE-BRIEF (founder order 2026-08-09): « nowhere to listen the
       * repère audio … it has to carry as well the proof photos ». Both facts
       * are already on this screen — the buyer's voice note and the readiness
       * photo the founder just looked at — and until now neither crossed into
       * Séra. Absent stays absent: a buyer who typed their repère instead of
       * recording it still gets a rider.
       */
      {
        ...(buyer?.contact?.audioRef !== undefined ? { repereAudioRef: buyer.contact.audioRef } : {}),
        ...(preuvePhotoRef !== null ? { preuvePhotoRefs: [preuvePhotoRef] } : {}),
      },
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
      // REFUS-NOMMÉ (founder bug 2026-08-13): `order_already_has_task` is
      // PERMANENT by design — a delivered course's row deliberately stays on
      // Séra's book (COURSE-LIVRÉE), and only the retire door clears it. The
      // sentence names the act, and the act renders BELOW it (see `Retrait`):
      // pointing at the Coursiers tab was a dead end, because that tab's list
      // can never show a delivered course.
      setAvis(
        t(
          answer.reason === 'funding_projection_stale'
            ? 'confier.pas_finance'
            : answer.reason === 'readiness_projection_stale'
              ? 'confier.pas_prete'
              : answer.reason === 'order_already_has_task'
                ? 'confier.course_deja'
                : 'confier.refus_generique',
        ),
      );
      if (answer.reason === 'order_already_has_task') setRetrait({ kind: 'propose' });
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
    // RELAIS-REPRISE (founder 2026-08-09): the relay must be SEEN taking —
    // the screen recharges and the order moves to « En route » at once,
    // instead of this fold quietly keeping its old segment.
    onConfiee?.();
  };

  /**
   * REFUS-NOMMÉ — the confirmed retire. SAME PORT AS THE COURSIERS ZONE
   * (`CoursiersServicePort.retirerCourse`, already contract-certified against
   * `/ops/order/retirer`), same door, same key slot — no second wire client.
   * The command id is MINTED per this app's law (`mintCommandId`, OS CSPRNG,
   * never Math.random); the door requires it for shape only — its idempotency
   * is by state, so `retire` and `inconnu` are the SAME good outcome: nothing
   * remains on the board for this order. Both clear the refusal and leave
   * « Créer la course » pressable — the re-tap is HIS, never an auto-retry
   * (cause and effect stay visible).
   */
  const retirerCourse = async (): Promise<void> => {
    if (busy || cle === null) return;
    const desk = resolveCoursiersService(cle);
    if (desk === null) {
      setAvis(t('confier.injoignable'));
      return;
    }
    setBusy(true);
    setAvis(null);
    setRetrait({ kind: 'encours' });
    const answer = await desk.retirerCourse(row.orderId, mintCommandId());
    setBusy(false);
    if (answer.kind === 'bad_key') {
      clearStoredCleCoursiers();
      setCle(null);
      setRetrait({ kind: 'aucun' });
      setEtape({ kind: 'porte' });
      return;
    }
    if (answer.kind === 'unreachable') {
      // The act stays offered: nothing came back, so nothing changed.
      setAvis(t('confier.injoignable'));
      setRetrait({ kind: 'propose' });
      return;
    }
    if (answer.kind === 'refused') {
      // The door's only named refusal here is `malformed` (a client bug) —
      // the zone's own failure sentence says it without inventing a cause.
      setAvis(t('coursiers.course_echec'));
      setRetrait({ kind: 'propose' });
      return;
    }
    // `retire` or `inconnu` — the board holds nothing for this order now.
    setAvis(null);
    setRetrait({ kind: 'retiree' });
  };

  return (
    <View style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: '#EDE6D8', paddingTop: 12 }}>
      <Text style={TITRE}>{t('confier.titre')}</Text>

      {avis !== null ? (
        <View style={{ marginTop: 10 }}>
          <Banner tone="warn">{avis}</Banner>
        </View>
      ) : null}

      {/* ═══ REFUS-NOMMÉ — the way out, rendered WITH the refusal ═══
          The Coursiers zone's two-tap destructive-act grammar, verbatim in
          shape: whisper control → question + custody caveat (« board yes,
          custody no », said BEFORE the tap — the server cannot see custody) →
          « Oui, retirer » / « Annuler »; in flight the armed question is GONE,
          so nothing can be tapped into silence. */}
      {retrait.kind === 'propose' ? (
        <View style={{ marginTop: 8 }}>
          <BtnGhost label={t('confier.retirer')} onPress={() => setRetrait({ kind: 'question' })} />
        </View>
      ) : retrait.kind === 'question' ? (
        <View style={{ marginTop: 8, gap: 8 }}>
          <Text style={CORPS}>{t('confier.retirer_question')}</Text>
          <Banner tone="warn">{t('confier.retirer_question_colis')}</Banner>
          <BtnGhost label={t('coursiers.course_oui')} onPress={() => void retirerCourse()} />
          <BtnGhost label={t('coursiers.course_annuler')} onPress={() => setRetrait({ kind: 'propose' })} />
        </View>
      ) : retrait.kind === 'encours' ? (
        <Text style={[PETIT, { marginTop: 8 }]}>{t('coursiers.course_encours')}</Text>
      ) : retrait.kind === 'retiree' ? (
        <View style={{ marginTop: 10 }}>
          <Banner tone="success" check>
            {t('confier.retiree')}
          </Banner>
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
          {/* CONFIER-AUTO (founder, 2026-08-31): no GPS section, no repère
              section — what she gave rides the brief by itself (`composer`).
              PRET-SECTIONS still governs what remains: her quartier sits in
              its section read-only; only a field she did NOT give is typed. */}
          {zoneDeLaCliente !== '' ? (
            <View style={{ gap: 8 }}>
              <Overline level="card">{t('confier.zone')}</Overline>
              <Text style={TITRE}>{zoneDeLaCliente}</Text>
            </View>
          ) : (
            <Input label={t('confier.zone')} value={zoneSaisie} onChangeText={setZoneSaisie} />
          )}
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
