import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnGhost, C07BtnPrimary, Card, Input } from '../v2/components';
import { mintCommandId } from '../offline/commandId';
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
import {
  clearStoredCleCoursiers,
  readStoredCleCoursiers,
  resolveCoursiersService,
  storeCleCoursiers,
  type CoursiersServicePort,
} from './service';
import {
  COURSIERS_IDLE,
  acteDemarre,
  acteRegle,
  avisCode,
  avisCodeKey,
  codePillule,
  coursiersVue,
  etatPillule,
  oublierCode,
  refuserActe,
  retraitDepuisAnswer,
  type CoursesRead,
  type CoursiersRead,
  type CoursiersUi,
  retraitCoursierDemande,
  retraitCoursierAnnule,
  retraitCoursierStart,
  motifRefusRetrait,
} from './view';

/**
 * SE-LIVE-4e-B+ — the « Coursiers » zone of the founder's console.
 *
 * FOUNDER ORDER (2026-08-06, standing): « i do not want a separate url for
 * that, put in boutik+'s ops console ». I first built this desk in the Séra
 * dispatch console — a local app he has never run — and he asked twice where
 * it was. This is where it belongs. The REGISTRY does not move: this console is
 * a second client of the logistics Worker's key-gated door, exactly as the
 * Fonds zone is a second client of `protection-service`.
 *
 * THE 5-SECOND TEST for its owner: one question answered first — « qui peut
 * entrer dans Séra ? » Each card names a rider and whether they hold a live
 * code; the one primary act is giving one.
 *
 * SAME DISCIPLINE AS EVERY ZONE (CONSOLE-GT-1): kit components and palette
 * tokens only; the pure decisions live in ./view.ts; the impure substance
 * (service, reads, the key) lives here; every state is designed and TRUE.
 */

const TITRE = role({ f: 'BG', w: 800, s: 17 }, P.ink);
const CORPS = role({ f: 'IS', w: 400, s: 13 }, P.sub);
const NOM = role({ f: 'BG', w: 800, s: 15 }, P.ink);
const PETIT = role({ f: 'IS', w: 400, s: 12 }, P.sub);
/** The one-time code: read at arm's length, or down a phone line. */
const CODE = role({ f: 'BG', w: 800, s: 26 }, P.ink);

export function SZoneCoursiers() {
  const [cle, setCle] = useState<string | null>(() => readStoredCleCoursiers());

  // UNSET ⇒ nothing, never a demo registry: a console showing invented riders
  // would send him minting codes for people who do not exist.
  const base = process.env.EXPO_PUBLIC_SERA_LOGISTICS_BASE;
  if (typeof base !== 'string' || base.trim() === '') {
    return (
      <View style={{ marginTop: 16 }}>
        <Banner tone="info">{t('coursiers.pas_relie')}</Banner>
        <Text style={[CORPS, { marginTop: 8 }]}>{t('coursiers.pas_relie_aide')}</Text>
      </View>
    );
  }

  if (cle === null) {
    return <PorteCoursiers onOuverte={(k) => { storeCleCoursiers(k); setCle(k); }} />;
  }
  return (
    <LivreCoursiers
      cle={cle}
      onCleRefusee={() => {
        clearStoredCleCoursiers();
        setCle(null);
      }}
    />
  );
}

/** Its own door — the Séra ops key is the founder's alone, distinct from the
 *  ops key, key C and the fund key. Typed, never bundled. */
function PorteCoursiers({ onOuverte }: { onOuverte: (cle: string) => void }) {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  return (
    <Card variant="Llg" style={{ marginTop: 16 }}>
      <Text style={TITRE}>{t('coursiers.cle_titre')}</Text>
      <Text style={[CORPS, { marginTop: 6 }]}>{t('coursiers.cle_aide')}</Text>
      <View style={{ marginTop: 16 }}>
        <Input label={t('coursiers.cle_placeholder')} value={draft} onChangeText={setDraft} />
      </View>
      <View style={{ marginTop: 16 }}>
        <C07BtnPrimary
          label={t('coursiers.cle_entrer')}
          icon="check"
          onPress={() => {
            if (trimmed !== '') onOuverte(trimmed);
          }}
        />
      </View>
    </Card>
  );
}

