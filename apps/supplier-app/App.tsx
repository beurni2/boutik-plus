import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Image, KeyboardAvoidingView, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { assertQuoteReconciles, computeWaterfall } from '@platform/contracts';
import { C, ts, D, R, MONEY_TEXT, SHADOW } from './src/ui/fp';
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
  Card,
  CelebrationLayer,
  CheckRow,
  CornerTicks,
  DuotoneTile,
  EmptyState,
  GhostButton,
  HeroLedgerBand,
  HubTitle,
  Icon,
  ListRow,
  MoneyField,
  NoteCard,
  OfflineBanner,
  Overline,
  PendingNotice,
  PrimaryButton,
  QuoteRule,
  ReconcileLine,
  ScreenEnter,
  SecondaryButton,
  SectionLabel,
  Selectable,
  Skeleton,
  StatCard,
  StatusChip,
  TabBar,
  TimeChip,
  UnderlineLink,
  useCountUp,
  VerifiedChip,
  ViewHeader,
  WarnNote,
  WordmarkHeader,
  WovenBand,
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
// WO-FP-BOUTIK (device review #4, founder ruling): the horloge is REMOVED from
// the échéances tab. Like accueil/produits, it renders as a forward-name the
// tolerant Icon draws nothing for — the tab is word-only (icon+word law met by
// the word) until canon fills a non-clock échéances glyph.
const TAB_ICON: Record<'accueil' | 'produits' | 'echeances', IconName> = {
  accueil: 'accueil' as unknown as IconName,
  produits: 'produits' as unknown as IconName,
  echeances: 'echeances' as unknown as IconName,
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
  recette: 'recette.title',
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

// WO-FP-BOUTIK #6 — the settlement happy-path order, for the detail timeline.
// Presentation only: it renders the read model's OWN state, never computes one.
// Held/Failed are OFF-path terminals — the detail shows the path reached plus
// the honest terminal node (never a silent all-pending lie).
type SettlementState = DemoReceivable['obligation']['state'];
const SETTLEMENT_ORDER: readonly SettlementState[] = ['Locked', 'Pending', 'Eligible', 'Payable', 'Processing', 'Paid'];

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
  // WO-FP-BOUTIK #6 — the Mes-recettes card the seller opened, for the detail
  // view. Render-only: it carries the EXISTING read-model obligation verbatim.
  const [selectedReceivable, setSelectedReceivable] = useState<DemoReceivable | null>(null);
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
    setSelectedReceivable(null);
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
  // « À faire maintenant » — products needing seller action (planche accueil).
  const todo = world.products.filter((p) => p.status === 'refuse_correctable' || p.status === 'echeance_depassee');
  const aCorriger = todo.length;
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

      {/* WO-FP-BOUTIK frame fidelity: the Faso Premium frames have NO global
          fixed header — only the 6px woven band is fixed under the status bar;
          each screen owns its in-scroll header (WordmarkHeader / ViewHeader),
          so the header scrolls WITH the content (planche model). */}
      <WovenBand />
      {offline && <OfflineBanner label={t('shell.offline')} />}

      <ScreenEnter screenKey={screen}>
      <View style={styles.content}>
        {screen === 'accueil' && (
          // Rebuilt to the « Accueil » frame: in-scroll wordmark header · big
          // greeting · « À faire maintenant » · money stat grid · add CTA ·
          // « Échéances du jour » chips · gratuité note. Divergences (frozen
          // store has no ownerName/shopName/stock): greeting drops the name;
          // shop line uses the market landmark; the Alerte-stock card is omitted.
          <ScrollView style={styles.fill} contentContainerStyle={styles.scrollFlow} showsVerticalScrollIndicator={false}>
            <WordmarkHeader
              shopLine={t('accueil.shopline')}
              right={<VerifiedChip label={t('confiance.title')} onPress={() => go('confiance')} />}
            />
            <Text style={ts('screen', C.ink)}>{t('accueil.greeting')}</Text>
            <Text style={ts('body', C.sub)}>{t('accueil.greeting_sub').replace('{n}', String(enLigne))}</Text>

            {todo.length > 0 && (
              <View style={styles.stackGap}>
                <SectionLabel count={todo.length}>{t('accueil.section_todo')}</SectionLabel>
                {todo.map((p) => (
                  <ListRow
                    key={p.id}
                    art={<DuotoneTile label={p.name} height={D.artRow} radius={R.art} style={styles.receiptThumb} />}
                    title={p.name}
                    meta={`${t('produits.repere')} : ${p.landmark}`}
                    chip={<StatusChip tone={STATUS_TONE[p.status]} label={t(STATUS_KEY[p.status])} />}
                    onPress={() => go(p.status === 'refuse_correctable' ? 'corrective' : 'echeances')}
                  />
                ))}
              </View>
            )}

            <View style={styles.statGrid}>
              <StatCard
                label={t('recettes.chip_attente')}
                amount={t('money.amount_f').replace('{amount}', formatFcfa(statementFig.pending))}
                note={t('accueil.stat_attente_note')}
              />
              <StatCard
                label={t('recettes.chip_verse')}
                amount={t('money.amount_f').replace('{amount}', formatFcfa(statementFig.paid))}
                note={t('accueil.stat_verse_note')}
                accent
              />
            </View>

            <PrimaryButton label={t('accueil.card_nouveau')} onPress={() => go('nouveau')} icon="colis" />

            {clocks.length > 0 && (
              <Card>
                <Overline>{t('accueil.ech_titre')}</Overline>
                {clocks.map((p) => (
                  <View key={p.id} style={styles.echRow}>
                    <TimeChip>{t('accueil.ech_restant').replace('{min}', String(p.correctionMinLeft ?? 0))}</TimeChip>
                    <Text style={[ts('body', C.body), styles.flex1]} numberOfLines={1}>
                      {p.name}
                    </Text>
                  </View>
                ))}
              </Card>
            )}

            <NoteCard>
              <Text style={ts('body', C.deep)}>{t('accueil.gratuite')}</Text>
              <UnderlineLink label={t('accueil.gratuite_link')} onPress={() => go('onboarding')} />
            </NoteCard>
          </ScrollView>
        )}

        {screen === 'onboarding' && (
          // Rebuilt to the « Inscription vendeur » ob0 welcome frame (planche
          // 512–516): the big Bricolage welcome title + the free-listing promise as
          // a soft accent card + the CTA. Divergence: the welcome step only, not the
          // frame's full 5-step signup wizard (jumps E1 scope). Copy is gate-clean
          // (the frame's banned surety words + its retired shop name are dropped).
          <ScrollView style={styles.fill} contentContainerStyle={styles.scrollFlow} showsVerticalScrollIndicator={false}>
          <ViewHeader title={t(SCREEN_TITLE_KEY[screen])} backLabel={`← ${t('nav.retour')}`} onBack={stack.length > 1 ? back : undefined} />
          <Text style={ts('screen', C.ink)}>{t('onboarding.welcome')}</Text>
          <NoteCard>
            <Text style={ts('body', C.deep)}>{t('onboarding.free_listing')}</Text>
          </NoteCard>
          <PrimaryButton
            label={t('onboard.action')}
            onPress={() => {
              setPendingKey('onboard.phone_pending');
              go('produits');
            }}
          />
          </ScrollView>
        )}

        {screen === 'produits' && (
          // Rebuilt to the « Produits » frame: big Bricolage hub title + subtitle
          // (n en ligne · sans prix ajouté) · a soft « Lister un produit — gratuit »
          // button at the top · the 2-col duotone grid. Divergences: the tile shows
          // the supplier NET (Law 1, reseller/seller sees net) rather than the
          // frame's base price; no stock text (frozen store); the button glyph is
          // `colis` (canon icon set has no plus).
          <FlatList
            style={styles.fill}
            data={world.products}
            keyExtractor={(p) => p.id}
            numColumns={2}
            columnWrapperStyle={world.products.length > 0 ? styles.gridRow : undefined}
            initialNumToRender={6}
            windowSize={5}
            contentContainerStyle={styles.scrollFlow}
            ListHeaderComponent={
              <View style={styles.stackGap}>
                <HubTitle
                  title={t('produits.title')}
                  subtitle={t('produits.subtitle').replace('{n}', String(enLigne))}
                />
                <SecondaryButton label={t('produits.lister')} onPress={() => go('nouveau')} icon="colis" />
              </View>
            }
            ListEmptyComponent={<EmptyState icon="colis" title={t('produits.vide')} />}
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
        )}

        {screen === 'nouveau' && (
          // Rebuilt to the « Nouveau produit » wiz0 frame (planche 349–355): the big
          // Bricolage « Catégorie » step title over the category chips on the paper
          // surface (no card wrapper), then the capture CTA. Divergence: a single
          // category step, not the frame's full 5-step wizard (that jumps E1 scope).
          <ScrollView style={styles.fill} contentContainerStyle={styles.scrollFlow} showsVerticalScrollIndicator={false}>
          <ViewHeader title={t(SCREEN_TITLE_KEY[screen])} backLabel={`← ${t('nav.retour')}`} onBack={stack.length > 1 ? back : undefined} />
          <Text style={ts('screen', C.ink)}>{t('studio.categorie')}</Text>
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
          </ScrollView>
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
            <ViewHeader title={t(SCREEN_TITLE_KEY[screen])} backLabel={`← ${t('nav.retour')}`} onBack={stack.length > 1 ? back : undefined} />
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
            {/* Boutik+ Studio imaging-honesty (frame 438 + 495): the photo is real
                (Law 5 — no generative/AI image) and the original is retained, never
                overwritten (B+I imaging). Stated at the moment the premium-frame
                derivative is shown. Copy only — no camera/EXIF/imaging-logic change. */}
            <NoteCard>
              <Text style={ts('body', C.deep)}>{t('studio.honnete_ia')}</Text>
              <Text style={ts('rowSub', C.sub)}>{t('studio.honnete_original')}</Text>
            </NoteCard>
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
                <ViewHeader title={t(SCREEN_TITLE_KEY[screen])} backLabel={`← ${t('nav.retour')}`} onBack={stack.length > 1 ? back : undefined} />
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
                  {/* Rebuilt to the « Prix & commission » wiz2 frame (planche
                      384–388): the structured breakdown — base − commission − frais
                      — each figure from the LIVE pinned waterfall, then the net in
                      majesty. Fields stay editable MoneyFields (DF-1 C, device
                      override of the frame's steppers); the net stays the guarded
                      MoneyHero (count-up). */}
                  {!belowMin && (
                    <View style={styles.breakdown}>
                      <View style={styles.netRow}>
                        <Text style={ts('body', C.ink)}>{t('offre.champ_prix')}</Text>
                        <Text style={[ts('body', C.ink), MONEY_TEXT]}>
                          {t('money.amount_f').replace('{amount}', formatFcfa(priceB))}
                        </Text>
                      </View>
                      <View style={styles.netRow}>
                        <Text style={ts('body', C.sub)}>{t('offre.champ_commission')}</Text>
                        <Text style={[ts('body', C.sub), MONEY_TEXT]}>
                          {`− ${t('money.amount_f').replace('{amount}', formatFcfa(offerC))}`}
                        </Text>
                      </View>
                      <View style={styles.netRow}>
                        <Text style={ts('body', C.sub)}>{t('offre.ligne_frais')}</Text>
                        <Text style={[ts('body', C.sub), MONEY_TEXT]}>
                          {`− ${t('money.amount_f').replace('{amount}', formatFcfa(offerFee))}`}
                        </Text>
                      </View>
                    </View>
                  )}
                  <MoneyHero label={t('offer.net_label')} amount={offerNet} pending={belowMin} />
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
          <ScrollView style={styles.fill} contentContainerStyle={styles.scrollFlow} showsVerticalScrollIndicator={false}>
          <ViewHeader title={t(SCREEN_TITLE_KEY[screen])} backLabel={`← ${t('nav.retour')}`} onBack={stack.length > 1 ? back : undefined} />
          <View style={styles.stackGap}>
            <Card accent>
              <StatusChip tone="fact" label={t('pret.badge_payee')} icon="coche" />
              <Text style={ts('body', C.ink)}>{t('pret.commande_payee')}</Text>
            </Card>

            {b7Phase === 'ready' && (
              // Rebuilt to the « Produit prêt » sheet frame (planche 601–625): the
              // readiness confirmation as NUMBERED steps + the confirm CTA + the
              // custody honesty line « Le code client de livraison ne vous est
              // jamais montré. » (frame 622 — reinforces B+I-06 / the four-secrets
              // law: the buyer's private delivery secret is never shown to the
              // supplier, and never in readiness evidence). The readiness
              // EVIDENCE is the app's real photo + package checks; the state
              // machine (pending/queued/queue_error/confirmed) is untouched.
              // Custody divergence (FLAGGED): the frame's step-1 readiness CODE
              // (sellerReadinessChallenge, server-issued, short-TTL) is NOT modeled
              // at E1 — it is a server-issued secret and is NEVER fabricated here.
              <>
                <Card>
                  <Overline>{t('pret.step_photo')}</Overline>
                  <CheckRow label={t('pret.check_photo')} checked={check1} onToggle={() => setCheck1((v) => !v)} />
                  <Overline>{t('pret.step_emballage')}</Overline>
                  <CheckRow label={t('pret.check_ferme')} checked={check2} onToggle={() => setCheck2((v) => !v)} />
                </Card>
                <PrimaryButton
                  label={t('pret.confirmer')}
                  disabled={!(check1 && check2)}
                  disabledLabel={t('pret.confirm_gate')}
                  onPress={confirmReady}
                />
                <NoteCard>
                  <Text style={ts('body', C.deep)}>{t('pret.honnete_code_client')}</Text>
                </NoteCard>
                <QuoteRule>{t('deadline.today')}</QuoteRule>
              </>
            )}

            {b7Phase === 'pending' && (
              <>
                <PendingNotice serverWait lines={[t('ready.pending_slow')]} />
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
          <ScrollView style={styles.fill} contentContainerStyle={styles.scrollFlow} showsVerticalScrollIndicator={false}>
          <ViewHeader title={t(SCREEN_TITLE_KEY[screen])} backLabel={`← ${t('nav.retour')}`} onBack={stack.length > 1 ? back : undefined} />
          <Card>
            {refused === undefined ? (
              <EmptyState icon="coche" title={t('corrective.rien')} />
            ) : (
              // Rebuilt to the « Détail commande » refusal frame (planche 298–301):
              // the refusal reason as a DANGER banner, then the Protection-Fund
              // reassurance (the buyer is ALREADY refunded — never gated on the
              // seller; B+I-12), the countdown, and the correct-and-re-propose CTA.
              <>
                <WarnNote
                  tone="danger"
                  text={t('refused.cause').replace('{issues}', refused.refusedChecks!.map((key) => t(key)).join(', '))}
                />
                <NoteCard>
                  <Text style={ts('body', C.deep)}>{t('corrective.protection')}</Text>
                </NoteCard>
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
          </ScrollView>
        )}

        {screen === 'echeances' && (
          // WO-FP-BOUTIK #5: ONE full-height scroll surface — the rule note and
          // the button ride ListHeader/Footer so nothing is a bounded middle
          // window. #3: each row wires to the correction flow (a door, never a
          // dead end). #4: the row-tile horloge stays (listed for the founder).
          <FlatList
            style={styles.fill}
            data={clocks}
            keyExtractor={(p) => p.id}
            initialNumToRender={6}
            windowSize={5}
            contentContainerStyle={styles.scrollFlow}
            ListHeaderComponent={<HubTitle title={t('echeances.title')} subtitle={t('echeances.regle')} />}
            ListFooterComponent={<SecondaryButton label={t('produits.title')} onPress={() => go('produits')} />}
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
                onPress={() => go('corrective')}
              />
            )}
          />
        )}

        {screen === 'recettes' && (
          // WO-FP-BOUTIK #5: ONE full-height scroll — the hero ledger rides
          // ListHeader, the note + button ride ListFooter (no bounded window).
          <FlatList
            style={styles.fill}
            data={receivables}
            keyExtractor={(r) => r.obligation.orderId}
            initialNumToRender={6}
            windowSize={5}
            contentContainerStyle={styles.scrollFlow}
            ListHeaderComponent={
              <>
              <ViewHeader title={t('recettes.title')} backLabel={`← ${t('nav.retour')}`} onBack={stack.length > 1 ? back : undefined} />
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
              {receivables.length > 0 && <SectionLabel>{t('recettes.detail_label')}</SectionLabel>}
              </>
            }
            ListEmptyComponent={<EmptyState icon="gains" title={t('recettes.vide')} />}
            ListFooterComponent={
              <>
                <Text style={ts('rowSub', C.sub)}>{t('recettes.compte')}</Text>
                <SecondaryButton label={t('produits.title')} onPress={() => go('produits')} />
              </>
            }
            renderItem={({ item }) => {
              const st = RECEIVABLE_STATE[item.obligation.state];
              // Rebuilt to the « Argent » frame « Détail par commande » rows
              // (planche 197–208): the money hero stays SINGULAR at the top band;
              // each order is a COMPACT row — name + state line left, the locked
              // net (verbatim read-model obligation, frozen formatter, never
              // recomputed) + status pill right. The row opens the detail (#6).
              return (
                <Pressable
                  onPress={() => {
                    setSelectedReceivable(item);
                    go('recette');
                  }}
                  accessibilityRole="button"
                >
                  <View style={styles.moneyRow}>
                    <DuotoneTile label={item.label} height={D.artRow} radius={R.art} style={styles.receiptThumb} />
                    <View style={styles.flex1}>
                      <Text style={ts('row', C.ink)} numberOfLines={1}>
                        {item.label}
                      </Text>
                      <Text style={ts('rowSub', C.sub)} numberOfLines={1}>
                        {t(st.line)}
                      </Text>
                    </View>
                    <View style={styles.moneyRowRight}>
                      <Text style={[ts('priceInline', C.ink), MONEY_TEXT]}>
                        {t('money.amount_f').replace('{amount}', formatFcfa(item.obligation.amount))}
                      </Text>
                      <StatusChip tone={st.tone} label={t(st.label)} />
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        )}

        {/* WO-FP-BOUTIK #6 — the Mes-recettes obligation DETAIL: a render view
            over the EXISTING settlement read model. The figure is the read
            model's LOCKED obligation, formatted by the frozen formatter, NEVER
            recomputed (B+I-05). Faso grammar + the signature module; states law
            (loading — a stale tap; empty — no selection). No new data path. */}
        {screen === 'recette' && (
          <ScrollView style={styles.fill} contentContainerStyle={styles.scrollFlow} showsVerticalScrollIndicator={false}>
            <ViewHeader title={t(SCREEN_TITLE_KEY[screen])} backLabel={`← ${t('nav.retour')}`} onBack={stack.length > 1 ? back : undefined} />
            {selectedReceivable === null ? (
              <EmptyState icon="gains" title={t('recettes.vide')} action={<SecondaryButton label={t('recettes.title')} onPress={() => go('recettes')} />} />
            ) : (
              (() => {
                const r = selectedReceivable;
                const st = RECEIVABLE_STATE[r.obligation.state];
                const reachedIdx = SETTLEMENT_ORDER.indexOf(r.obligation.state);
                const offPath = reachedIdx === -1; // Held / Failed — off the happy path
                const pathReached = offPath ? SETTLEMENT_ORDER.indexOf('Processing') : reachedIdx;
                const timeline: { state: SettlementState; done: boolean; current: boolean }[] = SETTLEMENT_ORDER.map(
                  (s, i) => ({ state: s, done: i <= pathReached, current: !offPath && i === reachedIdx }),
                );
                if (offPath) timeline.push({ state: r.obligation.state, done: true, current: true });
                return (
                  <View style={styles.stackGap}>
                    <View style={styles.receiptHead}>
                      <DuotoneTile label={r.label} height={D.artRow} radius={R.art} style={styles.receiptThumb} />
                      <Text style={[ts('view', C.ink), styles.flex1]} numberOfLines={2}>
                        {r.label}
                      </Text>
                      <StatusChip tone={st.tone} label={t(st.label)} />
                    </View>
                    <Card>
                      <AmountHero
                        label={t('offer.net_label')}
                        amount={t('money.amount_f').replace('{amount}', formatFcfa(r.obligation.amount))}
                      />
                      <Text style={ts('body', C.ink)}>{t(st.line)}</Text>
                      {r.obligation.state === 'Paid' && r.obligation.payoutRef !== undefined && (
                        <ReconcileLine>{t('recettes.ref_ligne').replace('{ref}', r.obligation.payoutRef)}</ReconcileLine>
                      )}
                    </Card>
                    {/* The settlement lifecycle as a timeline, the current state
                        highlighted — presentation over the read model's own state. */}
                    <Card>
                      <Overline>{t('recette.timeline')}</Overline>
                      {timeline.map((n, i) => (
                        <View key={`${n.state}-${i}`} style={styles.timelineRow}>
                          <View style={styles.timelineDotCol}>
                            <View style={[styles.timelineDot, n.done && styles.timelineDotDone, n.current && styles.timelineDotCurrent]} />
                            {i < timeline.length - 1 && (
                              <View style={[styles.timelineBar, n.done && styles.timelineBarDone]} />
                            )}
                          </View>
                          <Text style={[ts(n.current ? 'row' : 'body', n.done ? C.ink : C.sub), styles.timelineLabel]}>
                            {t(RECEIVABLE_STATE[n.state].label)}
                          </Text>
                        </View>
                      ))}
                    </Card>
                    <SecondaryButton label={t('recettes.title')} onPress={() => go('recettes')} />
                  </View>
                );
              })()
            )}
          </ScrollView>
        )}

        {screen === 'moderation' && (
          <FlatList
            style={styles.fill}
            data={world.products}
            keyExtractor={(p) => p.id}
            initialNumToRender={6}
            windowSize={5}
            contentContainerStyle={styles.scrollFlow}
            ListHeaderComponent={
              <>
                <ViewHeader title={t('moderation.title')} backLabel={`← ${t('nav.retour')}`} onBack={stack.length > 1 ? back : undefined} />
                {offline && <Text style={ts('rowSub', C.sub)}>{t('moderation.hors_ligne')}</Text>}
              </>
            }
            ListFooterComponent={<SecondaryButton label={t('produits.title')} onPress={() => go('produits')} />}
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
        )}

        {screen === 'confiance' && (
          // Rebuilt to the « Niveau de confiance » frame (planche 561–586): the
          // trust LADDER — three tier cards (Provisoire · Vérifié · De confiance),
          // the current one emphasized (accent border + « Votre niveau » pill) and
          // carrying the seller's real access consequence (faultCount +
          // restrictions, B7.2). Subtitle + gold warning use gate-clean wording
          // for the zero-seller-fee promise. Divergence: NO money on the trust
          // screen — the statement figures live on the money surfaces (Accueil ·
          // Mes recettes); B+I-12, a consequence is access-based, never money.
          <ScrollView style={styles.fill} contentContainerStyle={styles.scrollFlow} showsVerticalScrollIndicator={false}>
          <ViewHeader title={t(SCREEN_TITLE_KEY[screen])} backLabel={`← ${t('nav.retour')}`} onBack={stack.length > 1 ? back : undefined} />
          <Text style={ts('body', C.sub)}>{t('confiance.subtitle')}</Text>
          <View style={styles.stackGap}>
            {(['provisional', 'verified', 'trusted'] as const).map((tier) => {
              const current = trust.tier === tier;
              return (
                <Card key={tier} accent={current}>
                  <View style={styles.modHead}>
                    <Text style={ts('row', C.ink)}>{t(`confiance.tier_${tier}`)}</Text>
                    {current && <StatusChip tone="celebrate" label={t('confiance.tier_current')} icon="scelle" />}
                  </View>
                  <Text style={ts('body', C.sub)}>{t(`confiance.desc_${tier}`)}</Text>
                  {current && (
                    <>
                      <Text style={ts('body', C.ink)}>{t('confiance.incidents').replace('{n}', String(trust.faultCount))}</Text>
                      {trust.restrictions.map((r) => (
                        <Text key={r} style={[ts('body', C.ink), styles.reason]}>{`• ${t(`confiance.restriction.${r}`)}`}</Text>
                      ))}
                    </>
                  )}
                </Card>
              );
            })}
          </View>
          <WarnNote text={t('confiance.warning')} />
          <SecondaryButton label={t('produits.title')} onPress={() => go('produits')} />
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
  // WO-FP-BOUTIK #5: content is a plain full-height frame; each screen owns ONE
  // scroll surface (fill) whose contentContainerStyle (scrollFlow) carries the
  // padding — no bounded middle window, no nested scroll, no clipped chrome.
  content: { flex: 1, paddingHorizontal: D.pad, gap: D.gapSm },
  fill: { flex: 1 },
  scrollFlow: { paddingTop: D.gap, paddingBottom: D.scrollFlow, gap: D.gap },
  stackGap: { gap: D.gap, paddingTop: D.gapSm },
  timelineRow: { flexDirection: 'row', gap: D.gapSm },
  timelineDotCol: { alignItems: 'center', width: D.timelineDot },
  timelineDot: { width: D.timelineDot, height: D.timelineDot, borderRadius: R.pill, borderWidth: D.timelineStroke, borderColor: C.hairlineStrong, backgroundColor: C.paper },
  timelineDotDone: { borderColor: C.primary, backgroundColor: C.primary },
  timelineDotCurrent: { borderColor: C.primary, backgroundColor: C.soft },
  timelineBar: { width: D.timelineStroke, flex: 1, minHeight: D.gap, marginTop: D.padTiny, backgroundColor: C.hairlineStrong },
  timelineBarDone: { backgroundColor: C.primary },
  timelineLabel: { flex: 1, paddingBottom: D.gap },
  offerAvoider: { flex: 1 },
  accueilLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: D.pad, paddingTop: D.gapSm },
  refuseBanner: { flexDirection: 'row', alignItems: 'center', gap: D.gap, backgroundColor: C.dangerBg, padding: D.rowPad, borderRadius: R.input },
  urgentBanner: { flexDirection: 'row', alignItems: 'center', gap: D.gap, backgroundColor: C.warnBg, padding: D.rowPad, borderRadius: R.input },
  flex1: { flex: 1 },
  center: { textAlign: 'center' },
  statGrid: { flexDirection: 'row', gap: D.gap },
  echRow: { flexDirection: 'row', alignItems: 'center', gap: D.gapSm, paddingVertical: 4 },
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
  breakdown: { gap: D.gapXs },
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
  moneyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: D.gap,
    padding: D.cardPad,
    backgroundColor: C.card,
    borderRadius: R.tile,
    borderWidth: D.hair,
    borderColor: C.hairline,
    ...SHADOW.card,
  },
  moneyRowRight: { alignItems: 'flex-end', gap: D.gapXs },
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
