import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { SCROLL, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnSoft, C07BtnPrimary, Card, Input, PageTitle } from '../v2/components';
import { formatF } from '../v2/money';
import {
  clearStoredOpsKey,
  resolveOperationsService,
  storeOpsKey,
  type OperationsServicePort,
} from './service';
import {
  clearStoredCleC,
  readStoredCleC,
  resolveDispatchService,
  storeCleC,
  type DispatchServicePort,
  type LivraisonRow,
} from './dispatch-service';
import {
  CHASE_AFTER_MIN,
  CODES_IDLE,
  RELANCE_IDLE,
  ageMinutes,
  codesReadOf,
  codesView,
  livraisonsVue,
  mintAvis,
  mintSettled,
  mintStart,
  operationsView,
  relanceSettled,
  relanceStart,
  revokeSettled,
  revokeStart,
  type CodesRead,
  type CodesUi,
  type LivraisonsRead,
  type OperationsRead,
  type OperationsRow,
  type RelanceUi,
} from './view';

/**
 * CONSOLE-1 — « Opérations », the founder's board (founder directive
 * 2026-08-01: the operator console lives on HIS Boutik+ webapp, only he sees
 * it, « well disciplined, well understandable and very professional »).
 *
 * THE 5-SECOND TEST, applied to its owner: one screen, one question answered —
 * « which paid orders need me, right now? » The chase list is FIRST and
 * loudest; everything else whispers. One primary action: refresh.
 *
 * THE SAME SHAPE AS `SProduitsReal`, deliberately: the decision is pure
 * (`operations/view.ts`), this component owns the impure substance (the
 * resolved service, the read, the honest states, the retry), and the machine
 * is untouched. The key never enters the machine's state either — it lives in
 * this component and, if the founder chooses, his browser's localStorage.
 *
 * EVERY STATE IS DESIGNED AND TRUE: loading, not-configured, key-refused (its
 * own sentence — « re-check what you typed », not « network trouble »),
 * unreachable, empty (encouraging, honest), and the board. No fake counts, no
 * placeholder rows, no apology walls.
 */

const REFRESH_EVERY_MS = 60_000;

export function SOperations({ opsKey, onKeySaved, onKeyCleared }: {
  opsKey: string | null;
  onKeySaved: (key: string) => void;
  onKeyCleared: () => void;
}) {
  const service = useMemo<OperationsServicePort | null>(() => resolveOperationsService(), []);
  if (opsKey === null) return <SCleOperateur onKeySaved={onKeySaved} />;
  return (
    <SBoard
      service={service}
      opsKey={opsKey}
      onBadKeyReset={() => {
        clearStoredOpsKey();
        onKeyCleared();
      }}
    />
  );
}

/* ───────────────────────────── the key screen ────────────────────────────── */

/**
 * Money-register calm: what this key is, where it goes (his device, nowhere
 * else), and one action. The input is a plain field, not a password field —
 * its owner is alone with his screen, and seeing what he pastes beats
 * masking it (he can clear it any time from the board).
 */
function SCleOperateur({ onKeySaved }: { onKeySaved: (key: string) => void }) {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  return (
    <ScrollView contentContainerStyle={SCROLL.tabs} showsVerticalScrollIndicator={false}>
      <PageTitle>{t('operations.titre')}</PageTitle>
      <View style={{ marginTop: 14 }}>
        <Banner tone="info">{t('operations.cle_explication')}</Banner>
      </View>
      <View style={{ marginTop: 16 }}>
        <Input label={t('operations.cle_libelle')} value={draft} onChangeText={setDraft} />
      </View>
      <View style={{ marginTop: 16 }}>
        <C07BtnPrimary
          label={t('operations.cle_ouvrir')}
          icon="check"
          onPress={() => {
            if (trimmed === '') return;
            storeOpsKey(trimmed);
            onKeySaved(trimmed);
          }}
        />
      </View>
      <View style={{ marginTop: 10 }}>
        <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('operations.cle_reste_ici')}</Text>
      </View>
    </ScrollView>
  );
}

