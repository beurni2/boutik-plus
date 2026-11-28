import { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import { P } from '../ui/v2/palette';
import { role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, C07BtnPrimary, Card } from '../v2/components';
import { rafraichirQuandVisible } from '../ui/rafraichir';
import { quandOuaga } from '../sos/view';
import { clearStoredCleCoursiers, readStoredCleCoursiers } from '../coursiers/service';
import { ALERTES_RELECTURE_MS, resolveAlertesService, type AlerteOuverte } from './service';
import { ligneCommande, phraseDepuis, phraseGarde, suiteAlerte, titreAlerte } from './view';

/**
 * ═══ ALERTES — Séra's open problems, first on Opérations ═══
 *
 * Mounted first under Opérations' masthead (ruled 2026-11-28), below
 * the rider SOS strip that sits above every tab. While Séra holds an alert
 * open, it shows here, in Séra's order, until Séra itself answers his
 * « J'ai vu » with the alert closed. Every state is said, never implied: not
 * linked to Séra, no Séra key on this browser, Séra not answering. With
 * nothing open, the section takes no space.
 *
 * A refused key never takes an alert away: what was shown was read from Séra,
 * and Séra still holds it open. It re-reads once a minute while the page is
 * in front of him, and at once on his return (CROISSANCE-1).
 */

const TITRE = role({ f: 'BG', w: 800, s: 15 }, P.ink);
const CORPS = role({ f: 'IS', w: 400, s: 13 }, P.sub);

type Envoi = 'envoi' | 'echec';

export function SAlertesSera() {
  const base = process.env.EXPO_PUBLIC_SERA_LOGISTICS_BASE;
  const relie = typeof base === 'string' && base.trim() !== '';
  const [cle, setCle] = useState<string | null>(() => readStoredCleCoursiers());
  const [alertes, setAlertes] = useState<readonly AlerteOuverte[]>([]);
  const [illisible, setIllisible] = useState(false);
  const [dernierLu, setDernierLu] = useState<string | null>(null);
  const [envois, setEnvois] = useState<Readonly<Record<string, Envoi>>>({});
  const lectureEnCours = useRef(false);
  const envoisEnCours = useRef(new Set<string>());
  // Séra never reopens a closed alert: a read that left before his close
  // landed must not bring it back.
  const fermees = useRef(new Set<string>());
  const monte = useRef(true);

  const sansCle = useCallback((): void => {
    setCle(null);
    setIllisible(false);
    setDernierLu(null);
  }, []);

  const cleRefusee = useCallback((refusee: string): void => {
    // Cleared on 401, like every other key in this console, but only if it is
    // still the key Séra refused: one typed meanwhile in « Coursiers » stays.
    if (readStoredCleCoursiers() === refusee) clearStoredCleCoursiers();
    const k = readStoredCleCoursiers();
    if (k === null) sansCle();
    else setCle(k);
  }, [sansCle]);

  const charger = useCallback(async (): Promise<void> => {
    if (lectureEnCours.current) return;
    // Read from the browser each time: the key is typed in « Coursiers ».
    const k = readStoredCleCoursiers();
    if (k === null) {
      sansCle();
      return;
    }
    setCle(k);
    const service = resolveAlertesService(k);
    if (service === null) return;
    lectureEnCours.current = true;
    try {
      const lu = await service.lire();
      if (!monte.current) return;
      if (lu.kind === 'bad_key') {
        cleRefusee(k);
        return;
      }
      if (lu.kind !== 'ok') {
        // What was read before stays: an alert he was shown must not vanish
        // because the network did.
        setIllisible(true);
        return;
      }
      setAlertes(lu.alertes.filter((a) => !fermees.current.has(a.id)));
      setIllisible(false);
      setDernierLu(new Date().toISOString());
    } finally {
      lectureEnCours.current = false;
    }
  }, [sansCle, cleRefusee]);

  useEffect(() => {
    monte.current = true;
    void charger();
    const arreter = rafraichirQuandVisible(() => {
      void charger();
    }, ALERTES_RELECTURE_MS);
    return () => {
      monte.current = false;
      arreter();
    };
  }, [charger]);

  const marquerVu = useCallback(async (id: string): Promise<void> => {
    if (envoisEnCours.current.has(id)) return;
    const k = readStoredCleCoursiers();
    const service = k === null ? null : resolveAlertesService(k);
    if (k === null || service === null) {
      // No key to close it with: say so on the card, never a button that does nothing.
      setEnvois((e) => ({ ...e, [id]: 'echec' }));
      return;
    }
    envoisEnCours.current.add(id);
    setEnvois((e) => ({ ...e, [id]: 'envoi' }));
    try {
      const r = await service.marquerVu(id);
      if (!monte.current) return;
      if (r.kind === 'vu') {
        // Only Séra's word takes the alert away.
        fermees.current.add(id);
        setAlertes((a) => a.filter((x) => x.id !== id));
        setEnvois((e) => {
          const reste = { ...e };
          delete reste[id];
          return reste;
        });
        return;
      }
      setEnvois((e) => ({ ...e, [id]: 'echec' }));
      if (r.kind === 'bad_key') cleRefusee(k);
    } finally {
      envoisEnCours.current.delete(id);
    }
  }, [cleRefusee]);

  if (!relie) return <Ligne texte={t('alertes.pas_relie')} />;
  if (cle === null && alertes.length === 0) return <Ligne texte={t('alertes.sans_cle')} />;
  if (alertes.length === 0 && !illisible) return null;
  const maintenant = new Date();
  return (
    <>
      {cle === null ? <Ligne texte={t('alertes.sans_cle')} /> : null}
      {illisible ? (
        <Ligne
          texte={dernierLu === null
            ? t('alertes.illisible')
            : t('alertes.illisible_depuis').replace('{quand}', quandOuaga(dernierLu, maintenant))}
        />
      ) : null}
      {alertes.map((a) => (
        <CarteAlerte key={a.id} a={a} maintenant={maintenant} envoi={envois[a.id]} onVu={() => void marquerVu(a.id)} />
      ))}
    </>
  );
}

function Ligne({ texte }: { texte: string }) {
  return <Banner tone="warn" style={{ marginTop: 16 }}>{texte}</Banner>;
}

function CarteAlerte({ a, maintenant, envoi, onVu }: { a: AlerteOuverte; maintenant: Date; envoi: Envoi | undefined; onVu: () => void }) {
  const depuis = phraseDepuis(a, maintenant);
  const garde = phraseGarde(a.detail);
  const suite = suiteAlerte(a);
  return (
    <Card variant="Llg" style={{ marginTop: 16, gap: 8 }}>
      <Text style={TITRE}>{titreAlerte(a)}</Text>
      <Text style={CORPS}>{ligneCommande(a)}</Text>
      {depuis !== '' ? <Text style={CORPS}>{depuis}</Text> : null}
      {garde !== null ? <Text style={CORPS}>{garde}</Text> : null}
      {suite !== null ? <Text style={CORPS}>{suite}</Text> : null}
      {envoi === 'echec' ? <Text style={CORPS}>{t('alertes.ack_echec')}</Text> : null}
      <C07BtnPrimary
        label={envoi === 'envoi' ? t('sos.envoi') : t('alertes.vu')}
        icon="check"
        disabled={envoi === 'envoi'}
        onPress={onVu}
      />
    </Card>
  );
}
