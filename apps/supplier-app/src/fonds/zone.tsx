import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { GEO } from '../ui/v2/tokens';
import { TNUM, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnGhost, BtnSoft, C07BtnPrimary, Card, ChipCategory, Input, Overline } from '../v2/components';
import { formatF } from '../v2/money';
import {
  clearStoredCleFonds,
  readStoredCleFonds,
  resolveFondsService,
  storeCleFonds,
  type ActeFondsResult,
  type FauteFonds,
  type FondsServicePort,
  type ReclamationRow,
} from './service';
import { etatPillule, fondsPillule, fondsVue, type FondsRead } from './view';

/**
 * FONDS-CONSOLE-B+ — the « Fonds » zone of the founder's console (founder
 * order 2026-08-06: the fund desk lives HERE, redesigned — no separate URL).
 *
 * THE 5-SECOND TEST for its owner: one question answered first — « le fonds
 * peut-il couvrir ce qui est engagé ? » The fund card is the hero: the
 * declared solde LARGE, the engaged figure beside it, the state as one pill.
 * The buyer-first law renders before any figure, always. Recording acts fold
 * out only when asked for; the reading posture stays calm.
 *
 * SAME DISCIPLINE AS EVERY ZONE (CONSOLE-GT-1): kit components and palette
 * tokens only; the pure decisions live in ./view.ts; the impure substance
 * (service, reads, retries, the key) lives here; every state is designed and
 * TRUE — loading, not-configured, key-refused (its own sentence), unreachable
 * with retry, and the encouraging honest empty.
 */

const TONES: Record<'ok' | 'attente' | 'pause', { bg: string; fg: string }> = {
  ok: { bg: P.successBg, fg: P.successFg },
  attente: { bg: P.warnBg, fg: P.warnFg },
  pause: { bg: P.neutralPill, fg: P.sub },
};

function Pillule({ labelKey, tone }: { labelKey: string; tone: 'ok' | 'attente' | 'pause' }) {
  const { bg, fg } = TONES[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: GEO.r.pill, paddingVertical: 4, paddingHorizontal: 10, alignSelf: 'flex-start' }}>
      <Text style={role({ f: 'IS', w: 700, s: 11.5 }, fg)}>{t(labelKey)}</Text>
    </View>
  );
}

/** One quiet figure — label over amount, the card's grammar for money facts. */
function Chiffre({ labelKey, valeur }: { labelKey: string; valeur: string }) {
  return (
    <View style={{ flex: 1, minWidth: 150 }}>
      <Overline level="card">{t(labelKey)}</Overline>
      <Text style={[role({ f: 'BG', w: 800, s: 17 }, P.ink), TNUM, { marginTop: 4 }]}>{valeur}</Text>
    </View>
  );
}

const RAISON_MESSAGE: Record<Exclude<ActeFondsResult, { ok: true }>['reason'], string> = {
  bad_key: 'fonds.cle_refusee',
  duplicate: 'fonds.deja_ouverte',
  not_forward: 'fonds.pas_en_arriere',
  settlement_ref_required: 'fonds.ref_requise',
  close_reason_required: 'fonds.motif_requis',
  sera_routing: 'fonds.faute_sera_note',
  invalid: 'fonds.champ_manquant',
  unreachable: 'fonds.injoignable',
};

const FAUTES_OUVERTURE: ReadonlyArray<{ faute: FauteFonds; labelKey: string }> = [
  { faute: 'seller', labelKey: 'fonds.faute_vendeur' },
  { faute: 'buyer', labelKey: 'fonds.faute_cliente' },
  { faute: 'payment_provider', labelKey: 'fonds.faute_operateur' },
  { faute: 'platform_system', labelKey: 'fonds.faute_plateforme' },
  { faute: 'unresolved', labelKey: 'fonds.faute_a_classer' },
];