/* ─────────────────────────────── the board ───────────────────────────────── */

function SBoard({ service, opsKey, onBadKeyReset }: {
  service: OperationsServicePort | null;
  opsKey: string;
  onBadKeyReset: () => void;
}) {
  const [read, setRead] = useState<OperationsRead>(() =>
    service === null ? { kind: 'not_configured' } : { kind: 'loading' },
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const inFlight = useRef(false);
  // CONSOLE-2 — which card is mid-write, and which one refused. NEVER
  // optimistic: a call is « enregistré » only once the book says so (Law 7 —
  // queued is pending, never done). The transitions are `view.ts`'s.
  const [relanceUi, setRelanceUi] = useState<RelanceUi>(RELANCE_IDLE);
  // CONSOLE-3 — the code inventory: its own read (codes change on the
  // founder's acts, not by the minute) and its own one-at-a-time write state.
  const [codesRead, setCodesRead] = useState<CodesRead>({ kind: 'loading' });
  const [codesUi, setCodesUi] = useState<CodesUi>(CODES_IDLE);
  const [codeDraft, setCodeDraft] = useState('');

  // `force` exists because of a real defect the verifier caught: the 60-second
  // background re-read holds `inFlight`, so the re-read AFTER a successful
  // write was silently skipped and the card stayed in « À relancer » with no
  // « Appelé » line and no error — a recorded call rendered as if nothing had
  // happened, whose only human answer is to tap again and inflate his own
  // count. A write's own re-read is never skippable.
  const load = async (force = false): Promise<void> => {
    if (service === null || (inFlight.current && !force)) return;
    inFlight.current = true;
    try {
      const res = await service.listPaidOrders(opsKey);
      setNowMs(Date.now());
      if (res.ok) setRead({ kind: 'ok', rows: res.orders });
      else setRead({ kind: res.reason === 'bad_key' ? 'bad_key' : 'failed' });
    } finally {
      inFlight.current = false;
    }
  };

  /** MONOTONIC READ TOKEN (verifier MAJOR-2, the readSeq class's third
   *  application): a mint's refresh and a revoke's refresh can race, and the
   *  stale response landing last would re-render a REVOKED door as active on
   *  the one screen whose question is « who holds a door? ». Only the newest
   *  read may write the section. */
  const codesSeq = useRef(0);
  const loadCodes = async (): Promise<void> => {
    if (service === null) return;
    codesSeq.current += 1;
    const seq = codesSeq.current;
    const read = codesReadOf(await service.listCodes(opsKey).catch(() => ({ ok: false, reason: 'unreachable' } as const)));
    if (seq !== codesSeq.current) return; // a newer read owns the section
    // ONE door, one sentence: a refused key on the codes read escalates the
    // whole board, exactly as the orders read does.
    if (read.kind === 'bad_key') setRead({ kind: 'bad_key' });
    else setCodesRead(read);
  };

  const settleCodes = async (settlement: ReturnType<typeof mintSettled>): Promise<void> => {
    setCodesUi(settlement.ui);
    if (settlement.then === 'refresh') await loadCodes();
    else if (settlement.then === 'bad_key') setRead({ kind: 'bad_key' });
  };

  const creerCode = async (supplierId: string): Promise<void> => {
    if (service === null) return;
    const started = mintStart(codesUi);
    if (started === null) return;
    setCodesUi(started);
    let result;
    try {
      result = await service.mintCode(opsKey, supplierId);
    } catch {
      result = { ok: false, reason: 'unreachable' } as const;
    }
    if (result.ok) setCodeDraft('');
    await settleCodes(mintSettled(result));
  };

  const couperCode = async (supplierId: string): Promise<void> => {
    if (service === null) return;
    const started = revokeStart(codesUi, supplierId);
    if (started === null) return;
    setCodesUi(started);
    let result;
    try {
      result = await service.revokeCode(opsKey, supplierId);
    } catch {
      result = { ok: false, reason: 'unreachable' } as const;
    }
    await settleCodes(revokeSettled(supplierId, result));
  };

  // Impure substance only — every decision below is `view.ts`'s, by value.
  const relancer = async (orderId: string): Promise<void> => {
    if (service === null) return;
    const started = relanceStart(relanceUi, orderId);
    if (started === null) return; // a write is already in flight
    setRelanceUi(started);
    let settlement;
    try {
      settlement = relanceSettled(orderId, await service.recordRelance(opsKey, orderId));
    } catch {
      settlement = relanceSettled(orderId, { ok: false, reason: 'unreachable' } as const);
    }
    setRelanceUi(settlement.ui);
    if (settlement.then === 'refresh') await load(true);
    else if (settlement.then === 'bad_key') setRead({ kind: 'bad_key' });
  };

  useEffect(() => {
    void load();
    void loadCodes();
    // The board keeps itself honest without being asked: a quiet re-read every
    // minute, so an order paid while the tab sat open appears on its own and
    // the age figures stay true. One interval, cleared on unmount. (The code
    // inventory re-reads on the founder's own acts instead — codes change by
    // his hand, not by the clock.)
    const h = setInterval(() => {
      void load();
    }, REFRESH_EVERY_MS);
    return () => clearInterval(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = operationsView(read, nowMs);

  return (
    <ScrollView contentContainerStyle={SCROLL.tabs} showsVerticalScrollIndicator={false}>
      <PageTitle>{t('operations.titre')}</PageTitle>

      {view.kind === 'loading' && (
        <View style={{ marginTop: 14 }}>
          <Text style={role({ f: 'IS', w: 400, s: 13 }, P.sub)}>{t(view.message)}</Text>
        </View>
      )}

      {(view.kind === 'not_configured' || view.kind === 'empty') && (
        <View style={{ marginTop: 14 }}>
          <Banner tone="info">{t(view.message)}</Banner>
        </View>
      )}

      {view.kind === 'bad_key' && (
        <View style={{ marginTop: 14 }}>
          <Banner tone="warn">{t(view.message)}</Banner>
          <View style={{ marginTop: 14 }}>
            <C07BtnPrimary label={t('operations.cle_ressaisir')} icon="retry" onPress={onBadKeyReset} />
          </View>
        </View>
      )}

      {view.kind === 'failed' && (
        <View style={{ marginTop: 14 }}>
          <Banner tone="warn">{t(view.message)}</Banner>
          <View style={{ marginTop: 14 }}>
            <C07BtnPrimary label={t('operations.reessayer')} icon="retry" onPress={() => { void load(); }} />
          </View>
        </View>
      )}

      {view.kind === 'board' && (
        <>
          {/* ── À relancer — the founder's 10-minute line, loudest and first ── */}
          <View style={{ marginTop: 14 }}>
            <Text style={role({ f: 'BG', w: 700, s: 15 }, P.ink)}>
              {t('operations.relancer_titre')}
            </Text>
            {view.relancer.length === 0 ? (
              <View style={{ marginTop: 8 }}>
                <Banner tone="success" check>{t('operations.relancer_vide')}</Banner>
              </View>
            ) : (
              view.relancer.map((r) => (
                <CommandeCard
                  key={r.orderId}
                  row={r}
                  chase
                  action={{
                    label: t('operations.relance_action'),
                    busy: relanceUi.busy === r.orderId,
                    failed: relanceUi.echec === r.orderId,
                    locked: relanceUi.busy !== null,
                    onPress: () => { void relancer(r.orderId); },
                  }}
                />
              ))
            )}
          </View>

          {/* ── En préparation — the REAL signal: the supplier's own act.
                 « Prêt » only from an evidenced B6.2 confirmation. ── */}
          {view.preparation.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <Text style={role({ f: 'BG', w: 700, s: 15 }, P.ink)}>
                {t('operations.preparation_titre')}
              </Text>
              {view.preparation.map((r) => (
                <CommandeCard key={r.orderId} row={r} nowMs={nowMs} />
              ))}
            </View>
          )}

          {/* ── Déjà appelés — his own record of his own act. Never « prêt ». ── */}
          {view.relances.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <Text style={role({ f: 'BG', w: 700, s: 15 }, P.ink)}>
                {t('operations.relances_titre')}
              </Text>
              <View style={{ marginTop: 6 }}>
                <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>
                  {t('operations.relance_sens')}
                </Text>
              </View>
              {view.relances.map((r) => (
                <CommandeCard
                  key={r.orderId}
                  row={r}
                  called
                  nowMs={nowMs}
                  action={{
                    label: t('operations.relance_rappeler'),
                    busy: relanceUi.busy === r.orderId,
                    failed: relanceUi.echec === r.orderId,
                    locked: relanceUi.busy !== null,
                    onPress: () => { void relancer(r.orderId); },
                  }}
                />
              ))}
            </View>
          )}

          {/* ── Payées à l'instant — fresh, watching, no action yet ── */}
          <View style={{ marginTop: 22 }}>
            <Text style={role({ f: 'BG', w: 700, s: 15 }, P.ink)}>
              {t('operations.recentes_titre')}
            </Text>
            {view.recentes.length === 0 ? (
              <View style={{ marginTop: 8 }}>
                <Text style={role({ f: 'IS', w: 400, s: 13 }, P.sub)}>{t('operations.recentes_vide')}</Text>
              </View>
            ) : (
              view.recentes.map((r) => <CommandeCard key={r.orderId} row={r} />)
            )}
          </View>

          {/* ── Anomalies — a paid order this platform cannot place. Never buried. ── */}
          {view.anomalies.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <Banner tone="danger">{t('operations.anomalie_bandeau')}</Banner>
            </View>
          )}

          <View style={{ marginTop: 22 }}>
            <BtnSoft label={t('operations.actualiser')} icon="retry" onPress={() => { void load(); }} />
          </View>
        </>
      )}

      {/* ── CONSOLE-3 — Codes fournisseurs: who holds a door, since when.
             Mint warns (never blocks) on a supplier the book has never seen —
             the phantom-door footgun, closed where it fires. Present on the
             EMPTY board too: the first code is minted before the first sale. ── */}
      {(view.kind === 'board' || view.kind === 'empty') && (
        <SCodes
          read={codesRead}
          ui={codesUi}
          draft={codeDraft}
          avis={
            // the pre-flight speaks ONLY from data it truly has (verifier
            // MINOR-3): with the codes read failed, « remplace » could never
            // be said — so nothing is said, never a confidently wrong avis
            codeDraft.trim() === '' || read.kind !== 'ok' || codesRead.kind !== 'ok'
              ? null
              : mintAvis(read.rows, codesRead.codes, codeDraft.trim())
          }
          onDraft={setCodeDraft}
          onCreer={() => { void creerCode(codeDraft.trim()); }}
          onCouper={(supplierId) => { void couperCode(supplierId); }}
          onVu={() => setCodesUi(CODES_IDLE)}
          onRetry={() => { setCodesRead({ kind: 'loading' }); void loadCodes(); }}
        />
      )}

      {/* ── BC-1c — Livraisons: buyer contact from the Shop+ side, behind its
             OWN key (value C — one console, two doors, two Workers). ── */}
      {(view.kind === 'board' || view.kind === 'empty') && <SLivraisons />}
    </ScrollView>
  );
}

/* ─────────── BC-1c — the dispatch section (Shop+ read, key C) ─────────── */

/**
 * The second door of the one console. Its own key, its own honest states, the
 * same laws: nothing renders as true before the Shop+ Worker says so, only
 * the newest read writes the section, and a refused key gets its own sentence
 * and its own re-entry — never an escalation of the BOARD's door, because the
 * two keys are different credentials on different Workers.
 */
function SLivraisons() {
  const service = useMemo<DispatchServicePort | null>(() => resolveDispatchService(), []);
  const [cleC, setCleC] = useState<string | null>(() => readStoredCleC());
  const [draft, setDraft] = useState('');
  const [read, setRead] = useState<LivraisonsRead>(() =>
    service === null ? { kind: 'not_configured' } : { kind: 'loading' },
  );
  const seq = useRef(0);

  const load = async (key: string): Promise<void> => {
    if (service === null) return;
    seq.current += 1;
    const mine = seq.current;
    const res = await service.listLivraisons(key).catch(() => ({ ok: false, reason: 'unreachable' } as const));
    if (mine !== seq.current) return; // only the newest read writes the section
    if (res.ok) setRead({ kind: 'ok', rows: res.rows });
    else setRead({ kind: res.reason === 'bad_key' ? 'bad_key' : 'failed' });
  };

  useEffect(() => {
    if (cleC !== null) void load(cleC);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleC]);

  const vue = cleC === null ? null : livraisonsVue(read);

  return (
    <View style={{ marginTop: 22 }}>
      <Text style={role({ f: 'BG', w: 700, s: 15 }, P.ink)}>{t('livraisons.titre')}</Text>

      {cleC === null && (
        <>
          <View style={{ marginTop: 6 }}>
            <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('livraisons.cle_explication')}</Text>
          </View>
          <View style={{ marginTop: 10 }}>
            <Input label={t('livraisons.cle_libelle')} value={draft} onChangeText={setDraft} />
          </View>
          <View style={{ marginTop: 10 }}>
            <BtnSoft
              label={t('livraisons.cle_ouvrir')}
              icon="check"
              onPress={() => {
                const v = draft.trim();
                if (v === '') return;
                storeCleC(v);
                setRead({ kind: 'loading' });
                setCleC(v);
              }}
            />
          </View>
        </>
      )}

      {vue !== null && vue.kind === 'loading' && (
        <View style={{ marginTop: 8 }}>
          <Text style={role({ f: 'IS', w: 400, s: 13 }, P.sub)}>{t(vue.message)}</Text>
        </View>
      )}
      {vue !== null && vue.kind === 'not_configured' && (
        <View style={{ marginTop: 8 }}>
          <Banner tone="info">{t(vue.message)}</Banner>
        </View>
      )}
      {vue !== null && vue.kind === 'bad_key' && (
        <View style={{ marginTop: 8 }}>
          <Banner tone="warn">{t(vue.message)}</Banner>
          <View style={{ marginTop: 10 }}>
            <BtnSoft
              label={t('livraisons.cle_ressaisir')}
              icon="retry"
              onPress={() => {
                clearStoredCleC();
                setDraft('');
                setCleC(null);
              }}
            />
          </View>
        </View>
      )}
      {vue !== null && vue.kind === 'failed' && (
        <View style={{ marginTop: 8 }}>
          <Banner tone="warn">{t(vue.message)}</Banner>
          <View style={{ marginTop: 10 }}>
            <BtnSoft label={t('operations.reessayer')} icon="retry" onPress={() => { if (cleC !== null) void load(cleC); }} />
          </View>
        </View>
      )}
      {vue !== null && vue.kind === 'empty' && (
        <View style={{ marginTop: 8 }}>
          <Banner tone="info">{t(vue.message)}</Banner>
        </View>
      )}

      {vue !== null && vue.kind === 'liste' && (
        <>
          <View style={{ marginTop: 8 }}>
            <Text style={role({ f: 'IS', w: 600, s: 13 }, P.ink)}>{t('livraisons.a_livrer_titre')}</Text>
          </View>
          {vue.aLivrer.length === 0 ? (
            <View style={{ marginTop: 6 }}>
              <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('livraisons.a_livrer_vide')}</Text>
            </View>
          ) : (
            vue.aLivrer.map((r) => <CarteLivraison key={r.orderId} row={r} />)
          )}
          {vue.sansContact.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Banner tone="warn">{t('livraisons.sans_contact').replace('{n}', String(vue.sansContact.length))}</Banner>
            </View>
          )}
          {vue.enAttente.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>
                {t('livraisons.en_attente').replace('{n}', String(vue.enAttente.length))}
              </Text>
            </View>
          )}
          <View style={{ marginTop: 12 }}>
            <BtnSoft label={t('operations.actualiser')} icon="retry" onPress={() => { if (cleC !== null) void load(cleC); }} />
          </View>
        </>
      )}
    </View>
  );
}

