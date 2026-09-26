import { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnSoft } from '../v2/components';
import {
  MOTIFS_REFUS,
  PREMIER_GRAVE,
  libelleMotif,
  resolveRefusService,
  type MotifRefus,
} from '../operations/dispatch-service';

/**
 * SP6.3 — ONE DOORSTEP REFUSAL, RECORDED (§6.4).
 *
 * REMBOURSABLE-1 (AUDIT-B+2 F-10) — MOUNTED AGAIN, on the Commandes tab's
 * Incidents card. RB-1 retired the Livraisons list that was its only mount, so
 * since 2026-08-08 nothing wrote the §6.4 ladder and « payer à la livraison »
 * stayed open to every buyer whatever she did. It lives where a refused course
 * lands: Incidents — never on Terminées, where she accepted her parcel and a
 * « Signaler » would invite a false fault.
 *
 * ═══ WHAT THIS COSTS A BUYER, WHICH IS WHY IT IS BUILT THE WAY IT IS ═══
 *
 * Tapping one of these moves a real woman's standing: two ordinary faults and
 * « payer à la livraison » closes for her for a month. So the affordance is
 * deliberately quiet, deliberately two taps, and deliberately says what each
 * reason means in her words rather than the system's.
 *
 * THE GRAVE TWO SIT APART. « Abus répété » and « Fraude » end her access to the
 * door entirely and cannot be walked back by the ladder itself; they are last,
 * after a divider, so a tired thumb does not land on them.
 *
 * « L'article n'était pas le bon » IS ON THE LIST AND CARRIES A SENTENCE
 * SAYING IT NEVER COUNTS AGAINST HER. Without it, an honest operator facing a
 * genuine wrong-item refusal has no true option and picks « elle a changé
 * d'avis » — and a buyer is punished for our mistake. The reassurance is not
 * decoration; it is what makes choosing the true reason the easy thing to do.
 */
export function SignalerRefus({
  orderId,
  cleC,
  aUnNumero,
  onCleCRefusee,
}: {
  orderId: string;
  cleC: string | null;
  aUnNumero: boolean;
  /** A refused key C goes back to its door, like every key on this console —
   *  never « pas de réponse » about a call the server answered. */
  onCleCRefusee: () => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'fait' | 'echec' | 'sans_contact' | 'deja'>('repos');
  const service = useMemo(() => resolveRefusService(), []);

  // NO NUMBER, NO LADDER — and the row says so instead of offering an action
  // that could only fail. The order is still dispatchable by other means; it is
  // only the refusal record that has nothing to attach to.
  if (!aUnNumero || cleC === null || service === null) return null;

  if (etat === 'fait') {
    return (
      <View style={{ marginTop: 8 }}>
        <Text style={role({ f: 'IS', w: 600, s: 12 }, P.ink)}>{t('refus.enregistre')}</Text>
      </View>
    );
  }

  if (!ouvert) {
    return (
      <View style={{ marginTop: 10 }}>
        <BtnSoft label={t('refus.ouvrir')} icon="retry" onPress={() => setOuvert(true)} />
      </View>
    );
  }

  const choisir = (motif: MotifRefus) => {
    setEtat('envoi');
    void service.signalerRefus(cleC, orderId, motif).then((res) => {
      if (res.ok) {
        setEtat('fait');
        return;
      }
      if (res.reason === 'bad_key') {
        onCleCRefusee();
        return;
      }
      if (res.reason === 'sans_contact') {
        setEtat('sans_contact');
        return;
      }
      // REFUS-IDEMPOTENCE-1 — « already noted » is neither a success nor a
      // network fault, so it gets its own sentence rather than being folded
      // into one of the two things it is not.
      setEtat(res.reason === 'deja_note' ? 'deja' : 'echec');
    });
  };

  return (
    <View style={{ marginTop: 10 }}>
      <Text style={role({ f: 'IS', w: 600, s: 13 }, P.ink)}>{t('refus.titre')}</Text>
      <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginTop: 2 }]}>{t('refus.aide')}</Text>

      {etat === 'envoi' && (
        <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginTop: 8 }]}>{t('refus.envoi')}</Text>
      )}
      {etat === 'echec' && (
        <View style={{ marginTop: 8 }}>
          <Banner tone="warn">{t('refus.echec')}</Banner>
        </View>
      )}
      {etat === 'sans_contact' && (
        <View style={{ marginTop: 8 }}>
          <Banner tone="info">{t('refus.sans_contact')}</Banner>
        </View>
      )}
      {etat === 'deja' && (
        <View style={{ marginTop: 8 }}>
          <Banner tone="info">{t('refus.deja')}</Banner>
        </View>
      )}

      {/*
        THE LIST DISAPPEARS THE MOMENT AN ATTEMPT ENDS BADLY, and it STAYS that
        way after REFUS-IDEMPOTENCE-1 — for a smaller reason, honestly stated.
        The route now derives an idempotency key from the order, so re-tapping
        the SAME reason after a lost response is harmless and the sentence says
        so. What a blind re-tap can still get wrong is the reason itself: a
        different one is refused (409, « déjà une note ») rather than applied,
        and a tired thumb landing on « Fraude » instead of « Elle a changé
        d'avis » deserves the pause either way. Two ordinary faults close her
        door for a month; deliberate reopening costs one tap and is worth it.
      */}
      {etat === 'repos' &&
        MOTIFS_REFUS.map((motif) => (
          <View
            key={motif}
            // THE DIVIDER BEFORE THE GRAVE TWO. `repeated_abuse` opens the pair
            // that ends her access to the door; the wider gap is the pause.
            style={{ marginTop: motif === PREMIER_GRAVE ? 18 : 8 }}
          >
            <BtnSoft label={t(libelleMotif(motif))} icon="check" onPress={() => choisir(motif)} />
            {motif === 'conformity_mismatch' && (
              <Text style={[role({ f: 'IS', w: 400, s: 11 }, P.sub), { marginTop: 4 }]}>
                {t('refus.note_conformite')}
              </Text>
            )}
          </View>
        ))}

      <View style={{ marginTop: 14 }}>
        <BtnSoft label={t('refus.fermer')} icon="retry" onPress={() => { setOuvert(false); setEtat('repos'); }} />
      </View>
    </View>
  );
}
