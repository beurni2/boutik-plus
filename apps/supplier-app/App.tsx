import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { boutikPlusTheme as theme } from '@platform/ui-tokens';
import { assertQuoteReconciles, computeWaterfall } from '@platform/contracts';
import { t } from './src/i18n';

/**
 * WO-1.4 supplier flow — onboard → product → offer (net preview) →
 * « Produit prêt ». One primary action per screen; every action taken
 * without the network is queued = PENDING (« En attente du réseau »), never
 * done — the E1 sandbox has no server, so pending stays honestly pending
 * and the live confirmations arrive at assembly. The « Vous recevrez X F »
 * figure comes from the pinned waterfall imported DIRECTLY — the v0.3.0
 * canon root is RN-safe, and this bundle is the proof. Money register:
 * calm, exact, cause stated when a price is blocked.
 */

type Step = 'onboard' | 'product' | 'offer' | 'ready' | 'refused';

// WO-2.6 sandbox refusal: the structured mismatch reason a Séra pickup
// refusal carries (failed checks), shown in the seller's own words. The E1/E2
// sandbox has no server — this state is reached via the explicit « Essai »
// path, never faked as live.
const DEMO_FAILED_CHECK_KEYS = ['check.colour', 'check.qty'] as const;

// E1 sandbox offer figures (B 10,000 · C 1,000 — the §5.4 baseline seller side).
const SANDBOX_B = 10_000;
const SANDBOX_C = 1_000;

function sellerNetFcfa(): number {
  const money = computeWaterfall({
    sellerBasePrice: SANDBOX_B,
    sellerFundedCommission: SANDBOX_C,
    resellerMarkup: 0,
    deliveryFee: 0,
    paymentMode: 'FULL_PREPAY',
  });
  assertQuoteReconciles(money);
  return money.sellerNet;
}

const formatFcfa = (n: number): string => n.toLocaleString('fr-FR').replace(/ | /g, ' ');

export default function App() {
  const [step, setStep] = useState<Step>('onboard');
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const advance = (next: Step, pendingMessageKey: string) => {
    // Queued offline = pending, never done; the step advances so the flow is
    // explorable, but the pending line stays until a server exists (assembly).
    setPendingKey(pendingMessageKey);
    setStep(next);
  };

  const netPreview = t('offer.net_preview').replace('{amount}', formatFcfa(sellerNetFcfa()));

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" backgroundColor={theme.colors.surface} />
      <View style={styles.content}>
        <Text style={styles.brand}>{t('app.title')}</Text>

        {step === 'onboard' && (
          <View style={styles.card}>
            <Text style={styles.message}>{t('onboarding.free_listing')}</Text>
            <Pressable style={styles.primaryAction} onPress={() => advance('product', 'onboard.phone_pending')}>
              <Text style={styles.primaryActionText}>{t('onboard.action')}</Text>
            </Pressable>
          </View>
        )}

        {step === 'product' && (
          <View style={styles.card}>
            <Text style={styles.heading}>{t('product.title')}</Text>
            <Pressable style={styles.primaryAction} onPress={() => advance('offer', 'product.saved_pending')}>
              <Text style={styles.primaryActionText}>{t('product.photo_action')}</Text>
            </Pressable>
          </View>
        )}

        {step === 'offer' && (
          <View style={styles.card}>
            <Text style={styles.heading}>{t('offer.title')}</Text>
            <Text style={styles.netAmount}>{netPreview}</Text>
            <Pressable style={styles.primaryAction} onPress={() => advance('ready', 'ready.pending')}>
              <Text style={styles.primaryActionText}>{t('ready.action')}</Text>
            </Pressable>
          </View>
        )}

        {step === 'ready' && (
          <View style={styles.card}>
            <Text style={styles.heading}>{t('ready.action')}</Text>
            <Text style={styles.message}>{t('ready.next')}</Text>
            <Text style={styles.deadline}>{t('deadline.today')}</Text>
            <Pressable style={styles.secondaryAction} onPress={() => setStep('refused')}>
              <Text style={styles.secondaryActionText}>{t('ready.demo_refusal')}</Text>
            </Pressable>
          </View>
        )}

        {step === 'refused' && (
          <View style={styles.card}>
            <Text style={styles.heading}>{t('refused.title')}</Text>
            <Text style={styles.message}>
              {t('refused.cause').replace('{issues}', DEMO_FAILED_CHECK_KEYS.map((key) => t(key)).join(', '))}
            </Text>
            <Text style={styles.message}>{t('refused.new_code')}</Text>
            <Text style={styles.deadline}>{t('deadline.today')}</Text>
            <Pressable style={styles.primaryAction} onPress={() => advance('ready', 'refused.fixed_pending')}>
              <Text style={styles.primaryActionText}>{t('refused.fix_action')}</Text>
            </Pressable>
          </View>
        )}

        {pendingKey !== null && (
          <View style={styles.pendingCard}>
            <Text style={styles.pendingText}>{t(pendingKey)}</Text>
            <Text style={styles.pendingText}>{t('shell.offline_pending')}</Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
    gap: theme.spacing.xl,
  },
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
    paddingHorizontal: theme.spacing.xl,
  },
  primaryActionText: {
    color: theme.colors.surface,
    fontSize: theme.typeScale.bodyLarge.size,
    lineHeight: theme.typeScale.bodyLarge.lineHeight,
  },
  deadline: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
    textAlign: 'center',
  },
  secondaryAction: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: {
    color: theme.colors.inkMuted,
    fontSize: theme.typeScale.label.size,
    lineHeight: theme.typeScale.label.lineHeight,
    textDecorationLine: 'underline',
  },
});
