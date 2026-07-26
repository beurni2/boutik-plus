import { useEffect, useRef, type MutableRefObject } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { P, TILE_GRADIENT } from '../ui/v2/palette';
import { GEO, SHADOW } from '../ui/v2/tokens';
import { C21, role, SCROLL } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, BtnGhost, C07BtnPrimary, HeaderStacked, IconTile, MetersList } from './components';
import { captureShot } from '../studio/capture';
import { decodeRefusalSentence, galleryRefusalKey, type ShootBanner, type StudioRole, type StudioShot } from '../studio/pick';
import { noPhotoSentenceKey, roleTitleKey } from '../studio/review';

/**
 * BOUTIK-WEB-W2 — THE NATIVE SHOOTING SCREEN, platform-split out of
 * `studio-real.tsx` so the web target never imports `expo-camera` (whose web
 * build spins a QR worker that fetches jsQR from a CDN at import — the W1
 * named finding). Metro resolves `./studio-shoot` to THIS file on Android/iOS
 * and to `studio-shoot.web.tsx` in a web bundle; tsc and vitest resolve here,
 * so the native path stays the typechecked, tested default.
 *
 * EXTRACTED, NOT REDESIGNED: the permission gate (two honest states), the
 * full-width guideless camera, the capture primary, the gallery secondary with
 * the camera-only proof refusal STATED IN WORDS — all verbatim from
 * studio-real. The parked native app keeps the behaviour the founder
 * device-verified; only the file moved. The camera capture handler moved WITH
 * the camera because it needs the ref; its outcome flows up through the same
 * two callbacks the pick path uses.
 */
export interface StudioShootProps {
  readonly shotRole: StudioRole;
  readonly banner: ShootBanner | null;
  /** THE ONE BUSY GUARD, owned by studio-real (W2 verifier, Deviation A): the
   * old file serialized capture AND pick through a single ref, so tapping the
   * gallery mid-capture no-op'd. Splitting the screen must not split the
   * guard — both intakes still exclude each other through THIS ref. */
  readonly busy: MutableRefObject<boolean>;
  /** The shared pick funnel (studio-real owns it — one funnel, both platforms). */
  readonly onPick: () => void;
  /** A camera capture to review. Web never calls this (no camera exists there). */
  readonly onShot: (shot: StudioShot) => void;
  /** A capture that cannot be proven clean — the designed failed state. */
  readonly onFailed: (reason: string) => void;
  readonly onBack: () => void;
}

/**
 * BRIDGES THE PERMISSION FLASH (W2 verifier, Deviation B — blocking). This
 * screen unmounts on every review/processing phase and remounts on return, and
 * `useCameraPermissions` starts each mount at `null` (its state is per-hook,
 * fetched post-commit) — so without a bridge the « Autoriser » gate paints for
 * a frame between EVERY kept photograph and the next viewfinder, on exactly
 * the low-end hardware the doctrine names. Old behaviour (hook in the parent,
 * mounted for the whole session): the gate showed once, at entry.
 *
 * The cache bridges ONLY the `null` (not-yet-answered) frame after a grant has
 * been seen. A REAL denial (`permission.granted === false`) still gates, every
 * time — the two honest states are untouched.
 */
let cameraGrantedOnce = false;

export function StudioShoot({ shotRole, banner, busy, onPick, onShot, onFailed, onBack }: StudioShootProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView | null>(null);

  useEffect(() => {
    if (permission?.granted) cameraGrantedOnce = true;
  }, [permission]);

  const takePhoto = async () => {
    if (busy.current || camera.current === null) return;
    busy.current = true;
    try {
      onShot(await captureShot(camera.current));
    } catch (err) {
      // A capture that cannot be PROVEN clean does not exist (assertExifFree
      // throws) — an honest failed state, never an unstripped byte kept.
      onFailed(String((err as Error)?.message ?? err));
    } finally {
      busy.current = false;
    }
  };

  // `null` = the hook hasn't answered THIS mount yet; a seen grant bridges that
  // frame (see cameraGrantedOnce above). An ANSWERED non-grant always gates.
  const gateVisible = permission === null ? !cameraGrantedOnce : !permission.granted;
  if (gateVisible) {
    // TWO honest states, not one: « pas encore demandé » offers the request;
    // « bloqué » (denied, cannot re-ask) says so and points at the phone
    // settings — a button that silently no-ops forever is the dead-input family.
    const blocked = permission !== null && !permission.canAskAgain && permission.status === 'denied';
    return (
      <View style={{ flex: 1 }}>
        <View style={{ paddingTop: GEO.screenPad.top, paddingHorizontal: GEO.screenPad.side }}>
          <HeaderStacked title="Boutik+ Studio" onBack={onBack} />
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

  const galleryRefusal = galleryRefusalKey(shotRole);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: GEO.screenPad.top, paddingHorizontal: GEO.screenPad.side }}>
        <HeaderStacked title="Boutik+ Studio" onBack={onBack} />
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
        {banner !== null && (
          <Banner tone={banner.kind === 'decode' ? 'warn' : 'info'} style={{ marginTop: 12 }}>
            {banner.kind === 'decode' ? decodeRefusalSentence(banner.refusal) : t(noPhotoSentenceKey())}
          </Banner>
        )}
        <View style={{ marginTop: 12 }}>
          <C07BtnPrimary label={t('studio.capture')} icon="camera" onPress={() => { void takePhoto(); }} />
        </View>
        {galleryRefusal === null ? (
          <BtnGhost
            label={t('studio.depuis_telephone')}
            onPress={onPick}
            style={{ marginTop: 10 }}
          />
        ) : (
          // CAMERA-ONLY, STATED IN WORDS rather than by a missing button — a
          // control that silently is not there reads as a bug. NATIVE ONLY:
          // the founder's W-D1 ruling scopes the upload-for-proof allowance to
          // the web surface; the parked app keeps the standing rule.
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
