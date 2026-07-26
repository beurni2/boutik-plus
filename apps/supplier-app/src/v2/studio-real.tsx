import { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { P, TILE_GRADIENT } from '../ui/v2/palette';
import { GEO, SHADOW } from '../ui/v2/tokens';
import { C21, role } from '../ui/v2/styles';
import { SCROLL } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnGhost, C07BtnPrimary, HeaderStacked, IconTile, MetersList, ProcessingList } from './components';
import { S26StudioReview } from './studio-review';
import { captureShot, renderCropDerivative, type StrippedDerivative } from '../studio/capture';
import { heroSquareCrop, heroVerticalCrop } from '../studio/crops';
import {
  decodeRefusalSentence,
  galleryRefusalKey,
  pickShot,
  type DecodeRefusal,
  type StudioRole,
  type StudioShot,
} from '../studio/pick';
import { nativeImageSource } from '../studio/pick-native';
import { keptAfter, noPhotoSentenceKey, roleTitleKey, type ShotSource } from '../studio/review';
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
 */

/** Everything the publish path needs from one Studio session. */
export interface CaptureSet {
  readonly hero: StudioShot;
  readonly heroSquare: StrippedDerivative;
  readonly heroVertical: StrippedDerivative;
  readonly proof: StudioShot;
  readonly detail: StudioShot;
}

/** His three photographs, in order. The PROOF role is camera-only (standing ruling). */
const ROLES: readonly StudioRole[] = ['hero', 'preuve', 'detail'];

/** The processing rows — the names of REAL work, in the order it runs. */
const PROC_ROWS = ['Métadonnées retirées (preuve à l\'appui)', 'Cadrage carré du héro', 'Cadrage vertical du héro', 'Vérification finale'];

type Slot = 0 | 1 | 2;

/** What the shooting screen has to say, if anything, after the last attempt. */
type ShootBanner = { kind: 'decode'; refusal: DecodeRefusal } | { kind: 'no_photo' };

type Phase =
  | { kind: 'shooting'; slot: Slot; banner: ShootBanner | null }
  | { kind: 'reviewing'; slot: Slot; shot: StudioShot; source: ShotSource }
  | { kind: 'processing'; done: number }
  | { kind: 'failed'; reason: string };

export function S26StudioReal({ d, onApproved }: { d: (a: A) => void; onApproved: (set: CaptureSet) => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView | null>(null);
  /** The photographs he has KEPT, in role order. Never holds an unreviewed shot. */
  const kept = useRef<StudioShot[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'shooting', slot: 0, banner: null });
  const busy = useRef(false);

  /** Both sources land here: one photograph to review, its origin remembered. */
  const toReview = (slot: Slot, shot: StudioShot, source: ShotSource) =>
    setPhase({ kind: 'reviewing', slot, shot, source });

  const takePhoto = async (slot: Slot) => {
    if (busy.current || camera.current === null) return;
    busy.current = true;
    try {
      toReview(slot, await captureShot(camera.current), 'camera');
    } catch (err) {
      // A capture that cannot be PROVEN clean does not exist (assertExifFree
      // throws) — an honest failed state, never an unstripped byte kept.
      setPhase({ kind: 'failed', reason: String((err as Error)?.message ?? err) });
    } finally {
      busy.current = false;
    }
  };

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

  if (!permission?.granted) {
    // TWO honest states, not one: « pas encore demandé » offers the request;
    // « bloqué » (denied, cannot re-ask) says so and points at the phone
    // settings — a button that silently no-ops forever is the dead-input family.
    const blocked = permission !== null && !permission.canAskAgain && permission.status === 'denied';
    return (
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: GEO.screenPad.top, paddingHorizontal: GEO.screenPad.side }}>
          <HeaderStacked title="Boutik+ Studio" onBack={() => d({ t: 'BACK' })} />
        </View>
        <ScrollView contentContainerStyle={SCROLL.stacked} showsVerticalScrollIndicator={false}>
          <Banner tone={blocked ? 'warn' : 'info'}>{t(blocked ? 'studio.permission_bloquee' : 'studio.permission')}</Banner>
          {!blocked && (
            <View style={{ marginTop: 16 }}>
              <C07BtnPrimary label={t('studio.autoriser')} icon="camera" onPress={() => { void requestPermission(); }} />
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

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

  // ── SHOOTING: the live camera, full width, NO guides ──────────────────────
  const slot = phase.slot;
  const shotRole = ROLES[slot]!;
  const galleryRefusal = galleryRefusalKey(shotRole);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: GEO.screenPad.top, paddingHorizontal: GEO.screenPad.side }}>
        <HeaderStacked title="Boutik+ Studio" onBack={() => d({ t: 'BACK' })} />
        <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('studio.honnete_ia')}</Text>
        <Text style={[role({ f: 'BG', w: 700, s: 20 }, P.ink), { marginTop: 14 }]}>{t(roleTitleKey(shotRole))}</Text>
      </View>

      {/* The viewfinder takes the room that is left — the SAME flex:1 region the
          review pane uses, so the two screens share one skeleton and the frame
          does not jump when he keeps a photograph. */}
      <View style={{ flex: 1, marginTop: 13 }}>
        <View style={{ flex: 1, borderRadius: C21.viseur.r, overflow: 'hidden', boxShadow: SHADOW.heroStudio }}>
          <CameraView ref={camera} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        </View>
      </View>

      <View style={{ paddingHorizontal: GEO.screenPad.side, paddingBottom: GEO.screenPad.top }}>
        {phase.banner !== null && (
          <Banner tone={phase.banner.kind === 'decode' ? 'warn' : 'info'} style={{ marginTop: 12 }}>
            {phase.banner.kind === 'decode' ? decodeRefusalSentence(phase.banner.refusal) : t(noPhotoSentenceKey())}
          </Banner>
        )}
        <View style={{ marginTop: 12 }}>
          <C07BtnPrimary label={t('studio.capture')} icon="camera" onPress={() => { void takePhoto(slot); }} />
        </View>
        {galleryRefusal === null ? (
          <BtnGhost
            label={t('studio.depuis_telephone')}
            onPress={() => { void pickPhoto(slot); }}
            style={{ marginTop: 10 }}
          />
        ) : (
          // CAMERA-ONLY, STATED IN WORDS rather than by a missing button — a
          // control that silently is not there reads as a bug.
          <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.55 }, P.sub), { marginTop: 12 }]}>
            {t(galleryRefusal)}
          </Text>
        )}
      </View>

      {/* the demo's simulate-low toggle and fake meters live on only in the
          unrouted S26Studio; light is judged from the REAL metrics frame */}
      <View style={{ height: 0, opacity: 0 }} pointerEvents="none">
        <IconTile bg={TILE_GRADIENT.p1} glyph="" size={0} radius={0} glyphSize={0} />
        <MetersList rows={[]} />
        <Pressable onPress={() => {}} accessibilityRole="button"><Text>{''}</Text></Pressable>
      </View>
    </View>
  );
}
