import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnGhost, BtnSoft, C07BtnPrimary, Card, Input } from '../v2/components';
import { mintCommandId } from '../offline/commandId';
import { formatF } from '../v2/money';
import { rafraichirQuandVisible } from '../ui/rafraichir';
import { clearStoredCleCoursiers, readStoredCleCoursiers } from '../coursiers/service';
import { resolveColisPerdu, type ColisEnMain, type Montant, type ReponseColis } from './service';
import { aRenvoyer, montantTape, phraseReponse } from './view';

/**
 * ═══ COLIS-PERDU — « Colis perdu en route », at the top of Opérations ═══
 *
 * Founder ruling 2026-11-27: the button sits in Opérations, next to the SOS
 * alerts. Mounted under the masthead across every zone, so a zone switch
 * never drops a declaration in flight.
 *
 * Four steps, one primary action each: choose the parcel a rider holds → one
 * empty amount per order → the confirmation that says it is final and what
 * happens next (the command id is minted here, once) → Séra's answer by name.
 * Only « Réessayer » after an unknown outcome sends again, with the SAME id,
 * so a retry can never open a second claim.
 */

const TITRE = role({ f: 'BG', w: 800, s: 17 }, P.ink);
const CORPS = role({ f: 'IS', w: 400, s: 13 }, P.sub);
const NOM = role({ f: 'BG', w: 800, s: 15 }, P.ink);

/** The list re-reads at the console's own pace while no declaration is open. */
const RELECTURE_MS = 60_000;

type Lecture =
  | { kind: 'chargement' }
  | { kind: 'ok'; colis: readonly ColisEnMain[] }
  | { kind: 'echec' }
  | { kind: 'sans_cle' };

type Acte =
  | { etape: 'montants'; colis: ColisEnMain; saisies: Readonly<Record<string, string>> }
  | { etape: 'confirmer'; colis: ColisEnMain; montants: readonly Montant[] }
  | { etape: 'envoi'; colis: ColisEnMain; montants: readonly Montant[]; commandId: string }
  | { etape: 'issue'; colis: ColisEnMain; montants: readonly Montant[]; commandId: string; reponse: ReponseColis };

const phraseColis = (c: ColisEnMain): string =>
  c.commandes.length > 1
    ? t('perdu.course_colis').replace('{n}', String(c.commandes.length)).replace('{nom}', c.nom)
    : t('perdu.course').replace('{ref}', c.orderId).replace('{nom}', c.nom);

export function SColisPerdu() {
  const base = process.env.EXPO_PUBLIC_SERA_LOGISTICS_BASE;
  const relie = typeof base === 'string' && base.trim() !== '';
  const [lecture, setLecture] = useState<Lecture>({ kind: 'chargement' });
  const [acte, setActe] = useState<Acte | null>(null);
  const acteOuvert = useRef(false);
  const monte = useRef(true);
  acteOuvert.current = acte !== null;

  const charger = useCallback(async (): Promise<void> => {
    const k = readStoredCleCoursiers();
    const port = k === null ? null : resolveColisPerdu(k);
    if (k === null || port === null) {
      setLecture({ kind: 'sans_cle' });
      return;
    }
    const lu = await port.lire();
    if (!monte.current) return;
    if (lu.kind === 'bad_key') {
      // Cleared like every Séra key in this console, only if it is still the one refused.
      if (readStoredCleCoursiers() === k) clearStoredCleCoursiers();
      setLecture({ kind: 'sans_cle' });
      return;
    }
    setLecture(lu.kind === 'ok' ? { kind: 'ok', colis: lu.colis } : { kind: 'echec' });
  }, []);

  useEffect(() => {
    monte.current = true;
    if (!relie) return () => { monte.current = false; };
    void charger();
    const arreter = rafraichirQuandVisible(() => {
      if (!acteOuvert.current) void charger();
    }, RELECTURE_MS);
    return () => {
      monte.current = false;
      arreter();
    };
  }, [charger, relie]);

  const envoyer = useCallback(async (colis: ColisEnMain, montants: readonly Montant[], commandId: string): Promise<void> => {
    setActe({ etape: 'envoi', colis, montants, commandId });
    const k = readStoredCleCoursiers();
    const port = k === null ? null : resolveColisPerdu(k);
    const reponse: ReponseColis = port === null ? { kind: 'bad_key' } : await port.declarer(commandId, colis.orderId, montants);
    if (!monte.current) return;
    if (reponse.kind === 'bad_key' && k !== null && readStoredCleCoursiers() === k) clearStoredCleCoursiers();
    setActe({ etape: 'issue', colis, montants, commandId, reponse });
  }, []);

  const fermer = useCallback((): void => {
    setActe(null);
    void charger();
  }, [charger]);

  if (!relie) {
    return (
      <Cadre>
        <Banner tone="warn">{t('perdu.pas_relie')}</Banner>
      </Cadre>
    );
  }

  if (acte !== null) {
    return <Cadre><Etape acte={acte} onActe={setActe} onEnvoyer={envoyer} onFermer={fermer} /></Cadre>;
  }

  return (
    <Cadre>
      {lecture.kind === 'chargement' ? <Text style={CORPS}>{t('perdu.chargement')}</Text> : null}
      {lecture.kind === 'sans_cle' ? (
        <>
          <Banner tone="warn">{t('perdu.sans_cle')}</Banner>
          <BtnGhost label={t('perdu.reessayer')} onPress={() => { void charger(); }} />
        </>
      ) : null}
      {lecture.kind === 'echec' ? (
        <>
          <Banner tone="warn">{t('perdu.echec_lecture')}</Banner>
          <BtnGhost label={t('perdu.reessayer')} onPress={() => { void charger(); }} />
        </>
      ) : null}
      {lecture.kind === 'ok' && lecture.colis.length === 0 ? <Text style={CORPS}>{t('perdu.vide')}</Text> : null}
      {lecture.kind === 'ok'
        ? lecture.colis.map((c) => (
            <View key={c.orderId} style={{ gap: 8, borderTopWidth: 1, borderTopColor: P.divider, paddingTop: 12 }}>
              <Text style={NOM}>{phraseColis(c)}</Text>
              <BtnSoft
                label={t('perdu.choisir')}
                icon="alertTriangle"
                onPress={() => setActe({ etape: 'montants', colis: c, saisies: {} })}
              />
            </View>
          ))
        : null}
    </Cadre>
  );
}

