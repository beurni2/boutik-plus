import { useCallback, useMemo, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { boutikPlusTheme as theme } from '@platform/ui-tokens';
import { assertQuoteReconciles, computeWaterfall } from '@platform/contracts';
import { IS_PREVIEW } from './src/preview';
import { t } from './src/i18n';
import { JOURNEY, START, type Screen } from './src/journey';
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
import {
  CAPTURE_CATEGORIES,
  SHOT_KINDS,
  frameGuideKey,
  type CaptureCategory,
  type ShotKind,
} from './src/studio/guidance';
import {
  AmountHero,
  AppHeader,
  Card,
  Celebration,
  EmptyState,
  GhostButton,
  ListRow,
  Overline,
  PendingNotice,
  PrimaryButton,
  ScreenTransition,
  SecondaryButton,
  Skeleton,
  StatusChip,
  TabBar,
  WaxBand,
  type ChipTone,
} from './src/ui/kit';

/**
 * WO-4.2R — LE VISAGE over WO-4.1's walkable world. Same screens, same
 * edges, same back law, same money from the same pinned waterfall — the
 * visual layer is the kit (src/ui/kit.tsx, ui-tokens v2), the navigation
 * SEMANTICS are untouched. Tabs are waypoint RESETS under the ratified
 * two-level-ladder law (they jump only to states already reachable from
 * START along declared edges — accueil→produits, accueil→echeances);
 * go() and its edge guard are byte-identical to WO-4.1.
 */

const E1_B = 10_000;
const E1_C = 1_000;

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
const STATUS_TONE: Record<DemoProduct['status'], ChipTone> = {
  pret: 'ok',
  en_attente: 'info',
  refuse_correctable: 'bad',
  correction_en_cours: 'warn',
  echeance_depassee: 'bad',
};

/** The bottom hubs (WO-4.2R): Accueil · Produits · Échéances. */
const HUBS: readonly Screen[] = ['accueil', 'produits', 'echeances'];

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
};