function LivreCoursiers({ cle, onCleRefusee }: { cle: string; onCleRefusee: () => void }) {
  const [read, setRead] = useState<CoursiersRead>({ kind: 'chargement' });
  const [ui, setUi] = useState<CoursiersUi>(COURSIERS_IDLE);
  const [avis, setAvis] = useState<string | null>(null);
  const [nouvelId, setNouvelId] = useState('');
  const [nouveauNom, setNouveauNom] = useState('');
  const [nouveauTel, setNouveauTel] = useState('');

  const charger = useCallback(async (): Promise<void> => {
    const service: CoursiersServicePort | null = resolveCoursiersService(cle);
    if (service === null) {
      setRead({ kind: 'echec' });
      return;
    }
    setRead({ kind: 'chargement' });
    const answer = await service.liste();
    if (answer.kind === 'bad_key') {
      // Cleared on 401, like every other key in this console.
      setRead({ kind: 'cle_refusee' });
      onCleRefusee();
      return;
    }
    setRead(answer.kind === 'ok' ? { kind: 'ok', coursiers: answer.value } : { kind: 'echec' });
  }, [cle, onCleRefusee]);

  useEffect(() => {
    void charger();
  }, [charger]);

  /** One act at a time — and nothing runs while a one-time code is on screen. */
  const lancer = useCallback(
    async (
      acte: 'mint' | `revoke:${string}` | `certify:${string}` | `reveal:${string}` | `retire:${string}`,
      riderId: string,
      appel: (
        s: CoursiersServicePort,
      ) => Promise<{ ok: boolean; code?: string | undefined; revele?: boolean; badKey?: boolean; motif?: string | undefined }>,
    ): Promise<void> => {
      const refus = refuserActe(ui);
      if (refus !== null) {
        setAvis(t(refus));
        return;
      }
      const service = resolveCoursiersService(cle);
      if (service === null) return;
      const started = acteDemarre(ui, acte);
      if (started === null) return;
      setUi(started);
      setAvis(null);
      const r = await appel(service);
      if (r.badKey === true) {
        setUi(COURSIERS_IDLE);
        setRead({ kind: 'cle_refusee' });
        onCleRefusee();
        return;
      }
      setUi((prev) =>
        acteRegle(
          prev,
          acte,
          r.ok
            ? {
                ok: true,
                riderId,
                ...(r.code !== undefined ? { code: r.code } : {}),
                ...(r.revele === true ? { revele: true } : {}),
              }
            : { ok: false, ...(r.motif !== undefined ? { motif: r.motif } : {}) },
        ),
      );
      // The roster reflects the server only AFTER the server answered.
      if (r.ok) await charger();
    },
    [ui, cle, charger, onCleRefusee],
  );

  const vue = coursiersVue(read);
  const roster = read.kind === 'ok' ? read.coursiers : [];

  /**
   * THE ONE-TIME CODE IS THE WHOLE SCREEN — not a card on top of a busy one.
   *
   * FOUNDER REPORT (2026-08-08): « after i generate the code the screen becomes
   * confusing. » He was right, and the cause was mine. The code card used to
   * render ABOVE the live roster, whose « Donner un code » is styled exactly as
   * loud as « C'est noté » — two full-width primary greens on one screen — and
   * every one of those buttons was SILENTLY DEAD, because each `onPress` began
   * with an early return on the blocked flag. A guard that protects the code by
   * making buttons LIE is worse than no guard: he taps, nothing happens, nothing
   * explains why, and the one thing that actually matters — write this down, it
   * never comes back — competes for attention with a row of traps.
   *
   * So the desk steps aside. One primary action per screen, ruthlessly: note the
   * code, tap « C'est noté », and the roster returns. Nothing can be mis-tapped
   * because nothing else is offered — the block is now a fact of the LAYOUT,
   * not a rule the buttons pretend to follow. `refuserActe` keeps the same rule
   * in the pure logic (defence in depth, still tested); the UI simply no longer
   * puts the trap on screen.
   */
  if (ui.nouveau !== null) {
    return (
      <View style={{ marginTop: 16 }}>
        <Text style={TITRE}>{t('coursiers.zone')}</Text>
        <Card variant="Llg" style={{ marginTop: 16 }}>
          {/* CODE-REVU: a REREAD code keeps the same whole-screen treatment
              but its own true sentence — he can come back; a fresh mint
              stays « il ne s'affiche qu'une fois ». */}
          <Text style={TITRE}>{t(ui.nouveau.revele === true ? 'coursiers.revu_titre' : 'coursiers.nouveau_titre')}</Text>
          <Text style={[PETIT, { marginTop: 4 }]}>{ui.nouveau.riderId}</Text>
          <Text style={[CODE, { marginTop: 10 }]}>{ui.nouveau.code}</Text>
          <Text style={[CORPS, { marginTop: 10 }]}>{t(ui.nouveau.revele === true ? 'coursiers.revu_aide' : 'coursiers.nouveau_aide')}</Text>
          <View style={{ marginTop: 16 }}>
            <C07BtnPrimary
              label={t('coursiers.note')}
              icon="check"
              onPress={() => {
                setUi((prev) => oublierCode(prev));
                setAvis(null);
              }}
            />
          </View>
        </Card>
      </View>
    );
  }

  return (
    <View style={{ marginTop: 16 }}>
      <Text style={TITRE}>{t('coursiers.zone')}</Text>
      <Text style={[CORPS, { marginTop: 6 }]}>{t('coursiers.intro')}</Text>

      {avis !== null ? (
        <View style={{ marginTop: 12 }}>
          <Banner tone="warn">{avis}</Banner>
        </View>
      ) : null}
      {ui.echec !== null ? (
        <View style={{ marginTop: 12 }}>
          {/* A failed REREAD names itself (« pas de réponse, réessayez ») —
              the generic sentence would leave the founder guessing whether
              the code itself is gone (CODE-REVU verifier MINOR-5). */}
          <Banner tone="warn">
            {t(ui.echec.startsWith('reveal:') ? 'coursiers.voir_echec' : 'coursiers.acte_echoue')}
          </Banner>
        </View>
      ) : null}

      {vue !== null && vue.kind !== 'liste' ? (
        <Card variant="Llg" style={{ marginTop: 16 }}>
          <Text style={CORPS}>{t(vue.message)}</Text>
          {vue.kind === 'echec' ? (
            <View style={{ marginTop: 12 }}>
              <BtnGhost label={t('coursiers.reessayer')} onPress={() => void charger()} />
            </View>
          ) : null}
          {vue.kind === 'vide' ? (
            <Text style={[PETIT, { marginTop: 6 }]}>{t('coursiers.vide_aide')}</Text>
          ) : null}
        </Card>
      ) : null}

      {vue !== null && vue.kind === 'liste'
        ? vue.coursiers.map((c) => {
            const pill = codePillule(c);
            const etat = etatPillule(c);
            /**
             * ONE PRIMARY PER CARD, IN PROCESS ORDER (founder reports
             * 2026-08-08): « when I tap donner un code and got the code it
             * comes back again donner un code » — a full-green « Donner un
             * code » over a rider whose code is already ACTIVE reads as « it
             * did not work », and tapping it destroys the live code. And his
             * rider could never take a course because certification had NO
             * button anywhere. So: not-certified → « Certifier » is the one
             * primary; certified without a code → « Donner un code »; a live
             * code → both code acts whisper, and the loud slot stays empty.
             */
            const mint = (): void => {
              // No silent early return: `lancer` refuses an act while one is
              // in flight and SAYS SO (« un seul geste à la fois »).
              void lancer('mint', c.riderId, async (s) => {
                const a = await s.donnerCode(c.riderId);
                return {
                  ok: a.kind === 'ok',
                  code: a.kind === 'ok' ? a.value : undefined,
                  badKey: a.kind === 'bad_key',
                };
              });
            };
            return (
              <Card key={c.riderId} variant="Llg" style={{ marginTop: 12 }}>
                <Text style={NOM}>{c.displayName}</Text>
                <Text style={[PETIT, { marginTop: 2 }]}>{c.riderId}</Text>
                <View style={{ marginTop: 8 }}>
                  <Banner tone={pill.ton === 'ok' ? 'success' : 'info'}>
                    {c.mintedAt !== undefined
                      ? `${t(pill.label)} · ${t('coursiers.depuis')} ${c.mintedAt.slice(0, 10)}`
                      : t(pill.label)}
                  </Banner>
                </View>
                <View style={{ marginTop: 8 }}>
                  <Banner tone={etat.ton === 'ok' ? 'success' : 'info'}>{t(etat.label)}</Banner>
                </View>
                {!c.certified ? (
                  <View style={{ marginTop: 12 }}>
                    <C07BtnPrimary
                      label={t('coursiers.certifier')}
                      icon="check"
                      onPress={() => {
                        void lancer(`certify:${c.riderId}`, c.riderId, async (s) => {
                          const a = await s.certifier(c.riderId);
                          return { ok: a.kind === 'ok', badKey: a.kind === 'bad_key' };
                        });
                      }}
                    />
                  </View>
                ) : null}
                {c.hasCode ? (
                  <>
                    {/* CODE-REVU (founder 2026-08-09): tap and SEE AGAIN the
                        code already given. Only codes minted after the ruling
                        can answer; older ones say so in one honest line. */}
                    {c.revelable ? (
                      <View style={{ marginTop: 10 }}>
                        <BtnGhost
                          label={t('coursiers.voir')}
                          onPress={() => {
                            void lancer(`reveal:${c.riderId}`, c.riderId, async (s) => {
                              const a = await s.voirCode(c.riderId);
                              if (a.kind === 'refused' && a.reason === 'code_anterieur') {
                                // Stale list: the roster refresh below hides
                                // the button; the sentence says why.
                                setAvis(t('coursiers.code_anterieur'));
                                return { ok: true, badKey: false };
                              }
                              return {
                                ok: a.kind === 'ok',
                                code: a.kind === 'ok' ? a.value : undefined,
                                revele: true,
                                badKey: a.kind === 'bad_key',
                              };
                            });
                          }}
                        />
                      </View>
                    ) : (
                      <Text style={[PETIT, { marginTop: 10 }]}>{t('coursiers.code_anterieur')}</Text>
                    )}
                    <Text style={[PETIT, { marginTop: 10 }]}>{t('coursiers.remplace_note')}</Text>
                    <View style={{ marginTop: 8 }}>
                      <BtnGhost label={t('coursiers.donner_nouveau')} onPress={mint} />
                    </View>
                  </>
                ) : (
                  <View style={{ marginTop: 12 }}>
                    {c.certified ? (
                      <C07BtnPrimary label={t('coursiers.donner')} icon="check" onPress={mint} />
                    ) : (
                      <BtnGhost label={t('coursiers.donner')} onPress={mint} />
                    )}
                  </View>
                )}
                {c.hasCode ? (
                  <View style={{ marginTop: 8 }}>
                    <BtnGhost
                      label={t('coursiers.retirer')}
                      onPress={() => {
                        void lancer(`revoke:${c.riderId}`, c.riderId, async (s) => {
                          const a = await s.retirerCode(c.riderId);
                          return { ok: a.kind === 'ok', badKey: a.kind === 'bad_key' };
                        });
                      }}
                    />
                  </View>
                ) : null}

                {/* ⚠ RETIRER LE COURSIER — off the roster, not just locked out
                    Founder, 2026-08-12. The SECOND destructive act on this row and
                    the heavier one: « Retirer le code » above keeps the rider and
                    kills their key; this erases the row and the key with it. Same
                    two-tap grammar as the Commandes retire, deliberately — a
                    destructive control is the last place to grow a second dialect.
                    The refusal is NAMED on screen: a rider carrying a parcel is
                    told to end the course, never just « ça n'a pas marché ». */}
                {ui.demandeRetrait === c.riderId ? (
                  <View style={{ marginTop: 8, gap: 8 }}>
                    <Text style={CORPS}>{t('coursiers.retrait_question')}</Text>
                    <BtnGhost
                      label={t('coursiers.retrait_oui')}
                      onPress={() => {
                        const started = retraitCoursierStart(ui, c.riderId);
                        if (started === null) return void 0;
                        void lancer(`retire:${c.riderId}`, c.riderId, async (s) => {
                          const a = await s.retirerCoursier(c.riderId);
                          return {
                            ok: a.kind === 'ok',
                            badKey: a.kind === 'bad_key',
                            ...(a.kind === 'refused' ? { motif: a.reason } : {}),
                          };
                        });
                      }}
                    />
                    <BtnGhost
                      label={t('coursiers.retrait_annuler')}
                      onPress={() => setUi(retraitCoursierAnnule(ui))}
                    />
                  </View>
                ) : (
                  <View style={{ marginTop: 8 }}>
                    <BtnGhost
                      label={t('coursiers.retrait_bouton')}
                      onPress={() => {
                        const asked = retraitCoursierDemande(ui, c.riderId);
                        if (asked === null) {
                          const refus = refuserActe(ui);
                          if (refus !== null) setAvis(t(refus));
                          return void 0;
                        }
                        setUi(asked);
                      }}
                    />
                  </View>
                )}
                {ui.echec === `retire:${c.riderId}` ? (
                  <Text style={[PETIT, { marginTop: 6 }]}>
                    {t(motifRefusRetrait(ui.motifRetrait ?? ''))}
                  </Text>
                ) : null}
              </Card>
            );
          })
        : null}

      {/* ── PURGE-ESSAI-COURSES — le tableau Séra, et de quoi le vider ──── */}
      <CoursesDuTableau cle={cle} onCleRefusee={onCleRefusee} />

      {/* ── inscrire ────────────────────────────────────────────────────── */}
      <Card variant="Llg" style={{ marginTop: 16 }}>
        <Text style={TITRE}>{t('coursiers.inscrire_titre')}</Text>
        <View style={{ marginTop: 12 }}>
          <Input label={t('coursiers.champ_id')} value={nouvelId} onChangeText={setNouvelId} />
        </View>
        <View style={{ marginTop: 12 }}>
          <Input label={t('coursiers.champ_nom')} value={nouveauNom} onChangeText={setNouveauNom} />
        </View>
        <View style={{ marginTop: 12 }}>
          <Input label={t('coursiers.champ_tel')} value={nouveauTel} onChangeText={setNouveauTel} />
        </View>
        {/* The warning follows what he types, BEFORE the tap — « this rider
            already has a code and the new one kills it now » is a fact he needs
            first, not a refusal afterwards. */}
        {nouvelId.trim() !== '' ? (
          <Text style={[CORPS, { marginTop: 10 }]}>{t(avisCodeKey(avisCode(roster, nouvelId)))}</Text>
        ) : null}
        <View style={{ marginTop: 16 }}>
          <C07BtnPrimary
            label={t('coursiers.inscrire')}
            icon="check"
            onPress={() => {
              const riderId = nouvelId.trim();
              const displayName = nouveauNom.trim();
              const phoneAlias = nouveauTel.trim();
              if (riderId === '' || displayName === '' || phoneAlias === '') return;
              void lancer('mint', riderId, async (s) => {
                const reg = await s.inscrire({ riderId, displayName, phoneAlias });
                if (reg.kind === 'bad_key') return { ok: false, badKey: true };
                if (reg.kind === 'unreachable') return { ok: false };
                // `already_registered` is not a failure to mint — fall through
                // and give the existing rider a code, which is what he came for.
                const a = await s.donnerCode(riderId);
                // Cleared ONLY on a code that actually came back: a form still
                // holding the name he just registered reads as « it did not
                // work » and invites a second submit — which would destroy the
                // code he is holding. A failure keeps what he typed.
                if (a.kind === 'ok') {
                  setNouvelId('');
                  setNouveauNom('');
                  setNouveauTel('');
                }
                return {
                  ok: a.kind === 'ok',
                  code: a.kind === 'ok' ? a.value : undefined,
                  badKey: a.kind === 'bad_key',
                };
              });
            }}
          />
        </View>
      </Card>
    </View>
  );
}