export function SZoneFonds() {
  const service = useMemo<FondsServicePort | null>(() => resolveFondsService(), []);
  const [cle, setCle] = useState<string | null>(() => readStoredCleFonds());
  if (service === null) {
    return (
      <View style={{ marginTop: 16 }}>
        <Banner tone="info">{t('fonds.non_configure')}</Banner>
      </View>
    );
  }
  if (cle === null) {
    return <PorteFonds onOuverte={(k) => { storeCleFonds(k); setCle(k); }} />;
  }
  return (
    <LivreFondsZone
      service={service}
      cle={cle}
      onCleRefusee={() => {
        clearStoredCleFonds();
        setCle(null);
      }}
    />
  );
}

/** The fund's own door — its key is the founder's alone, distinct from every other. */
function PorteFonds({ onOuverte }: { onOuverte: (cle: string) => void }) {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  return (
    <Card variant="Llg" style={{ marginTop: 16 }}>
      <Text style={role({ f: 'BG', w: 800, s: 17 }, P.ink)}>{t('fonds.cle_libelle')}</Text>
      <Text style={[role({ f: 'IS', w: 400, s: 13 }, P.sub), { marginTop: 6 }]}>{t('fonds.cle_explication')}</Text>
      <View style={{ marginTop: 16 }}>
        <Input label={t('fonds.cle_libelle')} value={draft} onChangeText={setDraft} />
      </View>
      <View style={{ marginTop: 16 }}>
        <C07BtnPrimary
          label={t('fonds.cle_ouvrir')}
          icon="check"
          onPress={() => {
            if (trimmed !== '') onOuverte(trimmed);
          }}
        />
      </View>
      <View style={{ marginTop: 12 }}>
        <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('fonds.cle_reste_ici')}</Text>
      </View>
    </Card>
  );
}

