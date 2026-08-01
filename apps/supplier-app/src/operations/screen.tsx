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
  CHASE_AFTER_MIN,
  RELANCE_IDLE,
  ageMinutes,
  operationsView,
  relanceSettled,
  relanceStart,
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
    // The board keeps itself honest without being asked: a quiet re-read every
    // minute, so an order paid while the tab sat open appears on its own and
    // the age figures stay true. One interval, cleared on unmount.
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
    </ScrollView>
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
