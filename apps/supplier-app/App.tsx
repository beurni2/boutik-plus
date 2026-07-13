import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { interaction, spacing, touch, type as typeTokens } from '@platform/ui-tokens';
import { assertQuoteReconciles, computeWaterfall } from '@platform/contracts';
import { IS_PREVIEW } from './src/preview';
import { t } from './src/i18n';
import { JOURNEY, START, type Screen } from './src/journey';
import { DurableQueue } from './src/offline/queue';
import { expoDocumentStore } from './src/offline/expoStore';
import {
  addDemoProduct,
  baselineQuote,
  createDemoWorld,
  formatFcfa,
  markCorrected,
  type DemoProduct,
  type DemoWorld,
} from './src/demo/store';
import { captureShot, type CaptureResult } from './src/studio/capture';
import { failureDetailOf, type CaptureFailureDetail } from './src/studio/normalization';
import { CAPTURE_CATEGORIES, frameGuideKey, type CaptureCategory, type ShotKind } from './src/studio/guidance';
import {
  AmountHero,
  AppHeader,
  CelebrationLayer,
  CheckRow,
  EmptyState,
  HairlineBox,
  Icon,
  ListRow,
  MoneyField,
  OfflineBanner,
  Overline,
  palette,
  PendingNotice,
  PrimaryButton,
  ReconcileLine,
  ScreenEnter,
  SecondaryButton,
  Skeleton,
  StatusChip,
  TabBar,
  textStyle,
  UnderlineLink,
  type ChipTone,
  type IconName,
} from './src/ui/kit';

/**
 * WO-6.0 — LE VISAGE, Grand Teint. Same walkable world as WO-4.1 (journey
 * spine, back law, money from the pinned waterfall — all byte-identical), now
 * dressed in the v0.9.0 kit: ink on paper, hairline tables, one primary action
 * per screen, ZERO emoji (icons are the canon set via the `Icon` dispatcher).
 * The navigation SEMANTICS and every franc are untouched.
 */

const C = palette;
const T = typeTokens.scale;

const E1_B = 10_000;
const E1_C = 1_000;

// B6 « sous le plancher » — the seller's base price B has a floor. The value is
// the canon Build Spec's committed MINIMUM (B+4: « category floor >=5,000 FCFA »,
// authority level 2), already carried by the catalog string `offer.floor_block`
// (« ... Le minimum est 5 000 F. »). The FINAL per-category floor list is an
// OPEN Decision (Build Spec register: « Final launch/prohibited category list +
// floor »): the design bundle shows a clothing floor of 8 000 F (copy.md) and a
// 4 000 F example (components.md, which sits BELOW the >=5,000 minimum). Canon
// governs the prototype: the demo holds the Build Spec minimum and does not
// invent a per-category value. Flagged in JOURNAL.md.
const CATEGORY_FLOOR_FCFA = 5_000;

// The WO-1.4 direct-canon-root proof stays live: the offre screen computes
// its preview through the pinned waterfall at render time.
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
// Grand Teint chip tones: an ink `fact` for the confirmed-ready state; a
// warningTint `pending` for in-flight; a dangerTint `problem` for a refusal —
// never a green fill before server truth.
const STATUS_TONE: Record<DemoProduct['status'], ChipTone> = {
  pret: 'fact',
  en_attente: 'pending',
  refuse_correctable: 'problem',
  correction_en_cours: 'pending',
  echeance_depassee: 'problem',
};

/** The bottom hubs (WO-4.2R): Accueil · Produits · Échéances. */
const HUBS: readonly Screen[] = ['accueil', 'produits', 'echeances'];

// The tab glyphs. `echeances` → horloge (present at fa2ff24). `accueil` +
// `produits` glyphs arrive with canon v0.9.1 (WO-5.4, in flight): the forward
// names are wired here and the TOLERANT Icon renders nothing for them until
// the re-pin fills the set — NEVER a lookalike. Tombstone: test/tabbar-icons.
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
};

