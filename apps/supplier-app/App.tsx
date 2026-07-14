import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { assertQuoteReconciles, computeWaterfall } from '@platform/contracts';
import { C, ts, D, R, MONEY_TEXT } from './src/ui/fp';
import { IS_PREVIEW } from './src/preview';
import { t } from './src/i18n';
import { JOURNEY, START, type Screen } from './src/journey';
import { DurableQueue } from './src/offline/queue';
import { expoDocumentStore } from './src/offline/expoStore';
import { mintCommandId } from './src/offline/commandId';
import {
  addDemoProduct,
  baselineQuote,
  createDemoWorld,
  formatFcfa,
  markCorrected,
  type DemoProduct,
  type DemoReceivable,
  type DemoWorld,
  type ModerationState,
} from './src/demo/store';
import { presentTrustConsequence, statementFigures } from './src/trust/statement';
import { captureShot, type CaptureResult } from './src/studio/capture';
import { failureDetailOf, type CaptureFailureDetail } from './src/studio/normalization';
import { CAPTURE_CATEGORIES, frameGuideKey, type CaptureCategory, type ShotKind } from './src/studio/guidance';
import {
  AmountHero,
  AppHeader,
  Card,
  CelebrationLayer,
  CheckRow,
  CornerTicks,
  DuotoneTile,
  EmptyState,
  GhostButton,
  HeroLedgerBand,
  Icon,
  ListRow,
  MoneyField,
  OfflineBanner,
  Overline,
  PendingNotice,
  PrimaryButton,
  QuoteRule,
  ReconcileLine,
  ScreenEnter,
  SecondaryButton,
  Selectable,
  Skeleton,
  StatusChip,
  TabBar,
  UnderlineLink,
  useCountUp,
  WarnNote,
  type ChipTone,
  type IconName,
} from './src/ui/kit';

/**
 * WO-FP-BOUTIK — LE VISAGE, Faso Premium. The same walkable world as WO-4.1/6.0
 * (journey spine, back law, money from the pinned waterfall, the durable offline
 * queue, the real settlement/moderation/trust read models — all byte-identical,
 * FROZEN), now dressed in the redesign: the woven band, warm paper, one
 * supply-green accent, money in Bricolage majesty with count-up, the six
 * signature elements. The navigation SEMANTICS and every franc are untouched;
 * this slice is render code only. ZERO emoji in chrome (canon icon set).
 */

const E1_B = 10_000;
const E1_C = 1_000;

// B6 « sous le plancher » — the seller's base price B has a floor. The value is
// the canon Build Spec's committed MINIMUM (B+4: « category floor >=5,000 FCFA »).
const CATEGORY_FLOOR_FCFA = 5_000;

// The WO-1.4 direct-canon-root proof stays live: the offre screen computes its
// preview through the pinned waterfall at render time.
function livePreviewNet(priceB: number, commissionC: number): number {
  const money = computeWaterfall({
    sellerBasePrice: priceB,
    sellerFundedCommission: commissionC,
    resellerMarkup: 0,
    deliveryFee: 0,
    paymentMode: 'FULL_PREPAY',
  });
  assertQuoteReconciles(money);
  return money.sellerNet;
}

const STATUS_KEY: Record<DemoProduct['status'], string> = {
  pret: 'statut.pret',
  en_attente: 'statut.en_attente',
  refuse_correctable: 'statut.refuse',
  correction_en_cours: 'statut.correction',
  echeance_depassee: 'statut.echeance',
};
// FP chip tones: `fact` (server-confirmed ready = ok green), `pending` (in-flight
// warn), `problem` (refusal danger) — never a green fill before server truth.
const STATUS_TONE: Record<DemoProduct['status'], ChipTone> = {
  pret: 'fact',
  en_attente: 'pending',
  refuse_correctable: 'problem',
  correction_en_cours: 'pending',
  echeance_depassee: 'problem',
};

/** The bottom hubs (WO-4.2R): Accueil · Produits · Échéances. */
const HUBS: readonly Screen[] = ['accueil', 'produits', 'echeances'];

// The tab glyphs. `echeances` → horloge (in the canon set). `accueil` + `produits`
// glyphs are forward-names awaiting a canon icon-set fill (home/tag are not in the
// 26-glyph set): the TOLERANT Icon renders nothing for them — never a lookalike —
// and the icon+word law is met by the word. Tombstone documented in JOURNAL.
const TAB_ICON: Record<'accueil' | 'produits' | 'echeances', IconName> = {
  accueil: 'accueil' as unknown as IconName,
  produits: 'produits' as unknown as IconName,
  echeances: 'horloge',
};

const SCREEN_TITLE_KEY: Record<Screen, string> = {
  accueil: 'app.title',
  onboarding: 'accueil.card_onboarding',
  produits: 'produits.title',
  nouveau: 'product.title',
  photo: 'photo.title',
  offre: 'offer.title',
  pret: 'ready.action',
  corrective: 'corrective.walk_title',
  echeances: 'echeances.title',
  recettes: 'recettes.title',
  moderation: 'moderation.title',
  confiance: 'confiance.title',
};