export default function App() {
  const [world, setWorld] = useState<DemoWorld>(() => createDemoWorld());
  const [stack, setStack] = useState<Screen[]>([START]);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  // WO-4.2C — le Studio: category, the hero→preuve walk, the captured shots.
  const [category, setCategory] = useState<CaptureCategory>('mode');
  const [shot, setShotKind] = useState<ShotKind>('hero');
  const [shots, setShots] = useState<Partial<Record<ShotKind, CaptureResult>>>({});
  const [pending, setPending] = useState<CaptureResult | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureFailed, setCaptureFailed] = useState(false);
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
    setCaptureFailed(false);
  }, []);
  // The capture: ONE path (src/studio/capture.ts) — the previewed
  // derivative IS the stored derivative; EXIF proven stripped on its bytes.
  // A failed capture (including a fail-closed EXIF guard) is a DESIGNED
  // state, never a silent rejection (verifier NB③).
  const takeShot = useCallback(async () => {
    const camera = cameraRef.current;
    if (camera === null || capturing) return;
    setCapturing(true);
    setCaptureFailed(false);
    try {
      setPending(await captureShot(camera));
    } catch {
      setCaptureFailed(true);
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
    // Both shots kept: the capture queues honestly (no media service yet —
    // publication is B2.1) and the walk continues to the offre.
    setPendingKey('studio.queue_pending');
    go('offre');
  }, [pending, shot, go]);
  // Waypoint reset, never an edge: each hub state is already reachable
  // from START along declared edges; the tab jumps to that exact state.
  const toHub = useCallback((hub: Screen) => {
    setStack(hub === START ? [START] : [START, hub]);
  }, []);
  const endCelebration = useCallback(() => setCelebrating(false), []);

  const refused = world.products.find((p) => p.status === 'refuse_correctable');
  const clocks = world.products.filter((p) => p.correctionMinLeft !== undefined);
  const enLigne = world.products.filter((p) => p.status === 'pret').length;
  const aCorriger = world.products.filter(
    (p) => p.status === 'refuse_correctable' || p.status === 'echeance_depassee',
  ).length;
  // The §5.4 worked baseline, computed once through the pinned waterfall —
  // rendering it asserts it reconciled (baselineQuote throws otherwise).
  useMemo(() => baselineQuote(), []);

  const heroAmount = t('money.amount_f').replace('{amount}', formatFcfa(livePreviewNet(E1_B, E1_C)));

  return (
    <SafeAreaView style={styles.screen}>
      {/* SDK 54: backgroundColor restored per the WO-4.0d-prep founder
          ruling ③ — pre-edge-to-edge Android draws a default bar; the
          surface token is the correct fill. */}
      <StatusBar style="dark" backgroundColor={theme.colors.surface} />
      <WaxBand />
      {IS_PREVIEW && (
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerText}>{t('preview.banner')}</Text>
        </View>
      )}

      <AppHeader
        title={t(SCREEN_TITLE_KEY[screen])}
        subtitle={screen === 'accueil' ? t('accueil.tagline') : undefined}
        backLabel={`← ${t('nav.retour')}`}
        onBack={stack.length > 1 ? back : undefined}
      />

      <ScreenTransition screenKey={screen}>
      <View style={styles.content}>
        {screen === 'accueil' && (
          <View style={styles.stackGap}>
            <View style={styles.statGrid}>
              <Card style={styles.statCard}>
                <Overline>{t('accueil.stat_en_ligne')}</Overline>
                <Text style={styles.statValue}>{enLigne}</Text>
              </Card>
              <Card style={styles.statCard}>
                <Overline>{t('accueil.stat_a_corriger')}</Overline>
                <Text style={styles.statValue}>{aCorriger}</Text>
              </Card>
            </View>
            <PrimaryButton label={t('accueil.card_produits')} onPress={() => go('produits')} />
            <SecondaryButton label={t('accueil.card_onboarding')} onPress={() => go('onboarding')} />
            <GhostButton label={t('accueil.card_echeances')} onPress={() => go('echeances')} />
          </View>
        )}

        {screen === 'onboarding' && (
          <Card>
            <Text style={styles.message}>{t('onboarding.free_listing')}</Text>
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
            <FlatList
              data={world.products}
              keyExtractor={(p) => p.id}
              initialNumToRender={6}
              windowSize={5}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => (
                <ListRow
                  glyph={item.name.slice(0, 1)}
                  title={item.name}
                  meta={`${t('produits.repere')} : ${item.landmark}`}
                  net={t('produits.net_ligne').replace('{amount}', formatFcfa(item.money.sellerNet))}
                  chip={<StatusChip tone={STATUS_TONE[item.status]} label={t(STATUS_KEY[item.status])} />}
                  onPress={() => (item.status === 'refuse_correctable' ? go('corrective') : go('offre'))}
                />
              )}
            />
            <PrimaryButton label={t('accueil.card_nouveau')} onPress={() => go('nouveau')} />
          </View>
        )}

        {screen === 'nouveau' && (
          <Card>
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
          </Card>
        )}

        {screen === 'photo' && permission === null && <Skeleton style={styles.cameraFrame} />}

        {screen === 'photo' && permission !== null && !permission.granted && (
          <Card>
            <View style={styles.photoFrame}>
              <Text style={styles.photoGlyph}>📷</Text>
              <Text style={styles.photoHint}>{t('studio.permission')}</Text>
            </View>
            <PrimaryButton label={t('studio.autoriser')} onPress={() => void requestPermission()} />
            {/* The demo stays walkable if the camera is refused — honest
                fallback, capture simply absent (journaled). */}
            <GhostButton label={t('studio.sans_photo')} onPress={() => go('offre')} />
          </Card>
        )}

        {screen === 'photo' && permission !== null && permission.granted && pending === null && (
          <View style={styles.stackGap}>
            <View style={styles.cameraFrame}>
              <CameraView ref={cameraRef} style={styles.camera} facing="back">
                {/* Live frame guides — corners + the category-aware line
                    (« Rapprochez-vous » class, inviting, never scolding). */}
                <View style={styles.guideCorners} pointerEvents="none">
                  <View style={[styles.guideCorner, styles.guideTL]} />
                  <View style={[styles.guideCorner, styles.guideTR]} />
                  <View style={[styles.guideCorner, styles.guideBL]} />
                  <View style={[styles.guideCorner, styles.guideBR]} />
                </View>
                <View style={styles.guideBanner} pointerEvents="none">
                  <Text style={styles.guideText}>{t(frameGuideKey(category, shot))}</Text>
                </View>
              </CameraView>
            </View>
            <Text style={styles.shotProgress}>
              {t(shot === 'hero' ? 'studio.shot_hero' : 'studio.shot_preuve')}
            </Text>
            {captureFailed && <StatusChip tone="warn" label={t('studio.erreur')} />}
            <PrimaryButton label={t('studio.capture')} onPress={() => void takeShot()} disabled={capturing} />
          </View>
        )}

        {screen === 'photo' && pending !== null && (
          <View style={styles.stackGap}>
            {/* WYSIWYG — the premium-frame preview renders THE derivative
                that will be stored: what the seller sees here is exactly
                what the buyer will see. */}
            <Card style={styles.premiumFrame}>
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
            </Card>
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
          <Card>
            {shots.hero !== undefined && shots.preuve !== undefined && (
              <StatusChip tone="ok" label={t('studio.photos_pretes')} />
            )}
            <AmountHero label={t('offer.net_label')} amount={heroAmount} />
            <View style={styles.baselineCard}>
              <Overline>{t('offre.baseline_title')}</Overline>
              <Text style={styles.baselineLine}>{t('offre.baseline_vendeur')}</Text>
              <Text style={styles.baselineLine}>{t('offre.baseline_revendeur')}</Text>
              <Text style={styles.baselineLine}>{t('offre.baseline_service')}</Text>
              <Text style={styles.baselineLine}>{t('offre.baseline_livraison')}</Text>
            </View>
            <PrimaryButton
              label={t('ready.action')}
              onPress={() => {
                addDemoProduct(world, E1_B, E1_C);
                setWorld({ ...world });
                setPendingKey('ready.pending');
                setCelebrating(true);
                go('pret');
              }}
            />
          </Card>
        )}

        {screen === 'pret' && (
          <Card>
            <StatusChip tone="ok" label={t('statut.pret')} />
            <Text style={styles.message}>{t('ready.next')}</Text>
            <Text style={styles.deadline}>{t('deadline.today')}</Text>
            <GhostButton label={t('ready.demo_refusal')} onPress={() => go('corrective')} />
            <SecondaryButton label={t('produits.title')} onPress={() => go('produits')} />
          </Card>
        )}

        {screen === 'corrective' && (
          <Card>
            {refused === undefined ? (
              // Honest empty state — never a synthetic refusal (verifier NB⑤).
              <EmptyState glyph="✓" title={t('corrective.rien')} />
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
                  tone="warn"
                  label={t('echeances.restant').replace('{min}', String(refused.correctionMinLeft ?? 0))}
                />
                <PrimaryButton
                  label={t('refused.fix_action')}
                  onPress={() => {
                    markCorrected(world, refused.id);
                    setWorld({ ...world });
                    setPendingKey('refused.fixed_pending');
                    setCelebrating(true);
                    go('pret');
                  }}
                />
              </>
            )}
            <GhostButton label={t('accueil.card_echeances')} onPress={() => go('echeances')} />
          </Card>
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
                  glyph={item.name.slice(0, 1)}
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

        {pendingKey !== null && screen !== 'accueil' && (
          <PendingNotice lines={[t(pendingKey), t('shell.offline_pending')]} />
        )}
      </View>
      </ScreenTransition>

      <View style={styles.footer}>
        <Text style={styles.footerHint}>{t('demo.donnees')}</Text>
        <Pressable style={styles.resetAction} onPress={reset}>
          <Text style={styles.resetActionText}>{t('nav.recommencer')}</Text>
        </Pressable>
      </View>

      {HUBS.includes(screen) && (
        <TabBar
          items={[
            { key: 'accueil', icon: '🏠', label: t('nav.tab_accueil'), active: screen === 'accueil', onPress: () => toHub('accueil') },
            { key: 'produits', icon: '🏷️', label: t('nav.tab_produits'), active: screen === 'produits', onPress: () => toHub('produits') },
            { key: 'echeances', icon: '⏱️', label: t('nav.tab_echeances'), active: screen === 'echeances', onPress: () => toHub('echeances') },
          ]}
        />
      )}

      {/* « Produit prêt » — the named celebration moment (≤ 800 ms by token
          ceiling, non-blocking, reduced-motion respected in the kit). */}
      <Celebration visible={celebrating && screen === 'pret'} onDone={endCelebration} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.surface },
  content: {
    flex: 1,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  stackGap: { gap: theme.spacing.md, paddingTop: theme.spacing.sm },
  statGrid: { flexDirection: 'row', gap: theme.spacing.md },
  statCard: { flex: 1 },
  statValue: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.displayFcfa.size,
    lineHeight: theme.typeScale.displayFcfa.lineHeight,
    fontWeight: theme.typeScale.displayFcfa.weight,
    fontVariant: ['tabular-nums'],
  },
  listWrap: { flex: 1, gap: theme.spacing.md },
  listContent: { gap: theme.spacing.sm, paddingBottom: theme.spacing.sm },
  message: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.bodyLarge.size,
    lineHeight: theme.typeScale.bodyLarge.lineHeight,
  },
  ruleNote: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.body.size,
    lineHeight: theme.typeScale.body.lineHeight,
  },
  baselineCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.line,
    padding: theme.spacing.md,
    gap: theme.spacing.xs,
  },
  baselineLine: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.body.size,
    lineHeight: theme.typeScale.body.lineHeight,
    fontVariant: ['tabular-nums'],
  },
  photoFrame: {
    minHeight: theme.spacing.xxxl * 3,
    borderRadius: theme.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surfaceSunken,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  categoryChip: {
    minHeight: theme.touch.minTargetPx,
    borderRadius: theme.radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surfaceRaised,
    paddingHorizontal: theme.spacing.md,
    justifyContent: 'center',
  },
  categoryChipOn: { borderColor: theme.colors.primary, backgroundColor: theme.colors.primarySoft },
  categoryChipText: { color: theme.colors.ink, fontSize: theme.typeScale.body.size, fontWeight: theme.typeScale.label.weight },
  categoryChipTextOn: { color: theme.colors.primaryStrong },
  cameraFrame: {
    height: theme.spacing.xxxl * 7,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    backgroundColor: theme.colors.surfaceSunken,
  },
  camera: { flex: 1 },
  guideCorners: { ...StyleSheet.absoluteFillObject, margin: theme.spacing.lg },
  guideCorner: {
    position: 'absolute',
    width: theme.spacing.xl,
    height: theme.spacing.xl,
    borderColor: theme.colors.surfaceRaised,
  },
  guideTL: { top: 0, left: 0, borderTopWidth: theme.spacing.xs / 2, borderLeftWidth: theme.spacing.xs / 2 },
  guideTR: { top: 0, right: 0, borderTopWidth: theme.spacing.xs / 2, borderRightWidth: theme.spacing.xs / 2 },
  guideBL: { bottom: 0, left: 0, borderBottomWidth: theme.spacing.xs / 2, borderLeftWidth: theme.spacing.xs / 2 },
  guideBR: { bottom: 0, right: 0, borderBottomWidth: theme.spacing.xs / 2, borderRightWidth: theme.spacing.xs / 2 },
  guideBanner: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.ink,
    alignItems: 'center',
  },
  guideText: {
    color: theme.colors.surfaceRaised,
    fontSize: theme.typeScale.body.size,
    lineHeight: theme.typeScale.body.lineHeight,
    fontWeight: theme.typeScale.label.weight,
    textAlign: 'center',
  },
  shotProgress: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.body.size,
    lineHeight: theme.typeScale.body.lineHeight,
    textAlign: 'center',
  },
  premiumFrame: {
    borderColor: theme.colors.primary,
    borderWidth: theme.spacing.xs / 2,
  },
  previewImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceSunken,
  },
  retakeRow: { flexDirection: 'row', gap: theme.spacing.md },
  retakeHalf: { flex: 1 },
  photoGlyph: { fontSize: theme.typeScale.displayFcfa.size, lineHeight: theme.typeScale.displayFcfa.lineHeight },
  photoHint: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.body.size,
    lineHeight: theme.typeScale.body.lineHeight,
    textAlign: 'center',
  },
  deadline: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
    fontWeight: theme.typeScale.heading.weight,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    minHeight: theme.touch.minTargetPx,
  },
  footerHint: { color: theme.colors.inkFaint, fontSize: theme.typeScale.caption.size },
  resetAction: { minHeight: theme.touch.minTargetPx, justifyContent: 'center', paddingHorizontal: theme.spacing.md },
  resetActionText: { color: theme.colors.inkMuted, fontSize: theme.typeScale.caption.size, fontWeight: theme.typeScale.label.weight },
  previewBanner: {
    backgroundColor: theme.colors.surfaceSunken,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.line,
    paddingVertical: theme.spacing.xs,
    alignItems: 'center',
  },
  previewBannerText: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.caption.size,
    lineHeight: theme.typeScale.caption.lineHeight,
  },
});
