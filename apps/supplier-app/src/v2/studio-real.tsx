import { useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { role, SCROLL } from '../ui/v2/styles';
import { GEO } from '../ui/v2/tokens';
import { t } from '../i18n';
import { Banner, C07BtnPrimary, HeaderStacked, PhotoViewer } from './components';
import {
  pickShots,
  shotsFromAssets,
  type BatchOutcome,
  type PickedAsset,
  type ShootBanner,
  type StudioShot,
} from '../studio/pick';
import { PHOTOS_MAX, PHOTOS_MIN } from '../studio/roles';
import { nativeImageSource } from '../studio/pick-native';
import { StudioShoot } from './studio-shoot';
import type { A } from './machine';

/**
 * BOUTIK+ STUDIO — THE BATCH COLLECTOR (founder reshape 2026-07-27, STUDIO-
 * BATCH-1: *"select the photo from the gallery or my media folder and upload
 * at the same time instead just doing it one by one"* + *"instead being able
 * to upload 3 photos make it 4"*).
 *
 * **WHAT THIS SUPERSEDES, on the record.** The 2026-07-25 flow was a guided
 * walk — hero, then preuve, then détail, one photograph per role, each
 * reviewed on its own screen before the next. His 2026-07-27 sentences retire
 * both pillars: photographs arrive IN A BATCH (multi-select and multi-drop),
 * and the ROLES are chosen later, on the verify step (`studio/roles.ts`).
 * The per-photo review screen is gone with the walk; inspection lives where
 * it already existed — tap any thumbnail for the full-screen viewer here, and
 * the verify step shows every photograph large before publish.
 *
 * **WHAT DID NOT CHANGE.** Every photograph still walks the ONE funnel
 * (decode → bounded resize → our strip → `assertExifFree` on the shipped
 * bytes), one at a time — "at the same time" is the SELECTION, not the
 * processing, so peak memory on a 2 GB phone is still one decode. A refusal
 * still names the format. The hero's two crops still render exactly once —
 * now at PUBLISH (lister-real), where the assigned hero is finally known.
 *
 * 3 to 4 photographs: the MIN is what assembly requires (hero + preuve +
 * détail), the MAX is his fourth (a second détail — the wire cap of 6 refs
 * already fits it). « Continuer » opens at 3; the 4th is optional.
 */

/** Everything the publish path needs from one Studio session: the kept
 * photographs, IN PICK ORDER. Roles are assigned at the verify step. */
export interface CaptureSet {
  readonly photos: readonly StudioShot[];
}

type Phase =
  | { kind: 'collecting'; banner: ShootBanner | null }
  | { kind: 'failed'; reason: string };

export function S26StudioReal({ d, onApproved }: { d: (a: A) => void; onApproved: (set: CaptureSet) => void }) {
  const [shots, setShots] = useState<readonly StudioShot[]>([]);
  const [phase, setPhase] = useState<Phase>({ kind: 'collecting', banner: null });
  const [viewing, setViewing] = useState<{ uri: string; label: string } | null>(null);
  const busy = useRef(false);

  /** Fold one batch outcome into the collection — shared by pick and drop.
   * FUNCTIONAL updates throughout (verifier note 2026-07-27): a « Retirer »
   * landing while a batch decodes must compose, never be overwritten by a
   * stale closure. The re-slice against the CURRENT length is belt-and-braces
   * under the funnel's own bound. */
  const acceptBatch = (out: BatchOutcome) => {
    let sliced = 0;
    setShots((cur) => {
      const room = Math.max(0, PHOTOS_MAX - cur.length);
      sliced = out.shots.length - Math.min(out.shots.length, room);
      return [...cur, ...out.shots.slice(0, room)];
    });
    // BANNER PRIORITY: a refused file beats the ceiling beats a silent cancel.
    // The ceiling is an HONEST state (verifier finding: files turned away by
    // the 4-photo max were silently ignored — undesigned).
    if (out.refusal !== null) setPhase({ kind: 'collecting', banner: { kind: 'decode', refusal: out.refusal } });
    else if (out.overflow > 0 || sliced > 0) setPhase({ kind: 'collecting', banner: { kind: 'limite' } });
    else if (out.cancelled) setPhase({ kind: 'collecting', banner: { kind: 'no_photo' } });
    else setPhase({ kind: 'collecting', banner: null });
  };

  const pickBatch = async () => {
    if (busy.current) return;
    if (shots.length >= PHOTOS_MAX) {
      // a tap at the ceiling gets the sentence, never a dead button
      setPhase({ kind: 'collecting', banner: { kind: 'limite' } });
      return;
    }
    busy.current = true;
    try {
      acceptBatch(await pickShots(nativeImageSource, PHOTOS_MAX - shots.length));
    } catch (err) {
      // A STRIP failure reaches here, not the typed refusal — bytes that cannot
      // be proven clean fail closed, exactly as on the camera path.
      setPhase({ kind: 'failed', reason: String((err as Error)?.message ?? err) });
    } finally {
      busy.current = false;
    }
  };

  /** DROPPED files (web): the same funnel, the same bound, possibly several. */
  const dropBatch = async (assets: readonly PickedAsset[]) => {
    if (busy.current) return;
    if (shots.length >= PHOTOS_MAX) {
      setPhase({ kind: 'collecting', banner: { kind: 'limite' } });
      return;
    }
    busy.current = true;
    try {
      acceptBatch(await shotsFromAssets(nativeImageSource, assets, PHOTOS_MAX - shots.length));
    } catch (err) {
      setPhase({ kind: 'failed', reason: String((err as Error)?.message ?? err) });
    } finally {
      busy.current = false;
    }
  };

  /** A camera capture (native only) joins the batch like any other photograph. */
  const onShot = (shot: StudioShot) => {
    let full = false;
    setShots((cur) => {
      if (cur.length >= PHOTOS_MAX) { full = true; return cur; }
      return [...cur, shot];
    });
    setPhase({ kind: 'collecting', banner: full ? { kind: 'limite' } : null });
  };

  const approve = () => {
    if (shots.length < PHOTOS_MIN) return;
    onApproved({ photos: shots });
    d({ t: 'STUDIO_APPROVE' }); // §4's own transition, dispatched — never copied here
  };

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
            onPress={() => { setShots([]); setPhase({ kind: 'collecting', banner: null }); }}
          />
        </View>
      </ScrollView>
    );
  }

  const counter = t('studio.compteur')
    .replace('{n}', String(shots.length))
    .replace('{max}', String(PHOTOS_MAX));

  return (
    <StudioShoot
      banner={phase.banner}
      busy={busy}
      subtitle={counter}
      onPick={() => { void pickBatch(); }}
      onDropAssets={(assets) => { void dropBatch(assets); }}
      onShot={onShot}
      onFailed={(reason) => setPhase({ kind: 'failed', reason })}
      onBack={() => d({ t: 'BACK' })}
    >
      {shots.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          {shots.map((s, i) => (
            <View key={`${i}-${s.derivative.uri.slice(-24)}`} style={{ flex: 1, maxWidth: 96 }}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setViewing({ uri: s.derivative.uri, label: t('studio.photo_n').replace('{n}', String(i + 1)) })}
              >
                {/* the thumbnail IS the shipped derivative — what he checks is what uploads */}
                <PhotoThumb uri={s.derivative.uri} />
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setShots((cur) => cur.filter((_, j) => j !== i))} hitSlop={10}>
                <Text style={[role({ f: 'IS', w: 500, s: 11.5 }, P.sub), { marginTop: 5, textAlign: 'center' }]}>
                  {t('studio.retirer')}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      {shots.length >= PHOTOS_MIN ? (
        <View style={{ marginTop: 14 }}>
          <C07BtnPrimary label={t('studio.continuer')} onPress={approve} />
        </View>
      ) : (
        <Text style={[role({ f: 'IS', w: 400, s: 12.5, lh: 1.5 }, P.sub), { marginTop: 12 }]}>
          {t('studio.minimum').replace('{min}', String(PHOTOS_MIN))}
        </Text>
      )}
      <PhotoViewer photo={viewing} onClose={() => setViewing(null)} />
    </StudioShoot>
  );
}

/** One square thumbnail on the collect grid. */
function PhotoThumb({ uri }: { uri: string }) {
  return <Image source={{ uri }} style={{ width: '100%', aspectRatio: 1, borderRadius: GEO.r.iconTile }} resizeMode="cover" />;
}
