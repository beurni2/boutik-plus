import { useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { role, SCROLL } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, C07BtnPrimary, HeaderStacked, ProcessingList } from './components';
import { S26StudioReview } from './studio-review';
import { renderCropDerivative, type StrippedDerivative } from '../studio/capture';
import { heroSquareCrop, heroVerticalCrop } from '../studio/crops';
import { pickShot, shotFromAsset, type PickedAsset, type ShootBanner, type StudioRole, type StudioShot } from '../studio/pick';
import { nativeImageSource } from '../studio/pick-native';
import { keptAfter, type ShotSource } from '../studio/review';
import { StudioShoot } from './studio-shoot';
import type { A } from './machine';

/**
 * BOUTIK+ STUDIO — ONE PHOTOGRAPH AT A TIME, REVIEWED BEFORE THE NEXT
 * (founder reshape 2026-07-25: *"MOST PRODUCT PICTURES WILL COME FROM THE
 * GALLERY, not the camera"*, plus one review step per role).
 *
 * **WHAT CHANGED FROM THE FLOW THIS REPLACES.** It shot three times in a row,
 * then batch-processed, then showed ONE review of everything at the end. Now
 * each photograph is chosen or shot, reviewed on its own with the crop guides
 * drawn on the real image, and kept or replaced before the next begins.
 *
 * **THE CROP RENDER DID NOT MOVE, AND THAT IS THE PLAIN ANSWER RATHER THAN THE
 * TIDY ONE.** The guides on the review are pure arithmetic over
 * `shot.master.width/height` — no bitmap is decoded to draw them. So the two
 * hero crops still render once, after all three photographs are kept, exactly
 * as before: peak memory on a 2 GB phone is unchanged. And a late crop failure
 * now costs LESS than it did, because re-doing the hero no longer discards the
 * proof and the detail with it.
 *
 * **THE LIVE CAMERA CARRIES NO GUIDES.** It fills the region it is given, full
 * width, and claims nothing about the still's aspect — which is precisely why
 * the guides moved to review, where the dimensions are known rather than
 * assumed.
 *
 * Approval hands the capture set UP to the wizard wrapper (uploads happen at
 * publish, not here) and dispatches the machine's own `STUDIO_APPROVE`, so
 * `wiz.photos` and the return-to-wizard transition stay §4's, not a parallel
 * copy. The demo `S26Studio` stays in screens2.tsx, untouched and unrouted.
 *
 * **BOUTIK-WEB-W2: the SHOOTING SCREEN is platform-resolved** (`./studio-shoot`
 * → `.web.tsx` in a web bundle), so this file — the phase machine, the pick
 * funnel, the crop render — is platform-free and `expo-camera` never enters
 * the web import graph. One funnel, both platforms: `pickPhoto` below is the
 * only intake on web (W-D1 founder ruling: uploads for all roles there) and
 * the gallery secondary on native.
 */

/** Everything the publish path needs from one Studio session. */
export interface CaptureSet {
  readonly hero: StudioShot;
  readonly heroSquare: StrippedDerivative;
  readonly heroVertical: StrippedDerivative;
  readonly proof: StudioShot;
  readonly detail: StudioShot;
}

/** His three photographs, in order. The PROOF role is camera-only ON NATIVE
 * (standing ruling); on web, uploads serve all three roles (W-D1, 2026-07-26). */
const ROLES: readonly StudioRole[] = ['hero', 'preuve', 'detail'];

/** The processing rows — the names of REAL work, in the order it runs. */
const PROC_ROWS = ['Métadonnées retirées (preuve à l\'appui)', 'Cadrage carré du héro', 'Cadrage vertical du héro', 'Vérification finale'];

type Slot = 0 | 1 | 2;

type Phase =
  | { kind: 'shooting'; slot: Slot; banner: ShootBanner | null }
  | { kind: 'reviewing'; slot: Slot; shot: StudioShot; source: ShotSource }
  | { kind: 'processing'; done: number }
  | { kind: 'failed'; reason: string };