/** One course: the quartier LOUDEST (it is where the rider goes), then the
 *  number — big, selectable — then the repère in the buyer's own words. */
function CarteLivraison({ row }: { row: LivraisonRow }) {
  return (
    <Card variant="Llist" style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text style={role({ f: 'BG', w: 700, s: 15 }, P.ink)} numberOfLines={1}>
          {row.contact?.quartier ?? row.zoneTo}
        </Text>
        <Text style={role({ f: 'IS', w: 400, s: 11 }, P.sub)}>{row.createdAt.slice(0, 10)}</Text>
      </View>
      {row.contact !== null && (
        <>
          <Text style={[role({ f: 'BG', w: 800, s: 18 }, P.ink), { marginTop: 4 }]} selectable>
            {row.contact.phone}
          </Text>
          {row.contact.repere !== '' && (
            <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginTop: 2 }]}>{row.contact.repere}</Text>
          )}
        </>
      )}
      <Text style={[role({ f: 'IS', w: 400, s: 11 }, P.sub), { marginTop: 4 }]} numberOfLines={1}>
        {row.orderId}
      </Text>
    </Card>
  );
}

/* ───────────────── CONSOLE-3 — the code inventory section ────────────────── */

/**
 * The founder's door registry, on the board he already trusts. Calm registers:
 * a fresh code is a HANDOVER moment — it renders big, with the one sentence
 * that matters (« il ne s'affichera plus »), and leaves only when he says so.
 * One write at a time, nothing shown as done before the book answers.
 */