function LivreFondsZone({ service, cle, onCleRefusee }: {
  service: FondsServicePort;
  cle: string;
  onCleRefusee: () => void;
}) {
  const [read, setRead] = useState<FondsRead>({ kind: 'loading' });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function charger(): Promise<void> {
    setRead({ kind: 'loading' });
    const lecture = await service.lire(cle);
    setRead({ kind: 'lecture', lecture });
  }
  useEffect(() => {
    void charger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vue = fondsVue(read);
  useEffect(() => {
    if (vue.kind === 'bad_key') onCleRefusee();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vue.kind]);

  async function agir(acte: Promise<ActeFondsResult>): Promise<void> {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    const r = await acte;
    setBusy(false);
    if (r.ok) {
      await charger();
      return;
    }
    if (r.reason === 'bad_key') {
      onCleRefusee();
      return;
    }
    setFeedback(RAISON_MESSAGE[r.reason]);
  }

  if (vue.kind === 'loading') {
    return (
      <View style={{ marginTop: 16 }}>
        <Text style={role({ f: 'IS', w: 400, s: 13 }, P.sub)}>{t('fonds.lecture')}</Text>
      </View>
    );
  }
  if (vue.kind === 'bad_key') return null; // the effect above re-opens the door
  if (vue.kind === 'not_configured' || vue.kind === 'failed') {
    return (
      <View style={{ marginTop: 16 }}>
        <Banner tone={vue.kind === 'failed' ? 'warn' : 'info'}>{t(vue.message)}</Banner>
        {vue.kind === 'failed' && (
          <View style={{ marginTop: 10 }}>
            <BtnSoft label={t('operations.reessayer')} icon="retry" onPress={() => void charger()} />
          </View>
        )}
      </View>
    );
  }

  const { figures } = vue.livre;
  const pilluleFonds = fondsPillule(figures.etatFonds);

  return (
    <>
      {/* THE LAW FIRST — before any figure, always (B+I-13). */}
      <View style={{ marginTop: 16 }}>
        <Banner tone="success">{t('fonds.loi_cliente')}</Banner>
      </View>

      {vue.livre.nonReconnues > 0 && (
        <View style={{ marginTop: 10 }}>
          <Banner tone="warn">{t('fonds.lignes_non_reconnues')}</Banner>
        </View>
      )}

      {/* ═══ THE FUND CARD — the hero, the one question answered large ═══ */}
      <Card variant="Llg" style={{ marginTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Overline level="card">{t('fonds.carte_titre')}</Overline>
          <Pillule labelKey={pilluleFonds.labelKey} tone={pilluleFonds.tone} />
        </View>
        <Text style={[role({ f: 'BG', w: 800, s: 28 }, P.ink), TNUM, { marginTop: 8 }]}>
          {figures.soldeFcfa === null ? t('fonds.pas_declare') : formatF(figures.soldeFcfa)}
        </Text>
        {figures.declareLe !== null && (
          <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginTop: 4 }]}>
            {`${t('fonds.declare_le')} ${figures.declareLe.slice(0, 10)}`}
          </Text>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
          <Chiffre labelKey="fonds.engages" valeur={formatF(figures.engagesFcfa)} />
          <Chiffre
            labelKey="fonds.reste"
            valeur={figures.resteFcfa === null ? t('fonds.pas_declare') : formatF(figures.resteFcfa)}
          />
        </View>
        <DeclarerSolde busy={busy} onDeclarer={(soldeFcfa, capitalFcfa, commandId) =>
          void agir(service.declarer(cle, { soldeFcfa, ...(capitalFcfa !== undefined ? { capitalFcfa } : {}), commandId }))
        } />
      </Card>

      {feedback !== null && (
        <View style={{ marginTop: 10 }}>
          <Banner tone="warn">{t(feedback)}</Banner>
        </View>
      )}

      {/* ═══ THE CLAIMS — grouped by fault, one card per claim, acts fold out ═══ */}
      <View style={{ marginTop: 28, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: P.borderCtl }}>
        <Text style={role({ f: 'BG', w: 800, s: 17 }, P.ink)}>{t('fonds.reclamations_titre')}</Text>
        <Text style={[role({ f: 'IS', w: 400, s: 12.5 }, P.sub), { marginTop: 3 }]}>{t('fonds.reclamations_sens')}</Text>
      </View>
      {vue.vide ? (
        <View style={{ marginTop: 10 }}>
          <Banner tone="info">{t('fonds.aucune_reclamation')}</Banner>
        </View>
      ) : (
        vue.groupes.map((g) => (
          <View key={g.faute}>
            <View style={{ marginTop: 18 }}>
              <Overline level="card">{t(g.titreKey)}</Overline>
            </View>
            {g.rows.map((r) => (
              <CarteReclamation key={r.orderId} row={r} busy={busy} onAvancer={(vers, detail) =>
                void agir(service.avancer(cle, r.orderId, vers, detail))
              } />
            ))}
          </View>
        ))
      )}

      <OuvrirReclamation busy={busy} onOuvrir={(input) => void agir(service.ouvrir(cle, input))} />

      <View style={{ marginTop: 20, flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
        <BtnGhost label={t('operations.actualiser')} onPress={() => void charger()} />
        <BtnGhost label={t('fonds.oublier_cle')} onPress={onCleRefusee} />
      </View>
    </>
  );
}

/** One claim, said calmly: who owes what, where it stands, what he can do next. */
function CarteReclamation({ row, busy, onAvancer }: {
  row: ReclamationRow;
  busy: boolean;
  onAvancer: (vers: 'under_review' | 'resolved' | 'closed_no_payout', detail?: string) => void;
}) {
  const pill = etatPillule(row.etat);
  const [regler, setRegler] = useState(false);
  const [classer, setClasser] = useState(false);
  const [refDraft, setRefDraft] = useState('');
  const [motifDraft, setMotifDraft] = useState('');
  return (
    <Card variant="Llist" style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <Text style={[role({ f: 'BG', w: 700, s: 15 }, P.ink), { flexShrink: 1 }]}>{row.orderId}</Text>
        <Text style={[role({ f: 'BG', w: 800, s: 16 }, P.ink), TNUM]}>{formatF(row.montantFcfa)}</Text>
      </View>
      <View style={{ marginTop: 6 }}>
        <Pillule labelKey={pill.labelKey} tone={pill.tone} />
      </View>
      <Text style={[role({ f: 'IS', w: 400, s: 13 }, P.inkSoft), { marginTop: 8 }]}>{row.motif}</Text>
      <Text style={[role({ f: 'IS', w: 400, s: 11.5 }, P.sub), { marginTop: 4 }]}>
        {`${t('fonds.preuve')} ${row.preuve}`}
      </Text>
      {row.clienteDabord && (
        <Text style={[role({ f: 'IS', w: 700, s: 11.5 }, P.successFg), { marginTop: 6 }]}>
          {t('fonds.cliente_dabord')}
        </Text>
      )}
      {row.reglementRef !== undefined && (
        <Text style={[role({ f: 'IS', w: 400, s: 11.5 }, P.sub), { marginTop: 6 }]}>
          {`${t('fonds.reglee_ref')} ${row.reglementRef}`}
        </Text>
      )}
      {row.motifClassement !== undefined && (
        <Text style={[role({ f: 'IS', w: 400, s: 11.5 }, P.sub), { marginTop: 6 }]}>
          {`${t('fonds.classee_motif')} ${row.motifClassement}`}
        </Text>
      )}

      {row.etat === 'opened' && (
        <View style={{ marginTop: 12 }}>
          <BtnSoft label={t('fonds.passer_examen')} icon="check" onPress={() => { if (!busy) onAvancer('under_review'); }} />
        </View>
      )}
      {row.etat === 'under_review' && !regler && (
        <View style={{ marginTop: 12 }}>
          <BtnSoft label={t('fonds.marquer_reglee')} icon="check" onPress={() => setRegler(true)} />
        </View>
      )}
      {regler && (
        <View style={{ marginTop: 12 }}>
          <Input label={t('fonds.ref_paiement')} value={refDraft} onChangeText={setRefDraft} />
          <View style={{ marginTop: 10 }}>
            <C07BtnPrimary
              label={t('fonds.confirmer_reglee')}
              icon="check"
              onPress={() => {
                const ref = refDraft.trim();
                if (ref !== '' && !busy) onAvancer('resolved', ref);
              }}
            />
          </View>
        </View>
      )}
      {(row.etat === 'opened' || row.etat === 'under_review') && !classer && (
        <View style={{ marginTop: 10 }}>
          <BtnGhost label={t('fonds.classer')} onPress={() => setClasser(true)} />
        </View>
      )}
      {classer && (
        <View style={{ marginTop: 12 }}>
          <Input label={t('fonds.classer_pourquoi')} value={motifDraft} onChangeText={setMotifDraft} />
          <View style={{ marginTop: 10 }}>
            <BtnSoft
              label={t('fonds.confirmer_classement')}
              icon="check"
              onPress={() => {
                const motif = motifDraft.trim();
                if (motif !== '' && !busy) onAvancer('closed_no_payout', motif);
              }}
            />
          </View>
        </View>
      )}
    </Card>
  );
}

/** The declare fold — closed by default; the commandId is minted when it OPENS,
 *  so a double-tap replays the same command and the book appends once. */
function DeclarerSolde({ busy, onDeclarer }: {
  busy: boolean;
  onDeclarer: (soldeFcfa: number, capitalFcfa: number | undefined, commandId: string) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [commandId, setCommandId] = useState('');
  const [solde, setSolde] = useState('');
  const [capital, setCapital] = useState('');
  if (!ouvert) {
    return (
      <View style={{ marginTop: 16 }}>
        <BtnGhost label={t('fonds.declarer')} onPress={() => { setCommandId(crypto.randomUUID()); setOuvert(true); }} />
      </View>
    );
  }
  return (
    <View style={{ marginTop: 16 }}>
      <Input label={t('fonds.solde_libelle')} value={solde} onChangeText={setSolde} />
      <View style={{ marginTop: 10 }}>
        <Input label={t('fonds.capital_libelle')} value={capital} onChangeText={setCapital} />
      </View>
      <View style={{ marginTop: 12 }}>
        <C07BtnPrimary
          label={t('fonds.enregistrer_solde')}
          icon="check"
          onPress={() => {
            const s = Number(solde.trim());
            if (!Number.isSafeInteger(s) || s < 0 || busy) return;
            const capRaw = capital.trim();
            const cap = capRaw === '' ? undefined : Number(capRaw);
            if (cap !== undefined && (!Number.isSafeInteger(cap) || cap < 0)) return;
            onDeclarer(s, cap, commandId);
            setOuvert(false);
            setSolde('');
            setCapital('');
          }}
        />
      </View>
    </View>
  );
}

/** The open-claim fold — the LAST section: recording a fault is rarer than reading the book. */
function OuvrirReclamation({ busy, onOuvrir }: {
  busy: boolean;
  onOuvrir: (input: { orderId: string; motif: string; faute: FauteFonds; montantFcfa: number; preuve: string }) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [commande, setCommande] = useState('');
  const [montant, setMontant] = useState('');
  const [motif, setMotif] = useState('');
  const [faute, setFaute] = useState<FauteFonds>('seller');
  const [preuve, setPreuve] = useState('');
  return (
    <>
      <View style={{ marginTop: 28, paddingBottom: 9, borderBottomWidth: 1, borderBottomColor: P.borderCtl }}>
        <Text style={role({ f: 'BG', w: 800, s: 17 }, P.ink)}>{t('fonds.ouvrir_titre')}</Text>
        <Text style={[role({ f: 'IS', w: 400, s: 12.5 }, P.sub), { marginTop: 3 }]}>{t('fonds.ouvrir_sens')}</Text>
      </View>
      {!ouvert ? (
        <View style={{ marginTop: 12 }}>
          <BtnSoft label={t('fonds.ouvrir_bouton')} icon="plus" onPress={() => setOuvert(true)} />
        </View>
      ) : (
        <Card variant="Llg" style={{ marginTop: 12 }}>
          <Input label={t('fonds.commande_libelle')} value={commande} onChangeText={setCommande} />
          <View style={{ marginTop: 10 }}>
            <Input label={t('fonds.montant_libelle')} value={montant} onChangeText={setMontant} />
          </View>
          <View style={{ marginTop: 10 }}>
            <Input label={t('fonds.motif_libelle')} value={motif} onChangeText={setMotif} />
          </View>
          <View style={{ marginTop: 14 }}>
            <Overline level="card">{t('fonds.faute_libelle')}</Overline>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
            {FAUTES_OUVERTURE.map(({ faute: f, labelKey }) => (
              <ChipCategory key={f} label={t(labelKey)} active={faute === f} onPress={() => setFaute(f)} />
            ))}
          </View>
          <Text style={[role({ f: 'IS', w: 400, s: 11.5 }, P.sub), { marginTop: 8 }]}>
            {t('fonds.faute_sera_note')}
          </Text>
          <View style={{ marginTop: 12 }}>
            <Input label={t('fonds.preuve_libelle')} value={preuve} onChangeText={setPreuve} />
          </View>
          <View style={{ marginTop: 14 }}>
            <C07BtnPrimary
              label={t('fonds.enregistrer_reclamation')}
              icon="check"
              onPress={() => {
                const m = Number(montant.trim());
                if (commande.trim() === '' || motif.trim() === '' || preuve.trim() === '') return;
                if (!Number.isSafeInteger(m) || m < 0 || busy) return;
                onOuvrir({
                  orderId: commande.trim(),
                  motif: motif.trim(),
                  faute,
                  montantFcfa: m,
                  preuve: preuve.trim(),
                });
                setOuvert(false);
                setCommande('');
                setMontant('');
                setMotif('');
                setPreuve('');
              }}
            />
          </View>
        </Card>
      )}
    </>
  );
}
