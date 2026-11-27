import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnGhost, BtnSoft, C07BtnPrimary, Card, Input } from '../v2/components';
import { mintCommandId } from '../offline/commandId';
import { formatF } from '../v2/money';
import { rafraichirQuandVisible } from '../ui/rafraichir';
import { clearStoredCleCoursiers, readStoredCleCoursiers } from '../coursiers/service';
import { resolveColisPerdu, type ColisEnMain, type Montant } from './service';
import { aRenvoyer, montantTape, phraseReponse } from './view';
import { abonnerActe, lireActe, poserActe, poserIssue, type Acte, type Issue } from './acte';

/**
 * ═══ COLIS-PERDU — « Colis perdu en route », at the top of Opérations ═══
 *
 * Founder ruling 2026-11-27: the button sits in Opérations, next to the SOS
 * alerts, under the masthead across every zone. The open declaration lives
 * in `./acte`, not here, so leaving the tab never drops one in flight.
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

const declare = (r: Issue): boolean => r.kind === 'declare' || r.kind === 'deja_declare';

const phraseColis = (c: ColisEnMain): string =>
  c.commandes.length > 1
    ? t('perdu.course_colis').replace('{n}', String(c.commandes.length)).replace('{nom}', c.nom)
    : t('perdu.course').replace('{ref}', c.orderId).replace('{nom}', c.nom);

export function SColisPerdu() {
  const base = process.env.EXPO_PUBLIC_SERA_LOGISTICS_BASE;
  const relie = typeof base === 'string' && base.trim() !== '';
  const [lecture, setLecture] = useState<Lecture>({ kind: 'chargement' });
  const acte = useSyncExternalStore(abonnerActe, lireActe, lireActe);
  const monte = useRef(true);
  /** Only the latest read may set the list: an older one landing late is dropped. */
  const derniere = useRef(0);

  const charger = useCallback(async (): Promise<void> => {
    const n = ++derniere.current;
    const k = readStoredCleCoursiers();
    const port = k === null ? null : resolveColisPerdu(k);
    if (k === null || port === null) {
      setLecture({ kind: 'sans_cle' });
      return;
    }
    const lu = await port.lire();
    if (!monte.current || n !== derniere.current) return;
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
      if (lireActe() === null) void charger();
    }, RELECTURE_MS);
    return () => {
      monte.current = false;
      arreter();
    };
  }, [charger, relie]);

  const envoyer = useCallback(async (colis: ColisEnMain, montants: readonly Montant[], commandId: string): Promise<void> => {
    poserActe({ etape: 'envoi', colis, montants, commandId });
    const k = readStoredCleCoursiers();
    const port = k === null ? null : resolveColisPerdu(k);
    // No key: nothing is sent, and the act keeps its id for when the key is back.
    const reponse: Issue = k === null || port === null ? { kind: 'sans_cle' } : await port.declarer(commandId, colis.orderId, montants);
    if (reponse.kind === 'bad_key' && k !== null && readStoredCleCoursiers() === k) clearStoredCleCoursiers();
    if (declare(reponse)) {
      // That parcel is no longer his rider's to lose: the list waits for Séra's new board.
      derniere.current += 1;
      if (monte.current) setLecture({ kind: 'chargement' });
    }
    // Lands in the holder even if he left the tab meanwhile.
    poserIssue(commandId, reponse);
  }, []);

  const fermer = useCallback((): void => {
    poserActe(null);
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
    return <Cadre><Etape acte={acte} onActe={poserActe} onEnvoyer={envoyer} onFermer={fermer} /></Cadre>;
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
                onPress={() => poserActe({ etape: 'montants', colis: c, saisies: {} })}
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
  return (
    <>
      <Text style={NOM}>{phraseColis(colis)}</Text>
      {lignes}
      <Banner tone={declare(reponse) ? 'success' : 'warn'}>{t(reponse.kind === 'sans_cle' ? 'perdu.sans_cle' : phraseReponse(reponse))}</Banner>
      {reponse.kind === 'sans_cle' || aRenvoyer(reponse) ? (
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
