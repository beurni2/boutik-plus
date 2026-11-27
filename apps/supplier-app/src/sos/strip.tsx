import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { role } from '../ui/v2/styles';
import { GEO } from '../ui/v2/tokens';
import { t } from '../i18n';
import { Banner, C07BtnPrimary, Card } from '../v2/components';
import { rafraichirQuandVisible } from '../ui/rafraichir';
import { clearStoredCleCoursiers, readStoredCleCoursiers } from '../coursiers/service';
import { resolveSosService, SOS_RELECTURE_MS, type SosOuvert } from './service';
import { phraseCourse, phraseRecu, quandOuaga, titreSos } from './view';

/**
 * ═══ SOS-DESK — the strip above every screen of the console ═══
 *
 * Mounted ONCE by the shell, above the tab content, so it survives every tab
 * and view switch and keeps reading while he works anywhere in the console.
 * While Séra holds an open SOS, the strip shows it, newest first, until Séra
 * itself answers « acknowledged » to his « J'ai vu, j'appelle ».
 *
 * Every state is said, never implied: no Séra address in this build, no Séra
 * key on this browser, Séra not answering. Those sentences are for the founder
 * only (`operateur`): the same root is a supplier's app. With nothing open,
 * the strip takes no space.
 *
 * A refused key never takes an alert away: what was shown was read from Séra,
 * and Séra still holds it open. The no-key sentence then shows above it, door
 * or no door, because only a browser with a working Séra key could have read it.
 *
 * It re-reads every 15 s while the page is in front of him and not while the
 * tab is hidden (the console's refresh rule, CROISSANCE-1): a hidden strip
 * cannot be seen, and on his return it reads at once.
 */

const CORPS = role({ f: 'IS', w: 400, s: 13 }, P.sub);

type Envoi = 'envoi' | 'echec';

export function SBandeauSos({ operateur }: { operateur: boolean }) {
  const base = process.env.EXPO_PUBLIC_SERA_LOGISTICS_BASE;
  const relie = typeof base === 'string' && base.trim() !== '';
  const [cle, setCle] = useState<string | null>(() => readStoredCleCoursiers());
  const [ouverts, setOuverts] = useState<readonly SosOuvert[]>([]);
  const [illisible, setIllisible] = useState(false);
  const [dernierLu, setDernierLu] = useState<string | null>(null);
  const [envois, setEnvois] = useState<Readonly<Record<string, Envoi>>>({});
  const lectureEnCours = useRef(false);
  const envoisEnCours = useRef(new Set<string>());
  // Séra never reopens an answered alert: a read that left before his answer
  // landed must not bring it back.
  const repondus = useRef(new Set<string>());
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
    const service = resolveSosService(k);
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
      setOuverts(lu.ouverts.filter((o) => !repondus.current.has(o.commandId)));
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
    }, SOS_RELECTURE_MS);
    return () => {
      monte.current = false;
      arreter();
    };
  }, [charger]);

  const repondre = useCallback(async (commandId: string): Promise<void> => {
    if (envoisEnCours.current.has(commandId)) return;
    const k = readStoredCleCoursiers();
    const service = k === null ? null : resolveSosService(k);
    if (k === null || service === null) {
      // No key to answer with: say so on the card, never a button that does nothing.
      setEnvois((e) => ({ ...e, [commandId]: 'echec' }));
      return;
    }
    envoisEnCours.current.add(commandId);
    setEnvois((e) => ({ ...e, [commandId]: 'envoi' }));
    try {
      const r = await service.repondre(commandId);
      if (!monte.current) return;
      if (r.kind === 'acknowledged') {
        // Only Séra's word takes the alert away.
        repondus.current.add(commandId);
        setOuverts((o) => o.filter((x) => x.commandId !== commandId));
        setEnvois((e) => {
          const reste = { ...e };
          delete reste[commandId];
          return reste;
        });
        return;
      }
      setEnvois((e) => ({ ...e, [commandId]: 'echec' }));
      if (r.kind === 'bad_key') cleRefusee(k);
    } finally {
      envoisEnCours.current.delete(commandId);
    }
  }, [cleRefusee]);

  if (!relie) return operateur ? <Ligne texte={t('sos.pas_relie')} /> : null;
  if (cle === null && ouverts.length === 0) return operateur ? <Ligne texte={t('sos.sans_cle')} /> : null;
  if (ouverts.length === 0 && !illisible) return null;
  const maintenant = new Date();
  return (
    <View style={{ paddingHorizontal: GEO.screenPad.side, paddingTop: 12, gap: 10 }}>
      {cle === null ? <Banner tone="warn">{t('sos.sans_cle')}</Banner> : null}
      {illisible ? (
        <Banner tone="warn">
          {dernierLu === null
            ? t('sos.illisible')
            : t('sos.illisible_depuis').replace('{quand}', quandOuaga(dernierLu, maintenant))}
        </Banner>
      ) : null}
      {/* Several open alerts scroll inside half the frame: the screen he is on stays reachable. */}
      <ScrollView style={{ maxHeight: GEO.frame.h / 2 }} contentContainerStyle={{ gap: 10 }}>
        {ouverts.map((o) => (
          <CarteSos key={o.commandId} o={o} maintenant={maintenant} envoi={envois[o.commandId]} onRepondre={() => void repondre(o.commandId)} />
        ))}
      </ScrollView>
    </View>
  );
}

function Ligne({ texte }: { texte: string }) {
  return (
    <View style={{ paddingHorizontal: GEO.screenPad.side, paddingTop: 12 }}>
      <Banner tone="warn">{texte}</Banner>
    </View>
  );
}

function CarteSos({ o, maintenant, envoi, onRepondre }: { o: SosOuvert; maintenant: Date; envoi: Envoi | undefined; onRepondre: () => void }) {
  const recu = phraseRecu(o.recuA, maintenant);
  return (
    <Card style={{ gap: 8 }}>
      <Banner tone="danger">{titreSos(o)}</Banner>
      {recu !== '' ? <Text style={CORPS}>{recu}</Text> : null}
      <Text style={CORPS}>{phraseCourse(o.enCourse)}</Text>
      {envoi === 'echec' ? <Text style={CORPS}>{t('sos.ack_echec')}</Text> : null}
      <C07BtnPrimary
        label={envoi === 'envoi' ? t('sos.envoi') : t('sos.vu')}
        icon="check"
        disabled={envoi === 'envoi'}
        onPress={onRepondre}
      />
    </Card>
  );
}
