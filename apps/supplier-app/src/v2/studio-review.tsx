import { useState } from 'react';
import { Image, Text, View, type LayoutChangeEvent } from 'react-native';
import { P } from '../ui/v2/palette';
import { GEO, SHADOW } from '../ui/v2/tokens';
import { C21, C39, C39G, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { BtnGhost, C07BtnPrimary, HeaderStacked } from './components';
import { reviewGuides, reviewPaneSize, roleTitleKey, secondaryActionKey, type ShotSource } from '../studio/review';
import type { StudioShot, StudioRole } from '../studio/pick';

/**
 * S26 STUDIO REVIEW — ONE IMAGE, THE GUIDES ON IT, KEEP OR CHOOSE ANOTHER
 * (founder reshape + composition ruling, 2026-07-25).
 *
 * Derived from the planche's Studio frame,
 * `design-reference/handoff_redesign/Boutik Plus - Redesign.dc.html` lines
 * 432–497, element by element — see
 * `_review/WO-FP-BOUTIK/anatomy/studio-review-composition-PROPOSAL.md` for the
 * grepped table and the complete divergence list.
 *
 * **THE PANE IS DERIVED FROM WHAT IS LEFT, NEVER FROM A NUMBER.** The pane
 * region is `flex: 1`, so the layout engine measures the remainder after the
 * real chrome — including a footer that wrapped to a fourth line on this
 * device's metrics — and `reviewPaneSize` caps and contains inside it. There is
 * no 480 anywhere in this file: a footer that grows costs pane, not a scroll.
 *
 * **THE PANE SHOWS THE DERIVATIVE**, not the master — the standing WYSIWYG law
 * (`capture.ts`): the stripped bytes are previewed and stored alike, so a
 * rotation or colour defect the strip introduced is visible here rather than
 * discovered on a vitrine. The pane's ASPECT comes from the master, because the
 * guides are computed in master space; the two differ by at most 0.069 % from
 * integer rounding at the 1280 resize — a third of a pixel on a 360-wide pane,
 * absorbed by `cover`.
 *
 * **GUIDES ON THE HERO ONLY.** `reviewGuides` returns `[]` for proof and detail
 * because only the hero master is cropped; a guide on a proof would claim a
 * cropping that does not happen.
 */
export function S26StudioReview({
  shot,
  role: shotRole,
  source,
  onKeep,
  onChooseAnother,
  onBack,
}: {
  shot: StudioShot;
  role: StudioRole;
  source: ShotSource;
  onKeep: () => void;
  onChooseAnother: () => void;
  onBack: () => void;
}) {
  // The measured remainder. Null until first layout — the pane is not guessed.
  const [space, setSpace] = useState<{ width: number; height: number } | null>(null);
  const onPaneLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSpace((prev) =>
      prev !== null && prev.width === width && prev.height === height ? prev : { width, height },
    );
  };

  const pane = space === null ? { width: 0, height: 0 } : reviewPaneSize(shot.master, space.width, space.height);
  const guides = space === null ? [] : reviewGuides(shotRole, shot.master, pane);

  return (
    <View style={{ flex: 1 }}>
      {/* ── chrome above (planche 433–442) ── */}
      <View style={{ paddingTop: GEO.screenPad.top, paddingHorizontal: GEO.screenPad.side }}>
        <HeaderStacked title="Boutik+ Studio" onBack={onBack} />
        <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('studio.honnete_ia')}</Text>
        <Text style={[role({ f: 'BG', w: 700, s: 20 }, P.ink), { marginTop: 14 }]}>
          {t(roleTitleKey(shotRole))}
        </Text>
      </View>

      {/* ── THE PANE REGION: flex:1 IS the derivation's input (planche 444) ── */}
      <View style={{ flex: 1, marginTop: 13, justifyContent: 'center' }} onLayout={onPaneLayout}>
        {pane.width > 0 && (
          <View
            style={{
              width: pane.width,
              height: pane.height,
              alignSelf: 'center',
              borderRadius: C21.viseur.r,
              overflow: 'hidden',
              boxShadow: SHADOW.heroStudio,
            }}
          >
            {/* the SHIPPED bytes, at the master's aspect */}
            <Image
              source={{ uri: shot.derivative.uri }}
              style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
              resizeMode="cover"
            />
            {guides.map((g) => (
              <View
                key={g.kind}
                pointerEvents="none"
                style={[
                  g.kind === 'square' ? C39G.square : C39G.vertical,
                  {
                    position: 'absolute',
                    left: g.rect.originX,
                    top: g.rect.originY,
                    width: g.rect.width,
                    height: g.rect.height,
                  },
                ]}
              />
            ))}
            {/* planche 448's caption slot, carrying the reused `studio.apercu` */}
            <Text style={C39.caption}>{t('studio.apercu')}</Text>
          </View>
        )}
      </View>

      {/* ── chrome below (planche 492 · 461 · 495) ── */}
      <View style={{ paddingHorizontal: GEO.screenPad.side, paddingBottom: GEO.screenPad.top }}>
        <View style={{ marginTop: 12 }}>
          <C07BtnPrimary label={t('studio.confirmer')} onPress={onKeep} />
        </View>
        <BtnGhost
          label={t(secondaryActionKey(source))}
          onPress={onChooseAnother}
          style={{ marginTop: 10 }}
        />
        <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.sub), { marginTop: 14 }]}>
          {t('studio.honnete_original')}
        </Text>
      </View>
    </View>
  );
}