// B11 — the demo product status mapped to its moderation state + copy.
const MODERATION: Record<DemoProduct['status'], { tone: ChipTone; label: string; line: string }> = {
  pret: { tone: 'fact', label: 'statut.pret', line: 'moderation.approuve' },
  en_attente: { tone: 'pending', label: 'statut.en_attente', line: 'moderation.en_revue' },
  correction_en_cours: { tone: 'pending', label: 'statut.correction', line: 'moderation.modifs' },
  refuse_correctable: { tone: 'problem', label: 'statut.refuse', line: 'moderation.refuse' },
  echeance_depassee: { tone: 'problem', label: 'statut.echeance', line: 'moderation.refuse' },
};

export default function App() {
  const [world, setWorld] = useState<DemoWorld>(() => createDemoWorld());
  const [stack, setStack] = useState<Screen[]>([START]);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  // B6 — the seller's base price as text (numeric-only), and whether this offre
  // is a re-offer (v2: « la v1 reste servie tant que la v2 n'est pas validée »).
  const [priceInput, setPriceInput] = useState(String(E1_B));
  const [reoffer, setReoffer] = useState(false);
  // B7 « produit prêt » — the checklist gate + the four honest states. The
  // celebration fires ONLY on 'confirmed'; 'queued' (offline) never celebrates
  // (offline-first doctrine: queued = pending, never done).
  const [b7Phase, setB7Phase] = useState<'ready' | 'pending' | 'queued' | 'confirmed'>('ready');
  const [check1, setCheck1] = useState(false);
  const [check2, setCheck2] = useState(false);
  const [confirmNet, setConfirmNet] = useState(0);
  // Offline is a GLOBAL, designed state (offline-first doctrine): the banner
  // rides under the header and actions queue as pending — never lost, never
  // silently done. A demo toggle makes the honest state reachable.
  const [offline, setOffline] = useState(false);
  // WO-6.5 · B2.1 — the DURABLE offline queue (survives app-kill + reboot). An
  // offline confirmation is enqueued to Expo's document store; the surfaced
  // count is the REAL persisted pending, not an in-memory flag. The queue's
  // full survival/idempotency/poison contract is proven in test/offline-queue.
  const queueRef = useRef<DurableQueue | null>(null);
  const confirmSeqRef = useRef(0);
  const [queuedCount, setQueuedCount] = useState(0);
  // WO-4.2C — le Studio: category, the hero→preuve walk, the captured shots.
  const [category, setCategory] = useState<CaptureCategory>('mode');
  const [shot, setShotKind] = useState<ShotKind>('hero');
  const [shots, setShots] = useState<Partial<Record<ShotKind, CaptureResult>>>({});
  const [pending, setPending] = useState<CaptureResult | null>(null);
  const [capturing, setCapturing] = useState(false);
  // WO-4.2D — the designed failure state carries its CODE; the code line
  // renders in preview builds only (« détail : <code> »).
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
  // B7 — enter the ready (à confirmer) state with a fresh checklist; the net to
  // be received after validated delivery is captured for the confirmed panel.
  const enterReady = useCallback((net: number) => {
    setConfirmNet(net);
    setB7Phase('ready');
    setCheck1(false);
    setCheck2(false);
  }, []);
  // Open the durable queue once, restoring anything a previous run left pending
  // (the reboot path — an action queued before an app-kill is STILL here).
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
  // Both checks passed → confirm. Offline PERSISTS the action to the durable
  // queue (never done, never celebrates); online hands off to the operator wait.
  const confirmReady = useCallback(() => {
    if (!(check1 && check2)) return;
    if (offline) {
      setB7Phase('queued');
      const commandId = `ready:${(confirmSeqRef.current += 1)}`;
      void queueRef.current
        ?.enqueue(commandId, 'fulfillment.ready.v1', { net: confirmNet })
        .then(() => setQueuedCount(queueRef.current?.pending().length ?? 0));
      return;
    }
    setB7Phase('pending');
  }, [check1, check2, offline, confirmNet]);
  // The network returned — flush the durable queue (the demo's send resolves;
  // the honesty law holds: only a real delivery clears a pending entry).
  const flushQueue = useCallback(() => {
    void queueRef.current?.deliver(async () => {}).then(() => setQueuedCount(queueRef.current?.pending().length ?? 0));
  }, []);
  // The operator confirmed — NOW it is true: confirmed + the one celebration.
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
  // The honest camera-less path (B4 refusée / « sans photo ») — the demo stays
  // walkable when the camera is unavailable; capture is simply absent.
  const skipPhoto = useCallback(() => {
    setReoffer(false);
    go('offre');
  }, [go]);
  // The capture: ONE path (src/studio/capture.ts) — the previewed derivative
  // IS the stored derivative; EXIF proven stripped on its bytes. A failed
  // capture is a DESIGNED state, never a silent rejection (verifier NB③).
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
    setReoffer(false); // a fresh capture → a v1 offer
    go('offre');
  }, [pending, shot, go]);
  // Waypoint reset, never an edge: each hub state is already reachable from
  // START along declared edges; the tab jumps to that exact state.
  const toHub = useCallback((hub: Screen) => {
    setStack(hub === START ? [START] : [START, hub]);
  }, []);
  const endCelebration = useCallback(() => setCelebrating(false), []);

  const refused = world.products.find((p) => p.status === 'refuse_correctable');
  const clocks = world.products.filter((p) => p.correctionMinLeft !== undefined);
  const enLigne = world.products.filter((p) => p.status === 'pret').length;
  // B10 — a receipt per ready (sellable) product: its net, from the waterfall.
  const recettes = world.products.filter((p) => p.status === 'pret');
  // B1 modes are data-driven: an urgent deadline or a refused package changes
  // what the home screen leads with — shown only when the data warrants it.
  const urgent = world.products.some(
    (p) => p.status === 'echeance_depassee' || (p.correctionMinLeft !== undefined && p.correctionMinLeft <= 60),
  );
  const aCorriger = world.products.filter(
    (p) => p.status === 'refuse_correctable' || p.status === 'echeance_depassee',
  ).length;
  // The §5.4 worked baseline, computed once through the pinned waterfall —
  // rendering it asserts it reconciled (baselineQuote throws otherwise).
  useMemo(() => baselineQuote(), []);

  // B6 derived money — the seller's own live offer through the pinned waterfall.
  // Commission (the reseller's seller-funded share) is a fixed chosen value in
  // this slice; the base price B is the editable input the floor block guards.
  const priceB = Number.parseInt(priceInput, 10) || 0;
  const offerC = E1_C;
  const belowMin = priceB < CATEGORY_FLOOR_FCFA; // includes the empty (0) field
  const belowFloor = priceB > 0 && priceB < CATEGORY_FLOOR_FCFA; // a real too-low entry
  const offerNet = belowMin ? 0 : livePreviewNet(priceB, offerC);
  // Fee is derived FROM the pinned net (net = B − fee − C), so the reconcile
  // line is franc-exact by construction — never an independently-computed 5 %.
  const offerFee = belowMin ? 0 : priceB - offerC - offerNet;

  return (
    <SafeAreaView style={styles.screen}>
      {/* SDK 54: dark status bar over paper; the surface fill matches the
          Grand Teint paper token (pre-edge-to-edge Android bar). */}
      <StatusBar style="dark" backgroundColor={C.paper} />
      {IS_PREVIEW && (
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerText}>{t('preview.banner')}</Text>
        </View>
      )}

      <AppHeader
        title={t(SCREEN_TITLE_KEY[screen])}
        context={screen === 'accueil' ? t('accueil.tagline') : undefined}
        backLabel={`← ${t('nav.retour')}`}
        onBack={stack.length > 1 ? back : undefined}
      />
      {offline && <OfflineBanner label={t('shell.offline')} />}

      <ScreenEnter screenKey={screen}>
      <View style={styles.content}>
        {screen === 'accueil' && (
          <View style={styles.stackGap}>
            {/* B1 « colis refusé » mode — the refusal leads, dignified, and
                says the order stays protected (never punished). */}
            {refused !== undefined && (
              <Pressable style={styles.refuseBanner} onPress={() => go('corrective')} accessibilityRole="button">
                <StatusChip tone="problem" label={t('statut.refuse')} icon="refus" />
                <Text style={styles.bannerText}>{t('accueil.refuse_banner')}</Text>
              </Pressable>
            )}
            {/* B1 « échéance urgente » mode — the clock leads. */}
            {urgent && (
              <Pressable style={styles.urgentBanner} onPress={() => go('echeances')} accessibilityRole="button">
                <Icon name="horloge" size={17} color={C.warning} />
                <Text style={styles.bannerText}>{t('accueil.urgent_banner')}</Text>
              </Pressable>
            )}
            <View style={styles.statGrid}>
              <HairlineBox style={styles.statCard}>
                <Overline>{t('accueil.stat_en_ligne')}</Overline>
                <Text style={styles.statValue}>{enLigne}</Text>
              </HairlineBox>
              <HairlineBox style={styles.statCard}>
                <Overline>{t('accueil.stat_a_corriger')}</Overline>
                <Text style={styles.statValue}>{aCorriger}</Text>
              </HairlineBox>
            </View>
            <PrimaryButton label={t('accueil.card_produits')} onPress={() => go('produits')} />
            <SecondaryButton label={t('accueil.card_onboarding')} onPress={() => go('onboarding')} />
            <View style={styles.accueilLinks}>
              <UnderlineLink label={t('accueil.card_echeances')} onPress={() => go('echeances')} />
              <UnderlineLink label={t('recettes.title')} onPress={() => go('recettes')} />
              <UnderlineLink label={t('moderation.title')} onPress={() => go('moderation')} />
            </View>
          </View>
        )}

        {screen === 'onboarding' && (
          <HairlineBox>
            <Text style={styles.message}>{t('onboarding.free_listing')}</Text>
            <PrimaryButton
              label={t('onboard.action')}
              onPress={() => {
                setPendingKey('onboard.phone_pending');
                go('produits');
              }}
            />
          </HairlineBox>
        )}

        {screen === 'produits' && (
          <View style={styles.listWrap}>
            {world.products.length === 0 ? (
              // B2 empty — a designed state that states the next act, never sad.
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
                  initialNumToRender={6}
                  windowSize={5}
                  contentContainerStyle={styles.listContent}
                  renderItem={({ item }) => (
                    <ListRow
                      icon="colis"
                      title={item.name}
                      meta={`${t('produits.repere')} : ${item.landmark}`}
                      value={t('produits.net_ligne').replace('{amount}', formatFcfa(item.money.sellerNet))}
                      chip={<StatusChip tone={STATUS_TONE[item.status]} label={t(STATUS_KEY[item.status])} />}
                      onPress={() => {
                        if (item.status === 'refuse_correctable') {
                          go('corrective');
                          return;
                        }
                        setReoffer(true); // an already-listed product → a v2 re-offer
                        go('offre');
                      }}
                    />
                  )}
                />
                <PrimaryButton label={t('accueil.card_nouveau')} onPress={() => go('nouveau')} />
              </>
            )}
          </View>
        )}

        {screen === 'nouveau' && (
          <HairlineBox>
            <Text style={styles.message}>{t('product.title')}</Text>
            <Overline>{t('studio.categorie')}</Overline>
            <View style={styles.chipRow}>
              {CAPTURE_CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.categoryChip, category === c && styles.categoryChipOn]}
                  onPress={() => setCategory(c)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: category === c }}
                >
                  <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextOn]}>
                    {t(`categorie.${c}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <PrimaryButton label={t('product.photo_action')} onPress={() => go('photo')} />
          </HairlineBox>
        )}

        {screen === 'photo' && permission === null && <Skeleton style={styles.cameraFrame} />}

        {/* B4 « permission » — the ask; the camera can still be requested. */}
        {screen === 'photo' && permission !== null && !permission.granted && permission.canAskAgain && (
          <HairlineBox>
            <View style={styles.photoFrame}>
              <Icon name="camera" size={28} color={C.soft} />
              <Text style={styles.photoHint}>{t('studio.permission')}</Text>
            </View>
            <PrimaryButton label={t('studio.autoriser')} onPress={() => void requestPermission()} />
            <UnderlineLink label={t('studio.sans_photo')} onPress={skipPhoto} />
          </HairlineBox>
        )}

        {/* B4 « refusée » — the camera is denied for good; the honest fallback
            (continue without a photo) leads, warmly, and re-asking whispers.
            Gallery import (the prototype's action) needs a dep outside WO-6.0. */}
        {screen === 'photo' && permission !== null && !permission.granted && !permission.canAskAgain && (
          <HairlineBox>
            <View style={styles.photoFrame}>
              <Icon name="camera" size={28} color={C.soft} />
              <Text style={styles.photoHint}>{t('studio.refusee')}</Text>
            </View>
            <PrimaryButton label={t('studio.sans_photo')} onPress={skipPhoto} />
            <UnderlineLink label={t('studio.autoriser')} onPress={() => void requestPermission()} />
          </HairlineBox>
        )}

        {screen === 'photo' && permission !== null && permission.granted && pending === null && (
          /* WO-4.2D — la caméra DEVIENT l'écran: full width, maximal height
             (flex fills to the tab bar). Guides scale with the view; ONE
             primary action, overlaid bottom-center in thumb reach. */
          <View style={styles.cameraScreen}>
            <CameraView ref={cameraRef} style={styles.camera} facing="back">
              <View style={styles.guideCorners} pointerEvents="none">
                <View style={[styles.guideCorner, styles.guideTL]} />
                <View style={[styles.guideCorner, styles.guideTR]} />
                <View style={[styles.guideCorner, styles.guideBL]} />
                <View style={[styles.guideCorner, styles.guideBR]} />
              </View>
              <View style={styles.guideBanner} pointerEvents="none">
                <Text style={styles.guideText}>{t(frameGuideKey(category, shot))}</Text>
                <Text style={styles.shotRecallText}>
                  {t(shot === 'hero' ? 'studio.shot_hero' : 'studio.shot_preuve')}
                </Text>
                <View style={styles.categoryRecall}>
                  <Text style={styles.categoryRecallText}>{t(`categorie.${category}`)}</Text>
                </View>
              </View>
              <View style={styles.captureOverlay}>
                {failureDetail !== null && <StatusChip tone="problem" label={t('studio.erreur')} icon="refus" />}
                {/* WO-4.2D diagnostic surface — PREVIEW BUILDS ONLY. */}
                {IS_PREVIEW && failureDetail !== null && (
                  <View style={styles.failureDetailPill}>
                    <Text style={styles.failureDetailText}>
                      {t('studio.erreur_detail').replace('{code}', failureDetail)}
                    </Text>
                  </View>
                )}
                <View style={styles.captureButtonWrap}>
                  <PrimaryButton label={t('studio.capture')} onPress={() => void takeShot()} disabled={capturing} />
                </View>
              </View>
            </CameraView>
          </View>
        )}

        {screen === 'photo' && pending !== null && (
          <View style={styles.stackGap}>
            {/* WYSIWYG — the premium-frame preview renders THE derivative that
                will be stored: what the seller sees is what the buyer sees. */}
            <HairlineBox ink style={styles.premiumFrame}>
              <Overline>{t('studio.apercu')}</Overline>
              <Image
                source={{ uri: pending.derivative.uri }}
                style={styles.previewImage}
                resizeMode="cover"
                accessibilityIgnoresInvertColors
              />
              <Text style={styles.photoHint}>
                {t(pending.guidance.verdict === 'advice' ? 'studio.conseil.lumiere' : 'studio.conseil.ok')}
              </Text>
            </HairlineBox>
            {/* Retake as cheap as confirm — same weight class, side by side. */}
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
          <View style={styles.stackGap}>
            {/* B6 « offre v2 » — a re-offer; the v1 stays served until this is
                validated (honest, never a silent overwrite). */}
            {reoffer && (
              <View style={styles.v2Banner}>
                <Text style={styles.v2Text}>{t('offre.v2')}</Text>
              </View>
            )}
            <HairlineBox>
              {shots.hero !== undefined && shots.preuve !== undefined && (
                <StatusChip tone="fact" label={t('studio.photos_pretes')} icon="coche" />
              )}
              <MoneyField
                label={t('offre.champ_prix')}
                value={priceInput}
                suffix={t('money.franc')}
                onChangeText={(txt) => setPriceInput(txt.replace(/[^0-9]/g, ''))}
              />
              <MoneyField label={t('offre.champ_commission')} value={formatFcfa(offerC)} suffix={t('money.franc')} readOnly />
              <Text style={styles.fieldAide}>{t('offre.commission_aide')}</Text>
              {/* B6 « sous le plancher » — a gentle refusal (warningTint, never a
                  red scold); the CTA is blocked below, with the reason on it. */}
              {belowFloor && (
                <View style={styles.floorNote}>
                  <Icon name="alerte" size={17} color={C.warning} />
                  <Text style={styles.floorNoteText}>{t('offer.floor_block')}</Text>
                </View>
              )}
              {/* Live net through the pinned waterfall — muted when the offer
                  isn't yet valid (empty field or below the floor). */}
              <AmountHero
                label={t('offer.net_label')}
                amount={t('money.amount_f').replace('{amount}', formatFcfa(offerNet))}
                pending={belowMin}
              />
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
                disabledLabel={t('offer.floor_block')}
                onPress={() => {
                  addDemoProduct(world, priceB, offerC);
                  setWorld({ ...world });
                  setPendingKey('ready.pending');
                  enterReady(offerNet); // → B7 « à confirmer » (no celebration yet)
                  go('pret');
                }}
              />
            </HairlineBox>
          </View>
        )}

        {screen === 'pret' && (
          <View style={styles.stackGap}>
            {/* The paid order that triggers B7 — provider-confirmed upstream;
                the supplier prepares (never claims payment itself). */}
            <View style={styles.orderCard}>
              <View style={styles.orderHead}>
                <StatusChip tone="fact" label={t('pret.badge_payee')} icon="coche" />
              </View>
              <Text style={styles.message}>{t('pret.commande_payee')}</Text>
            </View>

            {/* B7 « à confirmer » — the two-point readiness gate. */}
            {b7Phase === 'ready' && (
              <>
                <HairlineBox>
                  <CheckRow label={t('pret.check_photo')} checked={check1} onToggle={() => setCheck1((v) => !v)} />
                  <CheckRow label={t('pret.check_ferme')} checked={check2} onToggle={() => setCheck2((v) => !v)} />
                </HairlineBox>
                <PrimaryButton
                  label={t('pret.confirmer')}
                  disabled={!(check1 && check2)}
                  disabledLabel={t('pret.confirm_gate')}
                  onPress={confirmReady}
                />
                <Text style={styles.deadline}>{t('deadline.today')}</Text>
              </>
            )}

            {/* B7 « attente réseau » — sent, awaiting the operator (slow net); no
                success is claimed before the operator confirms. */}
            {b7Phase === 'pending' && (
              <>
                <PendingNotice lines={[t('ready.pending_slow')]} />
                <UnderlineLink label={t('pret.simuler_confirmation')} onPress={finishConfirmation} />
                <UnderlineLink label={t('pret.revenir')} onPress={resetB7} />
              </>
            )}

            {/* B7 « hors ligne (file) » — queued, never done, NEVER celebrated. */}
            {b7Phase === 'queued' && (
              <>
                <PendingNotice
                  lines={[
                    t('ready.queued_offline'),
                    t('shell.queue_durable').replace('{count}', String(queuedCount)),
                  ]}
                />
                <UnderlineLink label={t('pret.revenir')} onPress={resetB7} />
              </>
            )}

            {/* B7 « confirmé » — now it is true: Séra comes, the net after
                validated delivery, the deadline. The celebration rides above. */}
            {b7Phase === 'confirmed' && (
              <>
                <HairlineBox ink style={styles.confirmedPanel}>
                  <StatusChip tone="fact" label={t('statut.pret')} icon="coche" />
                  <Text style={styles.message}>{t('ready.next')}</Text>
                  <View style={styles.netRow}>
                    <Text style={styles.netRowLabel}>{t('pret.net_apres')}</Text>
                    <Text style={styles.netRowValue}>
                      {t('money.amount_f').replace('{amount}', formatFcfa(confirmNet))}
                    </Text>
                  </View>
                  <View style={styles.deadlineRow}>
                    <Icon name="horloge" size={17} color={C.ink} />
                    <Text style={styles.deadline}>{t('deadline.today')}</Text>
                  </View>
                </HairlineBox>
                <UnderlineLink label={t('ready.demo_refusal')} onPress={() => go('corrective')} />
                <UnderlineLink label={t('pret.revenir')} onPress={resetB7} />
                <SecondaryButton label={t('produits.title')} onPress={() => go('produits')} />
              </>
            )}
          </View>
        )}

        {screen === 'corrective' && (
          <HairlineBox>
            {refused === undefined ? (
              // Honest empty state — never a synthetic refusal (verifier NB⑤).
              <EmptyState icon="coche" title={t('corrective.rien')} />
            ) : (
              <>
                <Text style={styles.message}>
                  {t('refused.cause').replace(
                    '{issues}',
                    refused.refusedChecks!.map((key) => t(key)).join(', '),
                  )}
                </Text>
                <Text style={styles.message}>{t('refused.new_code')}</Text>
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
                    enterReady(refused.money.sellerNet); // → B7 « à confirmer »
                    go('pret');
                  }}
                />
              </>
            )}
            <UnderlineLink label={t('accueil.card_echeances')} onPress={() => go('echeances')} />
          </HairlineBox>
        )}

        {screen === 'echeances' && (
          <View style={styles.listWrap}>
            <Text style={styles.ruleNote}>{t('echeances.regle')}</Text>
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

        {/* B10 — Mes recettes: the seller's net per sold product (from the
            pinned waterfall), « jamais gardé par Boutik+ ». Empty state is
            designed, never sad. */}
        {screen === 'recettes' && (
          <View style={styles.listWrap}>
            {recettes.length === 0 ? (
              <EmptyState icon="gains" title={t('recettes.vide')} />
            ) : (
              <FlatList
                data={recettes}
                keyExtractor={(p) => p.id}
                initialNumToRender={6}
                windowSize={5}
                contentContainerStyle={styles.listContent}
                renderItem={({ item }) => (
                  <View style={styles.receiptCard}>
                    <Overline>{item.name}</Overline>
                    <AmountHero
                      label={t('offer.net_label')}
                      amount={t('recettes.net_ligne').replace('{amount}', formatFcfa(item.money.sellerNet))}
                    />
                    <ReconcileLine>{t('recettes.reconcile')}</ReconcileLine>
                  </View>
                )}
              />
            )}
            <Text style={styles.ruleNote}>{t('recettes.compte')}</Text>
            <SecondaryButton label={t('produits.title')} onPress={() => go('produits')} />
          </View>
        )}

        {/* B11 — Modération: each product's honest review state + a plain,
            actionable reason. Never a silent rejection. */}
        {screen === 'moderation' && (
          <View style={styles.listWrap}>
            <FlatList
              data={world.products}
              keyExtractor={(p) => p.id}
              initialNumToRender={6}
              windowSize={5}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <View style={styles.modCard}>
                  <View style={styles.modHead}>
                    <Text style={styles.modName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <StatusChip tone={MODERATION[item.status].tone} label={t(MODERATION[item.status].label)} />
                  </View>
                  <Text style={styles.message}>{t(MODERATION[item.status].line)}</Text>
                </View>
              )}
            />
            <SecondaryButton label={t('produits.title')} onPress={() => go('produits')} />
          </View>
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
              if (v) flushQueue(); // going back ONLINE → the durable queue drains
              return !v;
            })
          }
          accessibilityRole="switch"
          accessibilityState={{ checked: offline }}
        >
          <Text style={[styles.resetActionText, offline && styles.toggleOn]}>{t('shell.offline_toggle')}</Text>
        </Pressable>
        <Pressable style={styles.resetAction} onPress={reset}>
          <Text style={styles.resetActionText}>{t('nav.recommencer')}</Text>
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

      {/* « Produit prêt » — the named celebration (≤ 800 ms, non-blocking,
          reduced-motion respected in the kit). Fires ONLY on the confirmed
          state — never on a queued (offline) or pending confirmation. */}
      <CelebrationLayer
        visible={celebrating && screen === 'pret' && b7Phase === 'confirmed'}
        onDone={endCelebration}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.paper },
  content: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  stackGap: { gap: spacing.md, paddingTop: spacing.sm },
  accueilLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg, paddingTop: spacing.sm },
  refuseBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: C.dangerTint, padding: spacing.md },
  urgentBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: C.warningTint, padding: spacing.md },
  bannerText: { ...textStyle(T.row), color: C.ink, flex: 1 },
  statGrid: { flexDirection: 'row', gap: spacing.md },
  statCard: { flex: 1 },
  statValue: { ...textStyle(T.display), color: C.ink, fontVariant: ['tabular-nums'] },
  listWrap: { flex: 1, gap: spacing.md },
  listContent: { paddingBottom: spacing.sm },
  receiptCard: { borderWidth: interaction.hairline.strong, borderColor: C.ink, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  modCard: { borderWidth: interaction.hairline.medium, borderColor: C.hairlineStrong, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.md },
  modHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  modName: { ...textStyle(T.row), color: C.ink, flex: 1 },
  message: { ...textStyle(T.body), color: C.ink },
  ruleNote: { ...textStyle(T.caption), color: C.muted },
  orderCard: { borderWidth: interaction.hairline.strong, borderColor: C.ink, padding: spacing.lg, gap: spacing.sm },
  orderHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  confirmedPanel: { gap: spacing.md },
  netRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
    borderTopWidth: interaction.hairline.thin,
    borderTopColor: C.hairline,
    paddingTop: spacing.sm,
  },
  netRowLabel: { ...textStyle(T.body), color: C.body, flex: 1 },
  netRowValue: { ...textStyle(T.bodyStrong), color: C.primaryStrong, fontVariant: ['tabular-nums'] },
  deadlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  v2Banner: { backgroundColor: C.sand, padding: spacing.md },
  v2Text: { ...textStyle(T.body), color: C.body },
  fieldAide: { ...textStyle(T.caption), color: C.muted },
  floorNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: C.warningTint, padding: spacing.md },
  floorNoteText: { ...textStyle(T.body), color: C.warning, flex: 1 },
  photoFrame: {
    borderWidth: interaction.hairline.medium,
    borderColor: C.hairlineStrong,
    backgroundColor: C.sand,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryChip: {
    minHeight: touch.minTargetPx,
    borderWidth: interaction.hairline.medium,
    borderColor: C.hairlineStrong,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
  categoryChipOn: { borderColor: C.ink, backgroundColor: C.ink },
  categoryChipText: { ...textStyle(T.label), color: C.ink },
  categoryChipTextOn: { color: C.onInk },
  cameraFrame: { flex: 1, backgroundColor: C.sand },
  camera: { flex: 1 },
  guideCorners: { ...StyleSheet.absoluteFillObject, margin: spacing.lg },
  guideCorner: { position: 'absolute', width: spacing.xl, height: spacing.xl, borderColor: C.paper },
  guideTL: { top: 0, left: 0, borderTopWidth: interaction.cornerTick.strokePx, borderLeftWidth: interaction.cornerTick.strokePx },
  guideTR: { top: 0, right: 0, borderTopWidth: interaction.cornerTick.strokePx, borderRightWidth: interaction.cornerTick.strokePx },
  guideBL: { bottom: 0, left: 0, borderBottomWidth: interaction.cornerTick.strokePx, borderLeftWidth: interaction.cornerTick.strokePx },
  guideBR: { bottom: 0, right: 0, borderBottomWidth: interaction.cornerTick.strokePx, borderRightWidth: interaction.cornerTick.strokePx },
  cameraScreen: { flex: 1, marginHorizontal: -spacing.lg, backgroundColor: C.ink, overflow: 'hidden' },
  guideBanner: { position: 'absolute', left: 0, right: 0, top: 0, padding: spacing.md, gap: spacing.xs, backgroundColor: C.ink, alignItems: 'center' },
  guideText: { ...textStyle(T.bodyStrong), color: C.paper, textAlign: 'center' },
  shotRecallText: { ...textStyle(T.caption), color: C.sand, textAlign: 'center' },
  categoryRecall: { backgroundColor: C.paper, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  categoryRecallText: { ...textStyle(T.label), color: C.ink },
  captureOverlay: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: spacing.xl, alignItems: 'center', gap: spacing.sm },
  captureButtonWrap: { width: '80%' },
  failureDetailPill: { backgroundColor: C.ink, paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  failureDetailText: { ...textStyle(T.caption), color: C.paper },
  premiumFrame: { borderColor: C.primary },
  previewImage: { width: '100%', aspectRatio: 1, backgroundColor: C.sand },
  retakeRow: { flexDirection: 'row', gap: spacing.md },
  retakeHalf: { flex: 1 },
  photoHint: { ...textStyle(T.body), color: C.muted, textAlign: 'center' },
  deadline: { ...textStyle(T.bodyStrong), color: C.ink },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, minHeight: touch.minTargetPx },
  footerHint: { ...textStyle(T.caption), color: C.soft },
  resetAction: { minHeight: touch.minTargetPx, justifyContent: 'center', paddingHorizontal: spacing.md },
  resetActionText: { ...textStyle(T.label), color: C.muted },
  toggleOn: { color: C.ink },
  previewBanner: {
    backgroundColor: C.warningStripe,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  previewBannerText: { ...textStyle(T.caption), color: C.warning },
});
