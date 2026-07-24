/**
 * SUPPLIER-AUTHORING-1 part 2 — THE AUTHORING SCREEN. The founder's first real
 * write from a phone: he types a product, taps once, and an offer exists in the
 * live offer-service. No terminal, no seed script, no demo world.
 *
 * WHAT THIS SCREEN DECIDES: nothing. Validation, the command shape, and every
 * publish state come from `src/supply/authoring.ts` (pure, tested); the service
 * comes from `src/supply/service.ts` (`null` when unconfigured — never a demo).
 * This file composes C## components over that logic and renders its states.
 *
 * THE STATES, and why each one is designed rather than defaulted:
 *   · NON CONFIGURÉ — the seam resolved to `null`. **Not an error** (founder
 *     ruling): a calm info line at the top, stated before he types rather than
 *     after he taps, and the primary action is disabled so he never walks into a
 *     dead end. It says only what is true — nothing will be sent — and promises
 *     nothing about drafts being kept, because nothing keeps them yet.
 *   · INVALID — every problem at once, in his words, above the button.
 *   · ENVOI — the button goes quiet and says so; no spinner theatre.
 *   · PUBLIÉ — the form is replaced by the outcome: the offer reference (his only
 *     way to check the product from Shop+) and, when the service returned one,
 *     the seller net IT computed. Never a locally computed figure.
 *   · REFUSÉ / ÉCHEC — the service's own words, verbatim, never a generic wall.
 *     On a phone with no terminal that string is the entire diagnostic.
 *
 * NO PHOTOGRAPHS THIS SLICE — stated on the screen (« Ce produit part sans
 * photo »), not hidden. The wire carries `assetRefs: []`.
 *
 * HARD GATE — ONE SUPPLIER. `SUPPLIER_ID` is the founder's own id, hardcoded
 * because he is the only author and the write key is shared (see the service
 * header). A second supplier requires real per-supplier identity FIRST; this
 * constant must not become a picker.
 */
import { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { GEO } from '../ui/v2/tokens';
import { SCROLL, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { formatF } from './money';
import { Banner, BtnGhost, C07BtnPrimary, HeaderStacked, Input, Overline } from './components';
import { mintCommandId } from '../offline/commandId';
import { resolveSupplyService } from '../supply/service';
import {
  offerWindow,
  publish,
  type AuthoringContext,
  type AuthoringForm,
  type FieldError,
  type PublishState,
} from '../supply/authoring';
import { randomSuffixBytes, suggestProductCode } from '../supply/product-code';

/** The founder's supplier id (services/offer-service `FOUNDER_001_SUPPLIER_ID`). See the HARD GATE above. */
const SUPPLIER_ID = 'supplier-founder-001';

/** Set at authoring — the founder is the only supplier. HARD GATE in authoring.ts. */
const MODERATION_STATE = 'approved';

const EMPTY: AuthoringForm = {
  name: '',
  productCode: '',
  category: '',
  zone: '',
  basePrice: '',
  resellerCommission: '',
  available: '',
};

/** Typed refusal → the catalog string. Exhaustive by construction (Record<FieldError, …>). */
const ERROR_KEY: Record<FieldError, string> = {
  name_required: 'publier.err_nom',
  product_code_required: 'publier.err_code',
  category_required: 'publier.err_categorie',
  zone_required: 'publier.err_zone',
  base_price_invalid: 'publier.err_prix',
  base_price_below_floor: 'publier.err_prix_plancher',
  commission_invalid: 'publier.err_commission',
  available_invalid: 'publier.err_stock',
};

const body = role({ f: 'IS', w: 400, s: 13.5, lh: 1.55 }, P.inkSoft);
const bodySub = role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.sub);
const reference = role({ f: 'IS', w: 600, s: 15 }, P.ink);
const netAmount = role({ f: 'BG', w: 700, s: 26 }, P.ink);

export function SPublier({ onBack }: { onBack: () => void }) {
  // Resolved ONCE per mount. `null` means unconfigured — the honest state, and the
  // only alternative to the real HTTP client (there is no demo branch to reach).
  const service = useMemo(() => resolveSupplyService(), []);
  const [form, setForm] = useState<AuthoringForm>(EMPTY);
  const [state, setState] = useState<PublishState | null>(null);
  // Once he edits the code himself, the suggestion stops touching it — he is the
  // author, the system was only suggesting (founder ruling).
  const [codeTouched, setCodeTouched] = useState(false);
  const set = (patch: Partial<AuthoringForm>) => setForm((f) => ({ ...f, ...patch }));

  // The suffix entropy is drawn ONCE per mount so the suggestion is stable while
  // he types the name (only the stem follows the name). `null` when no CSPRNG is
  // available: then nothing is suggested at all rather than a code minted from a
  // weak source — he types his own, and an empty one is refused before the network.
  const suffixBytes = useMemo(() => {
    try {
      return randomSuffixBytes();
    } catch {
      return null;
    }
  }, []);

  /**
   * The product code SUGGESTION (founder ruling: derived, VISIBLE and EDITABLE).
   * It fills the code field visibly as he types the name — no hidden affordance,
   * nothing stamped on his product behind his back — and stops the moment he
   * edits it. Whatever the field holds at publish is what is sent.
   */
  const onName = (v: string) => {
    if (codeTouched || suffixBytes === null) return set({ name: v });
    return set({ name: v, productCode: v.trim().length === 0 ? '' : suggestProductCode(v, suffixBytes) });
  };
  const onCode = (v: string) => {
    setCodeTouched(true);
    set({ productCode: v });
  };

  const onPublish = async () => {
    if (state?.kind === 'sending') return;
    setState({ kind: 'sending' });
    let ctx: AuthoringContext;
    try {
      const now = new Date().toISOString();
      const win = offerWindow(now);
      ctx = {
        supplierId: SUPPLIER_ID,
        productVersionId: mintCommandId(), // OS CSPRNG (expo-crypto); throws if absent
        offerId: mintCommandId(),
        commandId: mintCommandId(),
        now,
        effective: win.effective,
        expiry: win.expiry,
        moderationState: MODERATION_STATE,
      };
    } catch (err) {
      // An unavailable CSPRNG is an honest failure, never a weaker id source.
      setState({ kind: 'failed', reason: String((err as Error)?.message ?? err) });
      return;
    }
    setState(await publish(service, form, ctx));
  };

  // ── PUBLIÉ — the form is done; show the outcome, and one way back. ──────────
  if (state?.kind === 'published') {
    return (
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: 16, paddingHorizontal: GEO.screenPad.side }}>
          <HeaderStacked title={t('publier.titre')} onBack={onBack} />
        </View>
        <ScrollView contentContainerStyle={SCROLL.stacked} showsVerticalScrollIndicator={false}>
          <Banner tone="success" check>{t('publier.publie')}</Banner>
          <View style={{ marginTop: 18 }}>
            <Overline>{t('publier.reference')}</Overline>
            <Text style={[reference, { marginTop: 6 }]} selectable>{state.offerId}</Text>
          </View>
          {state.sellerNetFcfa !== undefined && (
            <View style={{ marginTop: 18 }}>
              <Overline>{t('publier.net')}</Overline>
              <Text style={[netAmount, { marginTop: 6 }]} numberOfLines={1}>{formatF(state.sellerNetFcfa)}</Text>
            </View>
          )}
          <Text style={[bodySub, { marginTop: 18 }]}>{t('publier.validite')}</Text>
          <View style={{ marginTop: 22 }}>
            <BtnGhost label={t('publier.retour')} onPress={onBack} />
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── THE FORM ───────────────────────────────────────────────────────────────
  const sending = state?.kind === 'sending';
  const errors = state?.kind === 'invalid' ? state.errors : [];
  // The service ANSWERED and declined, or the call failed: the same tap is now a
  // retry, and says so. A local validation refusal is not a retry — nothing was
  // sent — so it keeps « Publier ».
  const answered = state?.kind === 'refused' || state?.kind === 'failed';
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: 16, paddingHorizontal: GEO.screenPad.side }}>
        <HeaderStacked title={t('publier.titre')} onBack={onBack} />
      </View>
      <ScrollView contentContainerStyle={SCROLL.stacked} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {service === null && (
          // Calm, stated FIRST — this is a condition, not a failure. Tone info.
          <View style={{ marginBottom: 18 }}>
            <Banner tone="info">{t('publier.non_configure')}</Banner>
          </View>
        )}

        <Input label={t('publier.champ_nom')} value={form.name} onChangeText={onName} />
        <View style={{ marginTop: 16 }}>
          <Input label={t('publier.champ_code')} value={form.productCode} onChangeText={onCode} />
          <Text style={[bodySub, { marginTop: 6 }]}>{t('publier.champ_code_aide')}</Text>
        </View>
        <View style={{ marginTop: 16 }}>
          <Input label={t('publier.champ_categorie')} value={form.category} onChangeText={(v) => set({ category: v })} />
        </View>
        <View style={{ marginTop: 16 }}>
          <Input label={t('publier.champ_zone')} value={form.zone} onChangeText={(v) => set({ zone: v })} />
        </View>
        <View style={{ marginTop: 16 }}>
          <Input label={t('publier.champ_prix')} value={form.basePrice} onChangeText={(v) => set({ basePrice: v })} keyboardType="number-pad" />
        </View>
        <View style={{ marginTop: 16 }}>
          <Input label={t('publier.champ_commission')} value={form.resellerCommission} onChangeText={(v) => set({ resellerCommission: v })} keyboardType="number-pad" />
        </View>
        <View style={{ marginTop: 16 }}>
          <Input label={t('publier.champ_stock')} value={form.available} onChangeText={(v) => set({ available: v })} keyboardType="number-pad" />
        </View>

        <Text style={[body, { marginTop: 20 }]}>{t('publier.sans_photo')}</Text>
        <Text style={[bodySub, { marginTop: 8 }]}>{t('publier.validite')}</Text>

        {errors.length > 0 && (
          <View style={{ marginTop: 16 }}>
            <Banner tone="warn">{errors.map((e) => t(ERROR_KEY[e])).join('\n')}</Banner>
          </View>
        )}
        {state?.kind === 'refused' && (
          <View style={{ marginTop: 16 }}>
            <Banner tone="warn">{`${t('publier.refuse')}\n${state.reason}`}</Banner>
          </View>
        )}
        {state?.kind === 'failed' && (
          <View style={{ marginTop: 16 }}>
            <Banner tone="danger">{`${t('publier.echec')}\n${state.reason}`}</Banner>
          </View>
        )}
        {state?.kind === 'not_configured' && (
          <View style={{ marginTop: 16 }}>
            <Banner tone="info">{t('publier.non_configure')}</Banner>
          </View>
        )}

        <View style={{ marginTop: 22 }}>
          <C07BtnPrimary
            label={sending ? t('publier.envoi') : answered ? t('publier.reessayer') : t('publier.action')}
            onPress={() => { void onPublish(); }}
            disabled={service === null || sending}
            {...(answered ? { icon: 'retry' as const } : {})}
          />
        </View>
      </ScrollView>
    </View>
  );
}