// B11 (A1) — the REAL moderationState → chip + honest line (canon: submitted →
// changes_requested → approved; B2.2: timeout = pending). A timeout renders « en
// attente », never a fake « approuvé »; changes_requested lists its reasons.
const MODERATION: Record<ModerationState, { tone: ChipTone; label: string; line: string }> = {
  approved: { tone: 'fact', label: 'moderation.chip_approuve', line: 'moderation.approuve' },
  submitted: { tone: 'pending', label: 'moderation.chip_soumis', line: 'moderation.en_revue' },
  pending: { tone: 'pending', label: 'moderation.chip_attente', line: 'moderation.en_attente' },
  changes_requested: { tone: 'problem', label: 'moderation.chip_modifs', line: 'moderation.modifs' },
};

// B10 (B1) — the REAL settlement state → chip + honest money-register line. The
// pre-Paid states read « en attente » (calm); Paid appears ONLY with a provider ref.
const RECEIVABLE_STATE: Record<DemoReceivable['obligation']['state'], { tone: ChipTone; label: string; line: string }> = {
  Locked: { tone: 'pending', label: 'recettes.chip_attente', line: 'recettes.state_attente' },
  Pending: { tone: 'pending', label: 'recettes.chip_attente', line: 'recettes.state_attente' },
  Eligible: { tone: 'pending', label: 'recettes.chip_attente', line: 'recettes.state_attente' },
  Payable: { tone: 'pending', label: 'recettes.chip_bientot', line: 'recettes.state_bientot' },
  Processing: { tone: 'pending', label: 'recettes.chip_encours', line: 'recettes.state_encours' },
  Paid: { tone: 'fact', label: 'recettes.chip_verse', line: 'recettes.state_verse' },
  Held: { tone: 'problem', label: 'recettes.chip_revision', line: 'recettes.state_revision' },
  Failed: { tone: 'problem', label: 'recettes.chip_echec', line: 'recettes.state_echec' },
};

/** A money hero that counts up over 800 ms (README § Motion) and renders through
 * the frozen formatter. Re-runs when the amount changes or the tab is entered. */
function MoneyHero({ label, amount, note, pending }: { label?: string | undefined; amount: number; note?: string | undefined; pending?: boolean | undefined }) {
  const shown = useCountUp(amount);
  return <AmountHero label={label} amount={t('money.amount_f').replace('{amount}', formatFcfa(shown))} note={note} pending={pending} />;
}