function SCodes({ read, ui, draft, avis, onDraft, onCreer, onCouper, onVu, onRetry }: {
  read: CodesRead;
  ui: CodesUi;
  draft: string;
  avis: ReturnType<typeof mintAvis> | null;
  onDraft: (v: string) => void;
  onCreer: () => void;
  onCouper: (supplierId: string) => void;
  onVu: () => void;
  onRetry: () => void;
}) {
  const vue = codesView(read);
  if (vue === null) return null; // bad_key escalated the whole board already
  return (
    <View style={{ marginTop: 22 }}>
      <Text style={role({ f: 'BG', w: 700, s: 15 }, P.ink)}>{t('operations.codes_titre')}</Text>
      <View style={{ marginTop: 6 }}>
        <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('operations.codes_sens')}</Text>
      </View>

      {vue.kind === 'loading' && (
        <View style={{ marginTop: 8 }}>
          <Text style={role({ f: 'IS', w: 400, s: 13 }, P.sub)}>{t(vue.message)}</Text>
        </View>
      )}
      {vue.kind === 'failed' && (
        <View style={{ marginTop: 8 }}>
          <Banner tone="warn">{t(vue.message)}</Banner>
          <View style={{ marginTop: 8 }}>
            <BtnSoft label={t('operations.reessayer')} icon="retry" onPress={onRetry} />
          </View>
        </View>
      )}
      {vue.kind === 'empty' && (
        <View style={{ marginTop: 8 }}>
          <Banner tone="info">{t(vue.message)}</Banner>
        </View>
      )}
      {vue.kind === 'liste' &&
        vue.codes.map((c) => (
          <Card key={c.supplierId} variant="Llist" style={{ marginTop: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1, paddingRight: 10 }}>
                <Text style={role({ f: 'BG', w: 700, s: 14 }, P.ink)} numberOfLines={1}>{c.supplierId}</Text>
                <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginTop: 2 }]}>
                  {t('operations.code_cree_le').replace('{d}', c.mintedAt.slice(0, 10))}
                </Text>
              </View>
              {ui.busy === `revoke:${c.supplierId}` ? (
                <Text style={role({ f: 'IS', w: 600, s: 12 }, P.sub)}>{t('operations.code_coupure_encours')}</Text>
              ) : ui.nouveau !== null ? (
                // a live one-time code blocks every other act — in words, never
                // a dead tap (verifier MAJOR-1)
                <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('operations.code_noter_dabord')}</Text>
              ) : (
                <BtnSoft label={t('operations.code_couper')} onPress={() => onCouper(c.supplierId)} />
              )}
            </View>
            {ui.echec === `revoke:${c.supplierId}` && (
              <View style={{ marginTop: 6 }}>
                <Text style={role({ f: 'IS', w: 600, s: 12 }, P.warnFg)}>{t('operations.code_coupure_echec')}</Text>
              </View>
            )}
          </Card>
        ))}

      {ui.nouveau !== null && (
        <Card variant="Llist" style={{ marginTop: 10 }}>
          <Text style={role({ f: 'IS', w: 600, s: 12 }, P.sub)}>
            {t('operations.code_nouveau_pour').replace('{id}', ui.nouveau.supplierId)}
          </Text>
          <Text style={[role({ f: 'BG', w: 800, s: 22 }, P.ink), { marginTop: 6 }]} selectable>
            {ui.nouveau.code}
          </Text>
          <View style={{ marginTop: 6 }}>
            <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('operations.code_nouveau_note')}</Text>
          </View>
          <View style={{ marginTop: 10 }}>
            <BtnSoft label={t('operations.code_nouveau_vu')} icon="check" onPress={onVu} />
          </View>
        </Card>
      )}

      <View style={{ marginTop: 14 }}>
        <Input label={t('operations.code_saisie')} value={draft} onChangeText={onDraft} />
      </View>
      {avis === 'inconnu' && (
        <View style={{ marginTop: 8 }}>
          <Banner tone="warn">{t('operations.code_avis_inconnu')}</Banner>
        </View>
      )}
      {avis === 'remplace' && (
        <View style={{ marginTop: 8 }}>
          <Banner tone="info">{t('operations.code_avis_remplace')}</Banner>
        </View>
      )}
      <View style={{ marginTop: 10 }}>
        {ui.busy === 'mint' ? (
          <Text style={role({ f: 'IS', w: 600, s: 13 }, P.sub)}>{t('operations.code_creation_encours')}</Text>
        ) : ui.nouveau !== null ? (
          <Text style={role({ f: 'IS', w: 400, s: 13 }, P.sub)}>{t('operations.code_noter_dabord')}</Text>
        ) : (
          <BtnSoft
            label={t('operations.code_creer')}
            icon="check"
            onPress={() => {
              if (draft.trim() === '') return;
              onCreer();
            }}
          />
        )}
        {ui.echec === 'mint' && (
          <View style={{ marginTop: 6 }}>
            <Text style={role({ f: 'IS', w: 600, s: 12 }, P.warnFg)}>{t('operations.code_creation_echec')}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

/**
 * One paid order, one card, the five facts the founder acts on: what was sold,
 * for which supplier, toward which quartier, what the supplier's own number
 * is, and HOW LONG it has waited. The age is the biggest figure on a chase
 * card because the age is why he is looking.
 */
function CommandeCard({ row, chase, called, nowMs, action }: {
  row: OperationsRow;
  chase?: boolean;
  called?: boolean;
  nowMs?: number;
  /** `locked`: ANOTHER card is writing. Its button goes quiet rather than
   *  staying lit and doing nothing — a dead tap on this screen would teach
   *  the founder that the board ignores him. */
  action?: { label: string; busy: boolean; failed: boolean; locked: boolean; onPress: () => void };
}) {
  const nom = row.productName !== '' ? row.productName : row.productVersionId;
  const modeLabel = row.paymentMode === 'DELIVERY_FEE_PREPAID_PRODUCT_AT_DOOR'
    ? t('operations.mode_porte')
    : t('operations.mode_paye');
  return (
    <Card variant="Llist" style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={role({ f: 'BG', w: 700, s: 14 }, P.ink)} numberOfLines={1}>{nom}</Text>
          <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginTop: 2 }]} numberOfLines={1}>
            {row.supplierResolved ? row.supplierId : t('operations.fournisseur_inconnu')} · {row.zoneTo}
          </Text>
          <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginTop: 2 }]}>
            {modeLabel} · {formatF(row.sellerBasePrice)}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={role({ f: 'BG', w: 800, s: chase === true ? 20 : 15 }, chase === true ? P.warnFg : P.ink)}>
            {row.ageMin < 60 ? t('operations.age_min').replace('{n}', String(row.ageMin)) : t('operations.age_long')}
          </Text>
          {chase === true && (
            <Text style={[role({ f: 'IS', w: 600, s: 11 }, P.warnFg), { marginTop: 2 }]}>
              {t('operations.appeler')}
            </Text>
          )}
        </View>
      </View>

      {row.fulfillment !== undefined && (
        <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center' }}>
          <Text style={role({ f: 'IS', w: 700, s: 12 }, P.ink)}>
            {row.fulfillment.readyAt !== undefined ? t('operations.prep_pret') : t('operations.prep_accepte')}
          </Text>
          <Text style={[role({ f: 'IS', w: 400, s: 12 }, P.sub), { marginLeft: 6 }]}>
            {prepSentence(row.fulfillment.readyAt ?? row.fulfillment.acceptedAt ?? '', nowMs ?? Date.now())}
          </Text>
        </View>
      )}

      {called === true && row.relance !== undefined && (
        <View style={{ marginTop: 8 }}>
          <Text style={role({ f: 'IS', w: 600, s: 12 }, P.sub)}>
            {relanceSentence(row.relance.at, nowMs ?? Date.now())}
            {row.relance.count > 1 ? ` · ${t('operations.relance_fois').replace('{n}', String(row.relance.count))}` : ''}
          </Text>
        </View>
      )}

      {action !== undefined && (
        <View style={{ marginTop: 10 }}>
          {action.busy ? (
            <Text style={role({ f: 'IS', w: 600, s: 13 }, P.sub)}>{t('operations.relance_encours')}</Text>
          ) : action.locked ? (
            <Text style={role({ f: 'IS', w: 400, s: 13 }, P.sub)}>{t('operations.relance_attendre')}</Text>
          ) : (
            <BtnSoft label={action.label} icon="check" onPress={action.onPress} />
          )}
          {action.failed && (
            <View style={{ marginTop: 6 }}>
              <Text style={role({ f: 'IS', w: 600, s: 12 }, P.warnFg)}>{t('operations.relance_echec')}</Text>
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

/** « À l'instant » → « il y a X min » → past the hour, no invented precision —
 *  the same honest clock the relance sentence uses, for the supplier's act. */
function prepSentence(atIso: string, nowMs: number): string {
  const min = ageMinutes(atIso, nowMs);
  if (min < 1) return t('operations.prep_maintenant');
  return min < 60
    ? t('operations.prep_depuis').replace('{n}', String(min))
    : t('operations.prep_depuis_long');
}

/**
 * « Appelé à l'instant » → « Appelé il y a X min » → past the hour, no
 * invented precision. The zero-minute branch is not an edge case: it is the
 * FIRST sentence he reads after tapping, the confirmation beat of his own
 * act, and « il y a 0 min » reads there like a glitch.
 */
function relanceSentence(atIso: string, nowMs: number): string {
  const min = ageMinutes(atIso, nowMs);
  if (min < 1) return t('operations.relance_faite_maintenant');
  return min < 60
    ? t('operations.relance_faite').replace('{n}', String(min))
    : t('operations.relance_faite_long');
}

export { CHASE_AFTER_MIN };