function Cadre({ children }: { children: ReactNode }) {
  return (
    <Card variant="Llg" style={{ marginTop: 16, gap: 10 }}>
      <Text style={TITRE}>{t('perdu.titre')}</Text>
      <Text style={CORPS}>{t('perdu.sens')}</Text>
      {children}
    </Card>
  );
}

function Etape({ acte, onActe, onEnvoyer, onFermer }: {
  acte: Acte;
  onActe: (a: Acte | null) => void;
  onEnvoyer: (colis: ColisEnMain, montants: readonly Montant[], commandId: string) => Promise<void>;
  onFermer: () => void;
}) {
  const { colis } = acte;
  if (acte.etape === 'montants') {
    const lus = colis.commandes.map((orderId) => ({ orderId, amount: montantTape(acte.saisies[orderId] ?? '') }));
    const tousLus = lus.every((m) => m.amount !== null);
    const unFaux = colis.commandes.some((id) => (acte.saisies[id] ?? '').trim() !== '' && montantTape(acte.saisies[id] ?? '') === null);
    return (
      <>
        <Text style={NOM}>{phraseColis(colis)}</Text>
        <Text style={CORPS}>{t('perdu.montant_sens')}</Text>
        {colis.commandes.map((orderId) => (
          <Input
            key={orderId}
            label={t('perdu.montant_article').replace('{ref}', orderId)}
            value={acte.saisies[orderId] ?? ''}
            keyboardType="number-pad"
            onChangeText={(v) => onActe({ ...acte, saisies: { ...acte.saisies, [orderId]: v } })}
          />
        ))}
        {unFaux ? <Text style={CORPS}>{t('perdu.montant_invalide')}</Text> : null}
        <C07BtnPrimary
          label={t('perdu.continuer')}
          icon="check"
          disabled={!tousLus}
          onPress={() => {
            if (!tousLus) return;
            onActe({ etape: 'confirmer', colis, montants: lus.map((m) => ({ orderId: m.orderId, amount: m.amount! })) });
          }}
        />
        <BtnGhost label={t('perdu.annuler')} onPress={() => onActe(null)} />
      </>
    );
  }

  const lignes = acte.montants.map((m) => (
    <Text key={m.orderId} style={CORPS}>
      {t('perdu.ligne_montant').replace('{ref}', m.orderId).replace('{montant}', formatF(m.amount))}
    </Text>
  ));

  if (acte.etape === 'confirmer') {
    return (
      <>
        <Text style={NOM}>{phraseColis(colis)}</Text>
        {lignes}
        <Banner tone="warn">{t('perdu.final')}</Banner>
        <Text style={CORPS}>{t('perdu.suite')}</Text>
        <C07BtnPrimary
          label={t('perdu.oui')}
          icon="check"
          // Minted once, here: every send of this declaration carries it.
          onPress={() => { void onEnvoyer(colis, acte.montants, mintCommandId()); }}
        />
        <BtnGhost label={t('perdu.annuler')} onPress={() => onActe(null)} />
      </>
    );
  }

  if (acte.etape === 'envoi') {
    return (
      <>
        <Text style={NOM}>{phraseColis(colis)}</Text>
        {lignes}
        <C07BtnPrimary label={t('perdu.envoi')} icon="check" disabled onPress={() => {}} />
      </>
    );
  }

  const { reponse } = acte;
  const reussi = reponse.kind === 'declare' || reponse.kind === 'deja_declare';
  return (
    <>
      <Text style={NOM}>{phraseColis(colis)}</Text>
      {lignes}
      <Banner tone={reussi ? 'success' : 'warn'}>{t(phraseReponse(reponse))}</Banner>
      {aRenvoyer(reponse) ? (
        <>
          <C07BtnPrimary
            label={t('perdu.reessayer')}
            icon="retry"
            onPress={() => { void onEnvoyer(colis, acte.montants, acte.commandId); }}
          />
          <BtnGhost label={t('perdu.fermer')} onPress={onFermer} />
        </>
      ) : (
        <C07BtnPrimary label={t('perdu.fermer')} icon="check" onPress={onFermer} />
      )}
    </>
  );
}
