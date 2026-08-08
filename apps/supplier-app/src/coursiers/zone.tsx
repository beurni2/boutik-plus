import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnGhost, C07BtnPrimary, Card, Input } from '../v2/components';
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
  oublierCode,
  refuserActe,
  type CoursiersRead,
  type CoursiersUi,
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
      acte: 'mint' | `revoke:${string}`,
      riderId: string,
      appel: (s: CoursiersServicePort) => Promise<{ ok: boolean; code?: string | undefined; badKey?: boolean }>,
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
          r.ok ? { ok: true, riderId, ...(r.code !== undefined ? { code: r.code } : {}) } : { ok: false },
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
   * ⚠ THE ONE-TIME CODE IS THE WHOLE SCREEN — not a card on top of a busy one.
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
          <Text style={TITRE}>{t('coursiers.nouveau_titre')}</Text>
          <Text style={[PETIT, { marginTop: 4 }]}>{ui.nouveau.riderId}</Text>
          <Text style={[CODE, { marginTop: 10 }]}>{ui.nouveau.code}</Text>
          <Text style={[CORPS, { marginTop: 10 }]}>{t('coursiers.nouveau_aide')}</Text>
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
          <Banner tone="warn">{t('coursiers.acte_echoue')}</Banner>
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
                <View style={{ marginTop: 12 }}>
                  <C07BtnPrimary
                    label={t('coursiers.donner')}
                    icon="check"
                    onPress={() => {
                      // No silent early return: `lancer` refuses an act while
                      // one is in flight and SAYS SO (« un seul geste à la
                      // fois »). A button that does nothing without a word is
                      // the confusion this zone already cost the founder once.
                      void lancer('mint', c.riderId, async (s) => {
                        const a = await s.donnerCode(c.riderId);
                        return {
                          ok: a.kind === 'ok',
                          code: a.kind === 'ok' ? a.value : undefined,
                          badKey: a.kind === 'bad_key',
                        };
                      });
                    }}
                  />
                </View>
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
              </Card>
            );
          })
        : null}

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
