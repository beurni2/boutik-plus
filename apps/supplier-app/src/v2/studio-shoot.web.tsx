import { Pressable, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { GEO, SHADOW } from '../ui/v2/tokens';
import { C21, C39G, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, C07BtnPrimary, HeaderStacked } from './components';
import { decodeRefusalSentence, type ShootBanner } from '../studio/pick';
import { noPhotoSentenceKey, roleTitleKey } from '../studio/review';
import type { StudioShootProps } from './studio-shoot';

/**
 * BOUTIK-WEB-W2 — THE WEB SHOOTING SCREEN: upload-first, camera-free
 * (Boutik-Plus-Web North Star, W-D1 founder-ruled 2026-07-26: *« allow uploads
 * for proof too, i will only be using photo upload on this webapp and never
 * camera capture »*).
 *
 * Metro resolves `./studio-shoot` HERE in a web bundle. Two consequences, both
 * deliberate:
 *   · **`expo-camera` never enters the web import graph** — which also removes
 *     the W1 finding (its web build fetches jsQR from a CDN at import).
 *   · **There is no camera-only proof refusal on this screen.** On native the
 *     proof role refuses the gallery in words; here the founder's ruling makes
 *     upload the path for ALL THREE roles, so the refusal sentence would claim
 *     a rule that no longer governs this surface.
 *
 * THE SAME SKELETON AS NATIVE AND REVIEW: header, honesty line, role title,
 * a flex:1 pane, actions below — so keeping a photograph does not jump the
 * frame. The pane is the W3 drop container's future home; in W2 it is a
 * designed empty surface in the viseur's own geometry (kit values only), and
 * pressing it does exactly what the primary button does — one ACTION, two
 * targets, not two actions.
 *
 * `onShot`/`onFailed` are part of the shared props but never called here: the
 * only intake is the pick funnel, and its faults surface through the funnel's
 * own typed outcomes (banner) or its designed failed state upstream.
 */
export function StudioShoot({ shotRole, banner, onPick, onBack }: StudioShootProps) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: GEO.screenPad.top, paddingHorizontal: GEO.screenPad.side }}>
        <HeaderStacked title="Boutik+ Studio" onBack={onBack} />
        <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('studio.honnete_ia')}</Text>
        <Text style={[role({ f: 'BG', w: 700, s: 20 }, P.ink), { marginTop: 14 }]}>{t(roleTitleKey(shotRole))}</Text>
      </View>

      {/* the pane: same region the review pane and the native viewfinder use */}
      <View style={{ flex: 1, marginTop: 13 }}>
        <Pressable
          onPress={onPick}
          accessibilityRole="button"
          style={{ flex: 1, borderRadius: C21.viseur.r, overflow: 'hidden', boxShadow: SHADOW.heroStudio, backgroundColor: P.surface }}
        >
          {/* the square guide's own inset frame, empty — the honest « nothing
              chosen yet » state in the geometry the image will occupy */}
          <View pointerEvents="none" style={[C39G.square, { position: 'absolute', top: 24, left: 24, right: 24, bottom: 24 }]} />
        </Pressable>
      </View>

      <View style={{ paddingHorizontal: GEO.screenPad.side, paddingBottom: GEO.screenPad.top }}>
        {banner !== null && (
          <Banner tone={banner.kind === 'decode' ? 'warn' : 'info'} style={{ marginTop: 12 }}>
            {banner.kind === 'decode' ? decodeRefusalSentence(banner.refusal) : t(noPhotoSentenceKey())}
          </Banner>
        )}
        <View style={{ marginTop: 12 }}>
          <C07BtnPrimary label={t('studio.depuis_telephone')} onPress={onPick} />
        </View>
      </View>
    </View>
  );
}