export function S26StudioReal({ d, onApproved }: { d: (a: A) => void; onApproved: (set: CaptureSet) => void }) {
  /** The photographs he has KEPT, in role order. Never holds an unreviewed shot. */
  const kept = useRef<StudioShot[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'shooting', slot: 0, banner: null });
  const busy = useRef(false);

  /** Both sources land here: one photograph to review, its origin remembered.
   * The camera source lives inside the NATIVE shoot screen (it owns the ref);
   * its outcome arrives through `onShot` below. */
  const toReview = (slot: Slot, shot: StudioShot, source: ShotSource) =>
    setPhase({ kind: 'reviewing', slot, shot, source });

  const pickPhoto = async (slot: Slot) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const out = await pickShot(nativeImageSource);
      // A CANCEL is not a fault: he backed out, the screen stays where it was.
      if (out.kind === 'picked') toReview(slot, out.shot, 'gallery');
      else if (out.kind === 'refused') setPhase({ kind: 'shooting', slot, banner: { kind: 'decode', refusal: out.refusal } });
      // NOTHING CAME BACK. He may have backed out, or the phone may have
      // refused to open the library at all — the picker reports both the same
      // way. Saying so beats a button that appears dead.
      else setPhase({ kind: 'shooting', slot, banner: { kind: 'no_photo' } });
    } catch (err) {
      // A STRIP failure reaches here, not the typed refusal — bytes that cannot
      // be proven clean fail closed, exactly as on the camera path.
      setPhase({ kind: 'failed', reason: String((err as Error)?.message ?? err) });
    } finally {
      busy.current = false;
    }
  };

  /** A DROPPED file (web, BOUTIK-WEB-W3): the same funnel from the asset
   * onward — `shotFromAsset` cannot answer `cancelled` (an asset in hand is
   * past backing out), so the outcomes here are exactly picked/refused/fault,
   * handled identically to the pick path above. Same busy ref: a drop during
   * a mid-flight pick no-ops rather than racing it. */
  const dropPhoto = async (slot: Slot, asset: PickedAsset) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const out = await shotFromAsset(nativeImageSource, asset);
      if (out.kind === 'picked') toReview(slot, out.shot, 'gallery');
      else setPhase({ kind: 'shooting', slot, banner: { kind: 'decode', refusal: out.refusal } });
    } catch (err) {
      setPhase({ kind: 'failed', reason: String((err as Error)?.message ?? err) });
    } finally {
      busy.current = false;
    }
  };

  /** « Garder cette photo » — banked in role order; the last one starts the crops. */
  const keep = (slot: Slot, shot: StudioShot) => {
    kept.current = [...keptAfter(kept.current, slot, shot)];
    const next = slot + 1;
    if (next < ROLES.length) {
      setPhase({ kind: 'shooting', slot: next as Slot, banner: null });
      return;
    }
    void renderHeroCrops();
  };

  /** THE ONLY BITMAP WORK IN THE FLOW — two crops of the hero, once, at the end. */
  const renderHeroCrops = async () => {
    const [hero, proof, detail] = kept.current as [StudioShot, StudioShot, StudioShot];
    setPhase({ kind: 'processing', done: 1 }); // the strip already ran per photograph
    try {
      // THE CROP RECT IS COMPUTED IN THE MASTER'S OWN PIXEL SPACE — the rect is
      // applied to masterUri, so it must come from master dimensions. The
      // derivative's dimensions here selected a ~8% corner fragment on a 12MP
      // camera, silently (verifier finding, HIGH — fixed and pinned).
      const heroSquare = await renderCropDerivative(hero.masterUri, heroSquareCrop(hero.master.width, hero.master.height));
      setPhase({ kind: 'processing', done: 2 });
      const heroVertical = await renderCropDerivative(hero.masterUri, heroVerticalCrop(hero.master.width, hero.master.height));
      setPhase({ kind: 'processing', done: 4 });
      onApproved({ hero, heroSquare, heroVertical, proof, detail });
      d({ t: 'STUDIO_APPROVE' }); // §4's own transition, dispatched — never copied here
    } catch (err) {
      setPhase({ kind: 'failed', reason: String((err as Error)?.message ?? err) });
    }
  };

  // The camera-permission gate lives in the NATIVE shoot screen now (it owns
  // the camera); web needs none — a file input asks nothing up front.

  if (phase.kind === 'reviewing') {
    const slot = phase.slot;
    const shot = phase.shot;
    return (
      <S26StudioReview
        shot={shot}
        role={ROLES[slot]!}
        source={phase.source}
        onKeep={() => keep(slot, shot)}
        onChooseAnother={() => setPhase({ kind: 'shooting', slot, banner: null })}
        onBack={() => d({ t: 'BACK' })}
      />
    );
  }

  if (phase.kind === 'processing') {
    return (
      <ScrollView contentContainerStyle={SCROLL.stacked} showsVerticalScrollIndicator={false}>
        <HeaderStacked title="Boutik+ Studio" onBack={() => d({ t: 'BACK' })} />
        <Text style={[role({ f: 'BG', w: 700, s: 20 }, P.ink), { marginTop: 16 }]}>{'Traitement (sur votre téléphone)'}</Text>
        <View style={{ marginTop: 13 }}>
          <ProcessingList rows={[...PROC_ROWS]} proc={phase.done} />
        </View>
      </ScrollView>
    );
  }

  if (phase.kind === 'failed') {
    return (
      <ScrollView contentContainerStyle={SCROLL.stacked} showsVerticalScrollIndicator={false}>
        <HeaderStacked title="Boutik+ Studio" onBack={() => d({ t: 'BACK' })} />
        <View style={{ marginTop: 16 }}>
          <Banner tone="warn">{`${t('studio.echec')}\n${phase.reason}`}</Banner>
        </View>
        <View style={{ marginTop: 12 }}>
          <C07BtnPrimary
            label={t('publier.reessayer')}
            icon="retry"
            onPress={() => { kept.current = []; setPhase({ kind: 'shooting', slot: 0, banner: null }); }}
          />
        </View>
      </ScrollView>
    );
  }

  // ── SHOOTING: the platform's own intake screen (camera on native, upload on
  //    web — Metro resolves `./studio-shoot` per platform) ────────────────────
  const slot = phase.slot;
  return (
    <StudioShoot
      shotRole={ROLES[slot]!}
      banner={phase.banner}
      busy={busy}
      onPick={() => { void pickPhoto(slot); }}
      onDropAsset={(asset) => { void dropPhoto(slot, asset); }}
      onShot={(shot) => toReview(slot, shot, 'camera')}
      onFailed={(reason) => setPhase({ kind: 'failed', reason })}
      onBack={() => d({ t: 'BACK' })}
    />
  );
}