export default function App() {
  const [world, setWorld] = useState<DemoWorld>(() => createDemoWorld());
  const [stack, setStack] = useState<Screen[]>([START]);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [priceInput, setPriceInput] = useState(String(E1_B));
  const [commissionInput, setCommissionInput] = useState(String(E1_C));
  const [reoffer, setReoffer] = useState(false);
  const [b7Phase, setB7Phase] = useState<'ready' | 'pending' | 'queued' | 'confirmed' | 'queue_error'>('ready');
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [confirmNet, setConfirmNet] = useState(0);
  const [offline, setOffline] = useState(false);
  const queueRef = useRef<DurableQueue | null>(null);
  const [queuedCount, setQueuedCount] = useState(0);
  const [category, setCategory] = useState<CaptureCategory>('mode');
  const [shot, setShotKind] = useState<ShotKind>('hero');
  const [shots, setShots] = useState<Partial<Record<ShotKind, CaptureResult>>>({});
  const [pending, setPending] = useState<CaptureResult | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [failureDetail, setFailureDetail] = useState<CaptureFailureDetail | null>(null);
  const cameraRef = useRef<CameraView | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const screen = stack[stack.length - 1] ?? START;

  const go = useCallback((next: Screen) => {
    if (!JOURNEY[stack[stack.length - 1] ?? START].includes(next)) return;
    setStack((s) => [...s, next]);
  }, [stack]);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const reset = useCallback(() => {
    setWorld(createDemoWorld());
    setStack([START]);
    setPendingKey(null);
    setCelebrating(false);
    setCategory('mode');
    setShotKind('hero');
    setShots({});
    setPending(null);
    setCapturing(false);
    setFailureDetail(null);
    setOffline(false);
    setPriceInput(String(E1_B));
    setReoffer(false);
    setB7Phase('ready');
    setCheck1(false);
    setCheck2(false);
    setConfirmNet(0);
  }, []);
  const enterReady = useCallback((net: number) => {
    setConfirmNet(net);
    setB7Phase('ready');
    setCheck1(false);
    setCheck2(false);
  }, []);
  useEffect(() => {
    let alive = true;
    void DurableQueue.open(expoDocumentStore()).then((q) => {
      if (!alive) return;
      queueRef.current = q;
      setQueuedCount(q.pending().length);
    });
    return () => {
      alive = false;
    };
  }, []);
  const confirmReady = useCallback(() => {
    if (!(check1 && check2)) return;
    if (offline) {
      const q = queueRef.current;
      if (q === null) {
        setB7Phase('queue_error');
        return;
      }
      let commandId: string;
      try {
        commandId = mintCommandId();
      } catch {
        setB7Phase('queue_error');
        return;
      }
      void q.enqueue(commandId, 'fulfillment.ready.v1', { net: confirmNet }).then((result) => {
        if (result.outcome === 'collision') {
          setB7Phase('queue_error');
          return;
        }
        setB7Phase('queued');
        setQueuedCount(q.pending().length);
      });
      return;
    }
    setB7Phase('pending');
  }, [check1, check2, offline, confirmNet]);
  const flushQueue = useCallback(() => {
    void queueRef.current?.deliver(async () => {}).then(() => setQueuedCount(queueRef.current?.pending().length ?? 0));
  }, []);
  const finishConfirmation = useCallback(() => {
    setB7Phase('confirmed');
    setCelebrating(true);
  }, []);
  const resetB7 = useCallback(() => {
    setB7Phase('ready');
    setCheck1(false);
    setCheck2(false);
    setCelebrating(false);
  }, []);
  const skipPhoto = useCallback(() => {
    setReoffer(false);
    go('offre');
  }, [go]);
  const takeShot = useCallback(async () => {
    const camera = cameraRef.current;
    if (camera === null || capturing) return;
    setCapturing(true);
    setFailureDetail(null);
    try {
      setPending(await captureShot(camera));
    } catch (error) {
      setFailureDetail(failureDetailOf(error));
    } finally {
      setCapturing(false);
    }
  }, [capturing]);
  const keepShot = useCallback(() => {
    if (pending === null) return;
    setShots((s) => ({ ...s, [shot]: pending }));
    setPending(null);
    if (shot === 'hero') {
      setShotKind('preuve');
      return;
    }
    setPendingKey('studio.queue_pending');
    setReoffer(false);
    go('offre');
  }, [pending, shot, go]);
  const toHub = useCallback((hub: Screen) => {
    setStack(hub === START ? [START] : [START, hub]);
  }, []);
  const endCelebration = useCallback(() => setCelebrating(false), []);

  const refused = world.products.find((p) => p.status === 'refuse_correctable');
  const clocks = world.products.filter((p) => p.correctionMinLeft !== undefined);
  const enLigne = world.products.filter((p) => p.status === 'pret').length;
  const receivables = world.receivables;
  const trust = presentTrustConsequence(world.trust);
  const statementFig = statementFigures(world.statement);
  const urgent = world.products.some(
    (p) => p.status === 'echeance_depassee' || (p.correctionMinLeft !== undefined && p.correctionMinLeft <= 60),
  );
  const aCorriger = world.products.filter(
    (p) => p.status === 'refuse_correctable' || p.status === 'echeance_depassee',
  ).length;
  useMemo(() => baselineQuote(), []);

  const priceB = Number.parseInt(priceInput, 10) || 0;
  const offerC = Number.parseInt(commissionInput, 10) || 0;
  const priceBelowFloor = priceB < CATEGORY_FLOOR_FCFA;
  const rawNet = priceBelowFloor ? 0 : livePreviewNet(priceB, offerC);
  const partSwallowsNet = !priceBelowFloor && rawNet <= 0;
  const belowMin = priceBelowFloor || partSwallowsNet;
  const belowFloor = priceB > 0 && priceBelowFloor;
  const offerNet = belowMin ? 0 : rawNet;
  const offerFee = belowMin ? 0 : priceB - offerC - offerNet;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" backgroundColor={C.paper} />
      {IS_PREVIEW && (
        <View style={styles.previewBanner}>
          <Text style={ts('caps', C.warnFgAlt)}>{t('preview.banner')}</Text>
        </View>
      )}

      <AppHeader
        title={t(SCREEN_TITLE_KEY[screen])}
        context={screen === 'accueil' ? t('accueil.tagline') : undefined}
        backLabel={`← ${t('nav.retour')}`}
        onBack={stack.length > 1 ? back : undefined}
        right={
          screen === 'accueil' ? (
            <Pressable onPress={() => go('confiance')} accessibilityRole="button">
              <StatusChip tone="fact" label={t('confiance.title')} icon="scelle" />
            </Pressable>
          ) : undefined
        }
      />
      {offline && <OfflineBanner label={t('shell.offline')} />}

      <ScreenEnter screenKey={screen}>
      <View style={styles.content}>
        {screen === 'accueil' && (
          <ScrollView contentContainerStyle={styles.scrollFlow} showsVerticalScrollIndicator={false}>
            <View style={styles.stackGap}>
              <Text style={ts('screen', C.ink)}>{t('accueil.card_produits')}</Text>
              {refused !== undefined && (
                <Pressable style={styles.refuseBanner} onPress={() => go('corrective')} accessibilityRole="button">
                  <StatusChip tone="problem" label={t('statut.refuse')} icon="refus" />
                  <Text style={[ts('row', C.ink), styles.flex1]}>{t('accueil.refuse_banner')}</Text>
                </Pressable>
              )}
              {urgent && (
                <Pressable style={styles.urgentBanner} onPress={() => go('echeances')} accessibilityRole="button">
                  <Icon name="horloge" size={18} color={C.warnFgAlt} />
                  <Text style={[ts('row', C.ink), styles.flex1]}>{t('accueil.urgent_banner')}</Text>
                </Pressable>
              )}
              <View style={styles.statGrid}>
                <Card style={styles.statCard}>
                  <Overline>{t('accueil.stat_en_ligne')}</Overline>
                  <Text style={[ts('cardMoney', C.ink), MONEY_TEXT]}>{enLigne}</Text>
                </Card>
                <Card style={styles.statCard}>
                  <Overline>{t('accueil.stat_a_corriger')}</Overline>
                  <Text style={[ts('cardMoney', aCorriger > 0 ? C.dangerFg : C.ink), MONEY_TEXT]}>{aCorriger}</Text>
                </Card>
              </View>
              <HeroLedgerBand
                label={t('accueil.stat_en_ligne')}
                amount={t('money.amount_f').replace('{amount}', formatFcfa(statementFig.pending))}
                sub={t('recettes.state_verse')}
              />
              <PrimaryButton label={t('accueil.card_nouveau')} onPress={() => go('nouveau')} icon="colis" />
              <SecondaryButton label={t('accueil.card_produits')} onPress={() => go('produits')} />
              <View style={styles.accueilLinks}>
                <UnderlineLink label={t('accueil.card_echeances')} onPress={() => go('echeances')} />
                <UnderlineLink label={t('recettes.title')} onPress={() => go('recettes')} />
                <UnderlineLink label={t('moderation.title')} onPress={() => go('moderation')} />
                <UnderlineLink label={t('accueil.card_onboarding')} onPress={() => go('onboarding')} />
              </View>
            </View>
          </ScrollView>
        )}

        {screen === 'onboarding' && (
          <Card>
            <Text style={ts('body', C.ink)}>{t('onboarding.free_listing')}</Text>
            <PrimaryButton
              label={t('onboard.action')}
              onPress={() => {
                setPendingKey('onboard.phone_pending');
                go('produits');
              }}
            />
          </Card>
        )}

        {screen === 'produits' && (
          <View style={styles.listWrap}>
            {world.products.length === 0 ? (
              <EmptyState
                icon="colis"
                title={t('produits.vide')}
                action={<PrimaryButton label={t('accueil.card_nouveau')} onPress={() => go('nouveau')} />}
              />
            ) : (
              <>
                <FlatList
                  data={world.products}
                  keyExtractor={(p) => p.id}
                  numColumns={2}
                  columnWrapperStyle={styles.gridRow}
                  initialNumToRender={6}
                  windowSize={5}
                  contentContainerStyle={styles.listContent}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.tile}
                      onPress={() => {
                        if (item.status === 'refuse_correctable') {
                          go('corrective');
                          return;
                        }
                        setReoffer(true);
                        go('offre');
                      }}
                      accessibilityRole="button"
                    >
                      <View>
                        <DuotoneTile label={item.name} />
                        <View style={styles.tileBadge}>
                          <StatusChip tone={STATUS_TONE[item.status]} label={t(STATUS_KEY[item.status])} />
                        </View>
                      </View>
                      <View style={styles.tileBody}>
                        <Text style={ts('row', C.ink)} numberOfLines={1}>
                          {item.name}
                        </Text>
                        <Text style={[ts('priceInline', C.deep), MONEY_TEXT]}>
                          {t('produits.net_ligne').replace('{amount}', formatFcfa(item.money.sellerNet))}
                        </Text>
                      </View>
                    </Pressable>
                  )}
                />
                <PrimaryButton label={t('accueil.card_nouveau')} onPress={() => go('nouveau')} />
              </>
            )}
          </View>
        )}

        {screen === 'nouveau' && (
          <Card>
            <Text style={ts('body', C.ink)}>{t('product.title')}</Text>
            <Overline>{t('studio.categorie')}</Overline>
            <View style={styles.chipRow}>
              {CAPTURE_CATEGORIES.map((c) => (
                <Selectable
                  key={c}
                  selected={category === c}
                  onPress={() => setCategory(c)}
                  accessibilityLabel={t(`categorie.${c}`)}
                  style={styles.categoryChip}
                >
                  <Text style={ts('row', category === c ? C.deep : C.ink)}>{t(`categorie.${c}`)}</Text>
                </Selectable>
              ))}
            </View>
            <PrimaryButton label={t('product.photo_action')} onPress={() => go('photo')} icon="camera" />
          </Card>
        )}

        {screen === 'photo' && permission === null && <Skeleton style={styles.cameraFrame} />}

        {screen === 'photo' && permission !== null && !permission.granted && permission.canAskAgain && (
          <Card>
            <View style={styles.photoFrame}>
              <CornerTicks colour={C.hairlineStrong} inset={10} />
              <Icon name="camera" size={28} color={C.sub} />
              <Text style={[ts('body', C.sub), styles.center]}>{t('studio.permission')}</Text>
            </View>
            <PrimaryButton label={t('studio.autoriser')} onPress={() => void requestPermission()} />
            <UnderlineLink label={t('studio.sans_photo')} onPress={skipPhoto} />
          </Card>
        )}

        {screen === 'photo' && permission !== null && !permission.granted && !permission.canAskAgain && (
          <Card>
            <View style={styles.photoFrame}>
              <CornerTicks colour={C.hairlineStrong} inset={10} />
              <Icon name="camera" size={28} color={C.sub} />
              <Text style={[ts('body', C.sub), styles.center]}>{t('studio.refusee')}</Text>
            </View>
            <PrimaryButton label={t('studio.sans_photo')} onPress={skipPhoto} />
            <UnderlineLink label={t('studio.autoriser')} onPress={() => void requestPermission()} />
          </Card>
        )}

        {screen === 'photo' && permission !== null && permission.granted && pending === null && (
          <View style={styles.cameraScreen}>
            <CameraView ref={cameraRef} style={styles.camera} facing="back">
              <CornerTicks colour={C.onPrimary} inset={20} />
              <View style={styles.guideBanner} pointerEvents="none">
                <Text style={[ts('bodyStrong', C.onPrimary), styles.center]}>{t(frameGuideKey(category, shot))}</Text>
                <Text style={[ts('caps', C.soft), styles.center]}>
                  {t(shot === 'hero' ? 'studio.shot_hero' : 'studio.shot_preuve')}
                </Text>
                <View style={styles.categoryRecall}>
                  <Text style={ts('caps', C.deep)}>{t(`categorie.${category}`)}</Text>
                </View>
              </View>
              <View style={styles.captureOverlay}>
                {failureDetail !== null && <StatusChip tone="problem" label={t('studio.erreur')} icon="refus" />}
                {IS_PREVIEW && failureDetail !== null && (
                  <View style={styles.failureDetailPill}>
                    <Text style={ts('caps', C.onPrimary)}>{t('studio.erreur_detail').replace('{code}', failureDetail)}</Text>
                  </View>
                )}
                <View style={styles.captureButtonWrap}>
                  <PrimaryButton label={t('studio.capture')} onPress={() => void takeShot()} disabled={capturing} icon="camera" />
                </View>
              </View>
            </CameraView>
          </View>
        )}

        {screen === 'photo' && pending !== null && (
          <View style={styles.stackGap}>
            <Card accent>
              <Overline>{t('studio.apercu')}</Overline>
              <View style={styles.premiumFrame}>
                <Image
                  source={{ uri: pending.derivative.uri }}
                  style={styles.previewImage}
                  resizeMode="cover"
                  accessibilityIgnoresInvertColors
                />
                <CornerTicks colour={C.onPrimary} inset={8} />
              </View>
              <Text style={[ts('body', C.sub), styles.center]}>
                {t(pending.guidance.verdict === 'advice' ? 'studio.conseil.lumiere' : 'studio.conseil.ok')}
              </Text>
            </Card>
            <View style={styles.retakeRow}>
              <View style={styles.retakeHalf}>
                <SecondaryButton label={t('studio.reprendre')} onPress={() => setPending(null)} />
              </View>
              <View style={styles.retakeHalf}>
                <PrimaryButton label={t('studio.confirmer')} onPress={keepShot} />
              </View>
            </View>
          </View>
        )}

        {screen === 'offre' && (
          <KeyboardAvoidingView style={styles.offerAvoider} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <ScrollView
              contentContainerStyle={styles.scrollFlow}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.stackGap}>
                {reoffer && (
                  <View style={styles.v2Banner}>
                    <Text style={ts('body', C.body)}>{t('offre.v2')}</Text>
                  </View>
                )}
                <Card>
                  {shots.hero !== undefined && shots.preuve !== undefined && (
                    <StatusChip tone="fact" label={t('studio.photos_pretes')} icon="coche" />
                  )}
                  <MoneyField
                    label={t('offre.champ_prix')}
                    value={priceInput}
                    suffix={t('money.franc')}
                    onChangeText={(txt) => setPriceInput(txt.replace(/[^0-9]/g, ''))}
                  />
                  <MoneyField
                    label={t('offre.champ_commission')}
                    value={commissionInput}
                    suffix={t('money.franc')}
                    onChangeText={(txt) => setCommissionInput(txt.replace(/[^0-9]/g, ''))}
                  />
                  <Text style={ts('rowSub', C.sub)}>{t('offre.commission_aide')}</Text>
                  {belowFloor && <WarnNote text={t('offer.floor_block')} />}
                  <MoneyHero label={t('offer.net_label')} amount={offerNet} pending={belowMin} />
                  {!belowMin && (
                    <ReconcileLine>
                      {t('offre.reconcile')
                        .replace('{net}', formatFcfa(offerNet))
                        .replace('{prix}', formatFcfa(priceB))
                        .replace('{part}', formatFcfa(offerC))
                        .replace('{frais}', formatFcfa(offerFee))}
                    </ReconcileLine>
                  )}
                  <PrimaryButton
                    label={t('offre.publier')}
                    money
                    disabled={belowMin}
                    disabledLabel={partSwallowsNet ? t('offer.part_too_high') : t('offer.floor_block')}
                    onPress={() => {
                      addDemoProduct(world, priceB, offerC);
                      setWorld({ ...world });
                      setPendingKey('ready.pending');
                      enterReady(offerNet);
                      go('pret');
                    }}
                  />
                </Card>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {screen === 'pret' && (
          <ScrollView contentContainerStyle={styles.scrollFlow} showsVerticalScrollIndicator={false}>
          <View style={styles.stackGap}>
            <Card accent>
              <StatusChip tone="fact" label={t('pret.badge_payee')} icon="coche" />
              <Text style={ts('body', C.ink)}>{t('pret.commande_payee')}</Text>
            </Card>

            {b7Phase === 'ready' && (
              <>
                <Card>
                  <CheckRow label={t('pret.check_photo')} checked={check1} onToggle={() => setCheck1((v) => !v)} />
                  <CheckRow label={t('pret.check_ferme')} checked={check2} onToggle={() => setCheck2((v) => !v)} />
                </Card>
                <PrimaryButton
                  label={t('pret.confirmer')}
                  disabled={!(check1 && check2)}
                  disabledLabel={t('pret.confirm_gate')}
                  onPress={confirmReady}
                />
                <QuoteRule>{t('deadline.today')}</QuoteRule>
              </>
            )}

            {b7Phase === 'pending' && (
              <>
                <PendingNotice lines={[t('ready.pending_slow')]} />
                <UnderlineLink label={t('pret.simuler_confirmation')} onPress={finishConfirmation} />
                <UnderlineLink label={t('pret.revenir')} onPress={resetB7} />
              </>
            )}

            {b7Phase === 'queued' && (
              <>
                <PendingNotice
                  lines={[t('ready.queued_offline'), t('shell.queue_durable').replace('{count}', String(queuedCount))]}
                />
                <UnderlineLink label={t('pret.revenir')} onPress={resetB7} />
              </>
            )}

            {b7Phase === 'queue_error' && (
              <>
                <WarnNote text={t('ready.queue_error')} />
                <PrimaryButton label={t('pret.confirmer')} onPress={confirmReady} />
                <UnderlineLink label={t('pret.revenir')} onPress={resetB7} />
              </>
            )}

            {b7Phase === 'confirmed' && (
              <>
                <Card accent>
                  <StatusChip tone="fact" label={t('statut.pret')} icon="coche" />
                  <Text style={ts('body', C.ink)}>{t('ready.next')}</Text>
                  <View style={styles.netRow}>
                    <Text style={[ts('body', C.body), styles.flex1]}>{t('pret.net_apres')}</Text>
                    <Text style={[ts('cardMoney', C.deep), MONEY_TEXT]}>
                      {t('money.amount_f').replace('{amount}', formatFcfa(confirmNet))}
                    </Text>
                  </View>
                  <View style={styles.deadlineRow}>
                    <Icon name="horloge" size={17} color={C.ink} />
                    <Text style={ts('bodyStrong', C.ink)}>{t('deadline.today')}</Text>
                  </View>
                </Card>
                <UnderlineLink label={t('ready.demo_refusal')} onPress={() => go('corrective')} />
                <UnderlineLink label={t('pret.revenir')} onPress={resetB7} />
                <SecondaryButton label={t('produits.title')} onPress={() => go('produits')} />
              </>
            )}
          </View>
          </ScrollView>
        )}

        {screen === 'corrective' && (
          <Card>
            {refused === undefined ? (
              <EmptyState icon="coche" title={t('corrective.rien')} />
            ) : (
              <>
                <QuoteRule>
                  {t('refused.cause').replace('{issues}', refused.refusedChecks!.map((key) => t(key)).join(', '))}
                </QuoteRule>
                <Text style={ts('body', C.ink)}>{t('refused.new_code')}</Text>
                <StatusChip
                  tone="pending"
                  label={t('echeances.restant').replace('{min}', String(refused.correctionMinLeft ?? 0))}
                  icon="horloge"
                />
                <PrimaryButton
                  label={t('refused.fix_action')}
                  onPress={() => {
                    markCorrected(world, refused.id);
                    setWorld({ ...world });
                    setPendingKey('refused.fixed_pending');
                    enterReady(refused.money.sellerNet);
                    go('pret');
                  }}
                />
              </>
            )}
            <UnderlineLink label={t('accueil.card_echeances')} onPress={() => go('echeances')} />
          </Card>
        )}

        {screen === 'echeances' && (
          <View style={styles.listWrap}>
            <Text style={ts('rowSub', C.sub)}>{t('echeances.regle')}</Text>
            <FlatList
              data={clocks}
              keyExtractor={(p) => p.id}
              initialNumToRender={6}
              windowSize={5}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <ListRow
                  icon="horloge"
                  title={item.name}
                  meta={
                    item.status !== 'echeance_depassee'
                      ? t('echeances.restant').replace('{min}', String(item.correctionMinLeft ?? 0))
                      : undefined
                  }
                  chip={<StatusChip tone={STATUS_TONE[item.status]} label={t(STATUS_KEY[item.status])} />}
                />
              )}
            />
            <SecondaryButton label={t('produits.title')} onPress={() => go('produits')} />
          </View>
        )}

        {screen === 'recettes' && (
          <View style={styles.listWrap}>
            <HeroLedgerBand
              label={t('recettes.chip_attente')}
              amount={t('money.amount_f').replace('{amount}', formatFcfa(statementFig.pending))}
              sub={t('recettes.state_verse')}
            >
              <View style={styles.ledgerRow}>
                <Text style={ts('caps', C.soft)}>{t('recettes.chip_verse')}</Text>
                <Text style={[ts('bodyStrong', C.onPrimary), MONEY_TEXT]}>
                  {t('money.amount_f').replace('{amount}', formatFcfa(statementFig.paid))}
                </Text>
              </View>
            </HeroLedgerBand>
            {receivables.length === 0 ? (
              <EmptyState icon="gains" title={t('recettes.vide')} />
            ) : (
              <FlatList
                data={receivables}
                keyExtractor={(r) => r.obligation.orderId}
                initialNumToRender={6}
                windowSize={5}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => {
                  const st = RECEIVABLE_STATE[item.obligation.state];
                  return (
                    <Card style={styles.receiptCard}>
                      <View style={styles.receiptHead}>
                        <DuotoneTile label={item.label} height={D.artRow} radius={R.art} style={styles.receiptThumb} />
                        <Text style={[ts('row', C.ink), styles.flex1]} numberOfLines={2}>
                          {item.label}
                        </Text>
                        <StatusChip tone={st.tone} label={t(st.label)} />
                      </View>
                      <AmountHero
                        label={t('offer.net_label')}
                        amount={t('money.amount_f').replace('{amount}', formatFcfa(item.obligation.amount))}
                      />
                      <Text style={ts('body', C.ink)}>{t(st.line)}</Text>
                      {item.obligation.state === 'Paid' && item.obligation.payoutRef !== undefined && (
                        <ReconcileLine>{t('recettes.ref_ligne').replace('{ref}', item.obligation.payoutRef)}</ReconcileLine>
                      )}
                    </Card>
                  );
                }}
              />
            )}
            <Text style={ts('rowSub', C.sub)}>{t('recettes.compte')}</Text>
            <SecondaryButton label={t('produits.title')} onPress={() => go('produits')} />
          </View>
        )}

        {screen === 'moderation' && (
          <View style={styles.listWrap}>
            {offline && <Text style={ts('rowSub', C.sub)}>{t('moderation.hors_ligne')}</Text>}
            <FlatList
              data={world.products}
              keyExtractor={(p) => p.id}
              initialNumToRender={6}
              windowSize={5}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const mod = MODERATION[item.moderationState];
                return (
                  <Card style={styles.modCard}>
                    <View style={styles.modHead}>
                      <Text style={[ts('row', C.ink), styles.flex1]} numberOfLines={1}>
                        {item.name}
                      </Text>
                      <StatusChip tone={mod.tone} label={t(mod.label)} />
                    </View>
                    <Text style={ts('body', C.ink)}>{t(mod.line)}</Text>
                    {item.moderationState === 'changes_requested' &&
                      item.changeReasons?.map((r) => (
                        <Text key={r} style={[ts('body', C.ink), styles.reason]}>
                          {`• ${t(`moderation.reason.${r}`)}`}
                        </Text>
                      ))}
                  </Card>
                );
              }}
            />
            <SecondaryButton label={t('produits.title')} onPress={() => go('produits')} />
          </View>
        )}

        {screen === 'confiance' && (
          <ScrollView contentContainerStyle={styles.scrollFlow} showsVerticalScrollIndicator={false}>
          <View style={styles.stackGap}>
            <Card>
              <Overline>{world.statement.periodLabel}</Overline>
              <MoneyHero label={t('confiance.paid_label')} amount={statementFig.paid} />
              <Text style={ts('body', C.ink)}>
                {t('confiance.pending_ligne').replace('{amount}', formatFcfa(statementFig.pending))}
              </Text>
              <ReconcileLine>{t('confiance.statement_note')}</ReconcileLine>
            </Card>
            <Card accent>
              <View style={styles.modHead}>
                <Overline>{t('confiance.tier_label')}</Overline>
                <StatusChip tone="celebrate" label={t(`confiance.tier_${trust.tier}`)} icon="scelle" />
              </View>
              <Text style={ts('body', C.ink)}>{t('confiance.incidents').replace('{n}', String(trust.faultCount))}</Text>
              {trust.restrictions.map((r) => (
                <Text key={r} style={[ts('body', C.ink), styles.reason]}>{`• ${t(`confiance.restriction.${r}`)}`}</Text>
              ))}
              <ReconcileLine>{t('confiance.protege')}</ReconcileLine>
            </Card>
            <SecondaryButton label={t('produits.title')} onPress={() => go('produits')} />
          </View>
          </ScrollView>
        )}

        {pendingKey !== null && screen !== 'accueil' && screen !== 'pret' && (
          <PendingNotice lines={[t(pendingKey), t('shell.offline_pending')]} />
        )}
      </View>
      </ScreenEnter>

      <View style={styles.footer}>
        <Pressable
          style={styles.resetAction}
          onPress={() =>
            setOffline((v) => {
              if (v) flushQueue();
              return !v;
            })
          }
          accessibilityRole="switch"
          accessibilityState={{ checked: offline }}
        >
          <Text style={ts('caps', offline ? C.deep : C.sub)}>{t('shell.offline_toggle')}</Text>
        </Pressable>
        <Pressable style={styles.resetAction} onPress={reset}>
          <Text style={ts('caps', C.sub)}>{t('nav.recommencer')}</Text>
        </Pressable>
      </View>

      {HUBS.includes(screen) && (
        <TabBar
          items={[
            { key: 'accueil', icon: TAB_ICON.accueil, label: t('nav.tab_accueil'), active: screen === 'accueil', onPress: () => toHub('accueil') },
            { key: 'produits', icon: TAB_ICON.produits, label: t('nav.tab_produits'), active: screen === 'produits', onPress: () => toHub('produits') },
            { key: 'echeances', icon: TAB_ICON.echeances, label: t('nav.tab_echeances'), active: screen === 'echeances', onPress: () => toHub('echeances') },
          ]}
        />
      )}

      {/* « Produit prêt » — the designed peak (non-blocking, reduced-motion
          respected). It fires on the demo confirmation, so it is DEMO-LABELLED
          (the un-labelled payout celebration is reserved for the E3 real-franc
          event per the standing law). No « versé » copy — no payment happened. */}
      <CelebrationLayer
        visible={celebrating && screen === 'pret' && b7Phase === 'confirmed'}
        onDone={endCelebration}
        label={t('statut.pret')}
        caption={t('ready.next')}
        demo={IS_PREVIEW}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  content: { flex: 1, paddingHorizontal: D.pad, paddingTop: D.gap, gap: D.gap },
  scrollFlow: { paddingBottom: D.scrollFlow, gap: D.gap },
  stackGap: { gap: D.gap, paddingTop: D.gapSm },
  offerAvoider: { flex: 1 },
  accueilLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: D.pad, paddingTop: D.gapSm },
  refuseBanner: { flexDirection: 'row', alignItems: 'center', gap: D.gap, backgroundColor: C.dangerBg, padding: D.rowPad, borderRadius: R.input },
  urgentBanner: { flexDirection: 'row', alignItems: 'center', gap: D.gap, backgroundColor: C.warnBg, padding: D.rowPad, borderRadius: R.input },
  flex1: { flex: 1 },
  center: { textAlign: 'center' },
  statGrid: { flexDirection: 'row', gap: D.gap },
  statCard: { flex: 1 },
  listWrap: { flex: 1, gap: D.gap },
  listContent: { paddingBottom: D.gapSm },
  gridRow: { gap: D.gap },
  tile: { flex: 1, gap: D.gapXs, marginBottom: D.gap },
  tileBadge: { position: 'absolute', top: 8, left: 8 },
  tileBody: { gap: 2, paddingHorizontal: 2 },
  receiptCard: { marginBottom: D.gap },
  receiptHead: { flexDirection: 'row', alignItems: 'center', gap: D.gap },
  receiptThumb: { width: D.artRow },
  modCard: { marginBottom: D.gap },
  modHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: D.gap },
  reason: { paddingLeft: D.gapSm },
  netRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: D.gap,
    borderTopWidth: D.hairMed,
    borderTopColor: C.hairlineStrong,
    borderStyle: 'dashed',
    paddingTop: D.gapSm,
  },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: D.gapSm },
  v2Banner: { backgroundColor: C.dim, padding: D.rowPad, borderRadius: R.input },
  photoFrame: {
    backgroundColor: C.soft,
    borderRadius: R.tile,
    alignItems: 'center',
    justifyContent: 'center',
    gap: D.gapSm,
    paddingVertical: 40,
    paddingHorizontal: D.pad,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: D.gapSm },
  categoryChip: { paddingVertical: D.gapSm, paddingHorizontal: D.cardPad },
  cameraFrame: { flex: 1, borderRadius: R.card },
  camera: { flex: 1 },
  cameraScreen: { flex: 1, marginHorizontal: -D.pad, backgroundColor: C.ink, overflow: 'hidden' },
  guideBanner: { position: 'absolute', left: 0, right: 0, top: 0, padding: D.gap, gap: D.gapXs, backgroundColor: C.ink, alignItems: 'center' },
  categoryRecall: { backgroundColor: C.paper, paddingHorizontal: D.gap, paddingVertical: D.padTiny, borderRadius: R.pill },
  captureOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: D.pad, paddingBottom: D.framePad, alignItems: 'center', gap: D.gapSm },
  captureButtonWrap: { width: '80%' },
  failureDetailPill: { backgroundColor: C.ink, paddingHorizontal: D.gap, paddingVertical: D.padTiny, borderRadius: R.pill },
  premiumFrame: { borderRadius: R.ledger, overflow: 'hidden' },
  previewImage: { width: '100%', aspectRatio: 1, backgroundColor: C.soft },
  retakeRow: { flexDirection: 'row', gap: D.gap },
  retakeHalf: { flex: 1 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: D.pad, minHeight: D.minTouch },
  resetAction: { minHeight: D.minTouch, justifyContent: 'center', paddingHorizontal: D.gap },
  previewBanner: { backgroundColor: C.warnBg, paddingVertical: D.gapXs, alignItems: 'center' },
});
