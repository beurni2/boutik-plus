import { useCallback, useMemo, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { FlatList, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
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

/**
 * WO-4.1 — LE MONDE NAVIGABLE. The WO-1.4/2.6 supplier flows become a
 * walkable journey over src/journey.ts: home → onboarding → mes produits
 * (FlatList, seeded) → nouveau → photo (placeholder capture) → offre (live
 * net on the PINNED waterfall) → « Produit prêt » → the corrective walk →
 * the aging clocks. No new business capability: the demo world runs the
 * real money law (quoteFor asserts reconciliation) against seeded,
 * obviously-fictional Ouagadougou data. Offline law unchanged: queued =
 * pending, never done. « Recommencer la démo » resets world + stack.
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

export default function App() {
  const [world, setWorld] = useState<DemoWorld>(() => createDemoWorld());
  const [stack, setStack] = useState<Screen[]>([START]);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
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
  }, []);

  const refused = world.products.find((p) => p.status === 'refuse_correctable');
  const clocks = world.products.filter((p) => p.correctionMinLeft !== undefined);
  // The §5.4 worked baseline, computed once through the pinned waterfall —
  // rendering it asserts it reconciled (baselineQuote throws otherwise).
  useMemo(() => baselineQuote(), []);

  return (
    <SafeAreaView style={styles.screen}>
      {/* SDK 54: backgroundColor restored per the WO-4.0d-prep founder
          ruling ③ — pre-edge-to-edge Android draws a default bar; the
          surface token is the correct fill. */}
      <StatusBar style="dark" backgroundColor={theme.colors.surface} />
      {IS_PREVIEW && (
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerText}>{t('preview.banner')}</Text>
        </View>
      )}

      <View style={styles.header}>
        {stack.length > 1 ? (
          <Pressable style={styles.backAction} onPress={back}>
            <Text style={styles.backActionText}>← {t('nav.retour')}</Text>
          </Pressable>
        ) : (
          <Text style={styles.brand}>{t('app.title')}</Text>
        )}
      </View>

      <View style={styles.content}>
        {screen === 'accueil' && (
          <View style={styles.stackGap}>
            <Text style={styles.brand}>{t('app.title')}</Text>
            <Text style={styles.message}>{t('accueil.tagline')}</Text>
            <Pressable style={styles.primaryAction} onPress={() => go('produits')}>
              <Text style={styles.primaryActionText}>{t('accueil.card_produits')}</Text>
            </Pressable>
            <Pressable style={styles.secondaryCard} onPress={() => go('onboarding')}>
              <Text style={styles.secondaryCardText}>{t('accueil.card_onboarding')}</Text>
            </Pressable>
            <Pressable style={styles.secondaryCard} onPress={() => go('echeances')}>
              <Text style={styles.secondaryCardText}>{t('accueil.card_echeances')}</Text>
            </Pressable>
          </View>
        )}

        {screen === 'onboarding' && (
          <View style={styles.card}>
            <Text style={styles.message}>{t('onboarding.free_listing')}</Text>
            <Pressable
              style={styles.primaryAction}
              onPress={() => {
                setPendingKey('onboard.phone_pending');
                go('produits');
              }}
            >
              <Text style={styles.primaryActionText}>{t('onboard.action')}</Text>
            </Pressable>
          </View>
        )}

        {screen === 'produits' && (
          <View style={styles.listWrap}>
            <Text style={styles.heading}>{t('produits.title')}</Text>
            <FlatList
              data={world.products}
              keyExtractor={(p) => p.id}
              initialNumToRender={6}
              windowSize={5}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.listRow}
                  onPress={() => (item.status === 'refuse_correctable' ? go('corrective') : go('offre'))}
                >
                  <Text style={styles.listName}>{item.name}</Text>
                  <Text style={styles.listMeta}>
                    {t('produits.repere')} : {item.landmark}
                  </Text>
                  <Text style={styles.listNet}>
                    {t('produits.net_ligne').replace('{amount}', formatFcfa(item.money.sellerNet))}
                  </Text>
                  <Text style={item.status === 'pret' ? styles.badgeOk : styles.badgeWarn}>
                    {t(STATUS_KEY[item.status])}
                  </Text>
                </Pressable>
              )}
            />
            <Pressable style={styles.primaryAction} onPress={() => go('nouveau')}>
              <Text style={styles.primaryActionText}>{t('accueil.card_nouveau')}</Text>
            </Pressable>
          </View>
        )}

        {screen === 'nouveau' && (
          <View style={styles.card}>
            <Text style={styles.heading}>{t('product.title')}</Text>
            <Pressable style={styles.primaryAction} onPress={() => go('photo')}>
              <Text style={styles.primaryActionText}>{t('product.photo_action')}</Text>
            </Pressable>
          </View>
        )}

        {screen === 'photo' && (
          <View style={styles.card}>
            <Text style={styles.heading}>{t('photo.title')}</Text>
            <View style={styles.photoFrame}>
              <Text style={styles.photoHint}>{t('photo.placeholder')}</Text>
            </View>
            <Pressable style={styles.primaryAction} onPress={() => go('offre')}>
              <Text style={styles.primaryActionText}>{t('photo.take')}</Text>
            </Pressable>
          </View>
        )}

        {screen === 'offre' && (
          <View style={styles.card}>
            <Text style={styles.heading}>{t('offer.title')}</Text>
            <Text style={styles.netAmount}>
              {t('offer.net_preview').replace('{amount}', formatFcfa(livePreviewNet(E1_B, E1_C)))}
            </Text>
            <View style={styles.baselineCard}>
              <Text style={styles.baselineTitle}>{t('offre.baseline_title')}</Text>
              <Text style={styles.baselineLine}>{t('offre.baseline_vendeur')}</Text>
              <Text style={styles.baselineLine}>{t('offre.baseline_revendeur')}</Text>
              <Text style={styles.baselineLine}>{t('offre.baseline_service')}</Text>
              <Text style={styles.baselineLine}>{t('offre.baseline_livraison')}</Text>
            </View>
            <Pressable
              style={styles.primaryAction}
              onPress={() => {
                addDemoProduct(world, E1_B, E1_C);
                setWorld({ ...world });
                setPendingKey('ready.pending');
                go('pret');
              }}
            >
              <Text style={styles.primaryActionText}>{t('ready.action')}</Text>
            </Pressable>
          </View>
        )}

        {screen === 'pret' && (
          <View style={styles.card}>
            <Text style={styles.heading}>{t('ready.action')}</Text>
            <Text style={styles.message}>{t('ready.next')}</Text>
            <Text style={styles.deadline}>{t('deadline.today')}</Text>
            <Pressable style={styles.quietAction} onPress={() => go('corrective')}>
              <Text style={styles.quietActionText}>{t('ready.demo_refusal')}</Text>
            </Pressable>
            <Pressable style={styles.secondaryCard} onPress={() => go('produits')}>
              <Text style={styles.secondaryCardText}>{t('produits.title')}</Text>
            </Pressable>
          </View>
        )}

        {screen === 'corrective' && (
          <View style={styles.card}>
            <Text style={styles.heading}>{t('corrective.walk_title')}</Text>
            {refused === undefined ? (
              // Honest empty state — never a synthetic refusal (verifier NB⑤).
              <Text style={styles.message}>{t('corrective.rien')}</Text>
            ) : (
              <>
                <Text style={styles.message}>
                  {t('refused.cause').replace(
                    '{issues}',
                    refused.refusedChecks!.map((key) => t(key)).join(', '),
                  )}
                </Text>
                <Text style={styles.message}>{t('refused.new_code')}</Text>
                <Text style={styles.deadline}>
                  {t('echeances.restant').replace('{min}', String(refused.correctionMinLeft ?? 0))}
                </Text>
                <Pressable
                  style={styles.primaryAction}
                  onPress={() => {
                    markCorrected(world, refused.id);
                    setWorld({ ...world });
                    setPendingKey('refused.fixed_pending');
                    go('pret');
                  }}
                >
                  <Text style={styles.primaryActionText}>{t('refused.fix_action')}</Text>
                </Pressable>
              </>
            )}
            <Pressable style={styles.quietAction} onPress={() => go('echeances')}>
              <Text style={styles.quietActionText}>{t('accueil.card_echeances')}</Text>
            </Pressable>
          </View>
        )}

        {screen === 'echeances' && (
          <View style={styles.listWrap}>
            <Text style={styles.heading}>{t('echeances.title')}</Text>
            <Text style={styles.message}>{t('echeances.regle')}</Text>
            <FlatList
              data={clocks}
              keyExtractor={(p) => p.id}
              initialNumToRender={6}
              windowSize={5}
              renderItem={({ item }) => (
                <View style={styles.listRow}>
                  <Text style={styles.listName}>{item.name}</Text>
                  <Text style={item.status === 'echeance_depassee' ? styles.badgeWarn : styles.badgeOk}>
                    {t(STATUS_KEY[item.status])}
                  </Text>
                  {item.status !== 'echeance_depassee' && (
                    <Text style={styles.deadline}>
                      {t('echeances.restant').replace('{min}', String(item.correctionMinLeft ?? 0))}
                    </Text>
                  )}
                </View>
              )}
            />
            <Pressable style={styles.secondaryCard} onPress={() => go('produits')}>
              <Text style={styles.secondaryCardText}>{t('produits.title')}</Text>
            </Pressable>
          </View>
        )}

        {pendingKey !== null && screen !== 'accueil' && (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingText}>{t(pendingKey)}</Text>
            <Text style={styles.pendingText}>{t('shell.offline_pending')}</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerHint}>{t('demo.donnees')}</Text>
        <Pressable style={styles.resetAction} onPress={reset}>
          <Text style={styles.resetActionText}>{t('nav.recommencer')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.surface },
  header: { paddingHorizontal: theme.spacing.xl, paddingTop: theme.spacing.md, minHeight: 44, justifyContent: 'center' },
  content: { flex: 1, paddingHorizontal: theme.spacing.xl, gap: theme.spacing.lg, justifyContent: 'center' },
  stackGap: { gap: theme.spacing.xl },
  brand: {
    color: theme.colors.primary,
    fontSize: theme.typeScale.title.size,
    lineHeight: theme.typeScale.title.lineHeight,
    fontWeight: theme.typeScale.title.weight,
    textAlign: 'center',
  },
  card: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    borderColor: theme.colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    padding: theme.spacing.xl,
    gap: theme.spacing.lg,
  },
  listWrap: { flex: 1, gap: theme.spacing.md, paddingVertical: theme.spacing.md },
  listRow: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    borderColor: theme.colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    gap: theme.spacing.xs,
    minHeight: 44,
  },
  listName: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.bodyLarge.size,
    lineHeight: theme.typeScale.bodyLarge.lineHeight,
    fontWeight: theme.typeScale.heading.weight,
  },
  listMeta: { color: theme.colors.inkMuted, fontSize: theme.typeScale.label.size, lineHeight: theme.typeScale.label.lineHeight },
  listNet: { color: theme.colors.primary, fontSize: theme.typeScale.bodyLarge.size, lineHeight: theme.typeScale.bodyLarge.lineHeight, fontWeight: theme.typeScale.title.weight },
  badgeOk: { color: theme.colors.primary, fontSize: theme.typeScale.label.size, lineHeight: theme.typeScale.label.lineHeight },
  badgeWarn: { color: theme.colors.ink, fontSize: theme.typeScale.label.size, lineHeight: theme.typeScale.label.lineHeight, fontWeight: theme.typeScale.heading.weight },
  heading: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.heading.size,
    lineHeight: theme.typeScale.heading.lineHeight,
    fontWeight: theme.typeScale.heading.weight,
    textAlign: 'center',
  },
  message: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.bodyLarge.size,
    lineHeight: theme.typeScale.bodyLarge.lineHeight,
    textAlign: 'center',
  },
  netAmount: {
    color: theme.colors.primary,
    fontSize: theme.typeScale.title.size,
    lineHeight: theme.typeScale.title.lineHeight,
    fontWeight: theme.typeScale.title.weight,
    textAlign: 'center',
  },
  baselineCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderColor: theme.colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    padding: theme.spacing.lg,
    gap: theme.spacing.xs,
  },
  baselineTitle: { color: theme.colors.ink, fontSize: theme.typeScale.bodyLarge.size, lineHeight: theme.typeScale.bodyLarge.lineHeight, fontWeight: theme.typeScale.heading.weight, textAlign: 'center' },
  baselineLine: { color: theme.colors.ink, fontSize: theme.typeScale.label.size, lineHeight: theme.typeScale.label.lineHeight, textAlign: 'center' },
  photoFrame: {
    minHeight: 160,
    borderRadius: theme.radius.lg,
    borderColor: theme.colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
  },
  photoHint: { color: theme.colors.inkMuted, fontSize: theme.typeScale.label.size, lineHeight: theme.typeScale.label.lineHeight, textAlign: 'center' },
  deadline: {
    color: theme.colors.ink,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
    fontWeight: theme.typeScale.heading.weight,
    textAlign: 'center',
  },
  pendingCard: {
    backgroundColor: theme.colors.surfaceRaised,
    borderRadius: theme.radius.lg,
    borderColor: theme.colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    padding: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  pendingText: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
    textAlign: 'center',
  },
  primaryAction: {
    minHeight: 44,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  primaryActionText: {
    color: theme.colors.surfaceRaised,
    fontSize: theme.typeScale.bodyLarge.size,
    fontWeight: theme.typeScale.heading.weight,
  },
  secondaryCard: {
    minHeight: 44,
    borderRadius: theme.radius.lg,
    borderColor: theme.colors.line,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: theme.colors.surfaceRaised,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  secondaryCardText: { color: theme.colors.ink, fontSize: theme.typeScale.bodyLarge.size },
  quietAction: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  quietActionText: { color: theme.colors.inkMuted, fontSize: theme.typeScale.label.size },
  backAction: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: theme.spacing.md },
  backActionText: { color: theme.colors.ink, fontSize: theme.typeScale.bodyLarge.size },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xl,
    paddingBottom: theme.spacing.md,
    minHeight: 44,
  },
  footerHint: { color: theme.colors.inkMuted, fontSize: theme.typeScale.label.size },
  resetAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: theme.spacing.md },
  resetActionText: { color: theme.colors.inkMuted, fontSize: theme.typeScale.label.size },
  previewBanner: {
    backgroundColor: theme.colors.ink,
    paddingVertical: theme.spacing.xs,
    alignItems: 'center',
  },
  previewBannerText: {
    color: theme.colors.surfaceRaised,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
  },
});