/**
 * ═══ PURGE-ESSAI-COURSES — the Séra board, and how he empties it ═══
 *
 * Founder ruling (2026-08-10): « Board yes, custody no » — the test courses
 * leave the dispatch board; the custody ledger stays (append-only proof, on
 * no console). The retire door lives in `logistics-service`; this desk is a
 * second client of the SAME key-gated door it already opens for the roster.
 *
 * WHY IT IS HERE AND NOT IN SÉRA'S OWN CONSOLE: that console has no deploy
 * workflow — built and browser-tested in CI, published nowhere — so a button
 * there had no screen to appear on. He chose this desk. No authority moves:
 * logistics remains the only book that owns a course.
 *
 * ITS OWN READ, DELIBERATELY: the roster read beside it must not be delayed,
 * blanked or failed by a board that is slow. Each desk answers for itself.
 */
function CoursesDuTableau({ cle, onCleRefusee }: { cle: string; onCleRefusee: () => void }) {
  const [read, setRead] = useState<CoursesRead>({ kind: 'chargement' });
  const [ui, setUi] = useState<RetraitUi>(RETRAIT_IDLE);

  const charger = useCallback(async (): Promise<void> => {
    const service = resolveCoursiersService(cle);
    if (service === null) {
      setRead({ kind: 'echec' });
      return;
    }
    const answer = await service.courses();
    if (answer.kind === 'bad_key') {
      onCleRefusee();
      return;
    }
    setRead(answer.kind === 'ok' ? { kind: 'ok', courses: answer.value } : { kind: 'echec' });
  }, [cle, onCleRefusee]);

  useEffect(() => {
    void charger();
  }, [charger]);

  /** ONE named call, then the BOARD is asked again — never this screen's hope
   *  that a row is gone. */
  const retirer = async (orderId: string): Promise<'ok' | 'bad_key' | 'echec'> => {
    const service = resolveCoursiersService(cle);
    if (service === null) return 'echec';
    const answer = await service.retirerCourse(orderId, mintCommandId());
    const settled = retraitSettled(orderId, retraitDepuisAnswer(answer));
    setUi(settled.ui);
    if (settled.then === 'refresh') return 'ok';
    return settled.then === 'bad_key' ? 'bad_key' : 'echec';
  };

  if (read.kind === 'chargement') {
    return (
      <Card variant="Llg" style={{ marginTop: 16 }}>
        <Text style={TITRE}>{t('coursiers.courses_titre')}</Text>
        <Text style={[CORPS, { marginTop: 8 }]}>{t('coursiers.courses_chargement')}</Text>
      </Card>
    );
  }
  if (read.kind === 'echec') {
    return (
      <Card variant="Llg" style={{ marginTop: 16 }}>
        <Text style={TITRE}>{t('coursiers.courses_titre')}</Text>
        <Text style={[CORPS, { marginTop: 8 }]}>{t('coursiers.courses_echec')}</Text>
        <View style={{ marginTop: 10 }}>
          <BtnGhost label={t('coursiers.reessayer')} onPress={() => { void charger(); }} />
        </View>
      </Card>
    );
  }

  const sweep = ui.sweep;
  return (
    <Card variant="Llg" style={{ marginTop: 16 }}>
      <Text style={TITRE}>{t('coursiers.courses_titre')}</Text>
      {read.courses.length === 0 ? (
        <Text style={[CORPS, { marginTop: 8 }]}>{t('coursiers.courses_vide')}</Text>
      ) : (
        <>
          {read.courses.map((c) => (
            <View key={c.orderId} style={{ marginTop: 14, borderTopWidth: 1, borderTopColor: '#EDE6D8', paddingTop: 12 }}>
              <Text style={[CORPS, { marginTop: 0 }]} numberOfLines={1}>{c.orderId}</Text>
              <Text style={[PETIT, { marginTop: 2 }]}>
                {c.confiee
                  ? t('coursiers.course_confiee').replace('{n}', c.coursier ?? '')
                  : t('coursiers.course_attente')}
              </Text>
              {ui.busy === c.orderId ? (
                <Text style={[PETIT, { marginTop: 8 }]}>{t('coursiers.course_encours')}</Text>
              ) : ui.demande === c.orderId ? (
                <View style={{ marginTop: 8, gap: 8 }}>
                  <Text style={CORPS}>{t('coursiers.course_question')}</Text>
                  {/* A CARRIED COURSE IS THE DANGEROUS ONE — say it here, at
                      the moment of the decision, not only in a journal. */}
                  {c.confiee ? (
                    <Banner tone="warn">{t('coursiers.course_question_confiee')}</Banner>
                  ) : null}
                  <BtnGhost
                    label={t('coursiers.course_oui')}
                    onPress={() => {
                      const started = retraitStart(ui, c.orderId);
                      if (started === null) return void 0;
                      setUi(started);
                      void retirer(c.orderId).then((r) => {
                        if (r === 'bad_key') onCleRefusee();
                        else if (r === 'ok') void charger();
                      });
                    }}
                  />
                  <BtnGhost label={t('coursiers.course_annuler')} onPress={() => setUi(retraitAnnule(ui))} />
                </View>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <BtnGhost
                    label={t('coursiers.course_retirer')}
                    onPress={() => {
                      const asked = retraitDemande(ui, c.orderId);
                      if (asked === null) return void 0;
                      setUi(asked);
                    }}
                  />
                </View>
              )}
              {ui.echec === c.orderId ? (
                <Text style={[PETIT, { marginTop: 6 }]}>{t('coursiers.course_echec')}</Text>
              ) : null}
            </View>
          ))}

          {/* The sweep, under the list: one question for the set, the ids it
              named carried inside it, one call per course. */}
          <View style={{ marginTop: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EDE6D8', gap: 8 }}>
            {sweep.kind === 'encours' ? (
              <Text style={PETIT}>
                {t('coursiers.courses_balayage_encours')
                  .replace('{n}', String(sweep.faits))
                  .replace('{t}', String(sweep.total))}
              </Text>
            ) : sweep.kind === 'demande' ? (
              <>
                <Text style={CORPS}>
                  {t('coursiers.courses_balayage_question').replace('{n}', String(sweep.orderIds.length))}
                </Text>
                <BtnGhost
                  label={t('coursiers.courses_balayage_oui')}
                  onPress={() => {
                    const started = sweepStart(ui);
                    if (started === null) return void 0;
                    setUi(started.ui);
                    void (async () => {
                      let vivant = started.ui;
                      let faits = 0;
                      let echecs = 0;
                      let cleRefusee = false;
                      for (const orderId of started.orderIds) {
                        const r = await retirer(orderId);
                        if (r === 'ok') faits += 1;
                        else {
                          echecs += 1;
                          if (r === 'bad_key') cleRefusee = true;
                        }
                        vivant = sweepAvance(vivant);
                        setUi(vivant);
                        if (cleRefusee) break;
                      }
                      setUi(sweepFini(vivant, faits, echecs));
                      if (cleRefusee) onCleRefusee();
                      else void charger();
                    })();
                  }}
                />
                <BtnGhost label={t('coursiers.course_annuler')} onPress={() => setUi(sweepAnnule(ui))} />
              </>
            ) : sweep.kind === 'fini' ? (
              <Text style={PETIT}>
                {sweep.echecs === 0
                  ? t('coursiers.courses_balayage_fini').replace('{n}', String(sweep.faits))
                  : t('coursiers.courses_balayage_reste')
                      .replace('{n}', String(sweep.faits))
                      .replace('{e}', String(sweep.echecs))}
              </Text>
            ) : (
              <BtnGhost
                label={t('coursiers.courses_balayage')}
                onPress={() => {
                  const asked = sweepDemande(ui, read.courses.map((c) => c.orderId));
                  if (asked === null) return void 0;
                  setUi(asked);
                }}
              />
            )}
          </View>
        </>
      )}
    </Card>
  );
}
