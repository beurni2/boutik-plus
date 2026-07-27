import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { GEO, SHADOW } from '../ui/v2/tokens';
import { C21, role } from '../ui/v2/styles';
import { t } from '../i18n';
import { Banner, C07BtnPrimary, HeaderStacked } from './components';
import { decodeRefusalSentence, type ShootBanner } from '../studio/pick';
import { noPhotoSentenceKey, roleTitleKey } from '../studio/review';
import type { StudioShootProps } from './studio-shoot';

/**
 * BOUTIK-WEB-W2/W3 — THE WEB SHOOTING SCREEN: upload-first, camera-free
 * (W-D1 founder-ruled 2026-07-26: *« allow uploads for proof too, i will only
 * be using photo upload on this webapp and never camera capture »*), and the
 * pane is the DROP CONTAINER (W3).
 *
 * Metro resolves `./studio-shoot` HERE in a web bundle. Consequences:
 *   · **`expo-camera` never enters the web import graph** (gate-enforced).
 *   · **No camera-only proof refusal on this surface** — W-D1 makes upload the
 *     path for ALL THREE roles here; the sentence would claim a rule that no
 *     longer governs this surface. Native keeps it.
 *
 * THE DROP CONTAINER (W3): pointer devices only, BY NATURE not by sniffing —
 * drag events simply never fire on touch. The hint sentence alone is gated on
 * `(hover: hover)` — a pointer that hovers is a pointer that drags — because
 * inviting a drag on a phone would be an instruction the device cannot
 * follow. (The B+I-12 vocabulary gate bans the CSS pointer-precision
 * keyword's English homograph, so the hover query carries this role.) Dropping is an ADDITIONAL entry on the
 * SAME seam: the file goes up through `onDropAsset` into the one shared funnel
 * (`shotFromAsset` — decode → strip → assert); there is no drop-only path and
 * never a laxer one. `dragover.preventDefault()` is what makes the element a
 * drop target at all, and `drop.preventDefault()` is what stops the BROWSER
 * navigating away to render the image — each is load-bearing, neither is
 * ceremony. Only `files[0]` is taken: single-selection parity with the picker
 * (`allowsMultipleSelection: false`).
 *
 * THE OBJECT URL IS DELIBERATELY NEVER REVOKED: it is the shot's `masterUri`,
 * and the publish path reads the master's own bytes back through `fetch(uri)`
 * for the REAL master hash — revoking early would break that read into a false
 * record. Three page-lifetime object URLs per listing is the accepted cost,
 * stated here rather than discovered later.
 *
 * `onShot`/`onFailed` are part of the shared props but never called here: the
 * two intakes are the pick funnel and the drop, and both surface faults
 * through the funnel's own typed outcomes.
 */
/**
 * THE MINIMAL DOM SURFACE, declared locally on purpose: this project's
 * tsconfig has no `dom` lib — the RIGHT setting for a native codebase, where a
 * leaked `window` in shared code is a runtime crash. Only this web-resolved
 * file touches the DOM, so only this file declares exactly what it touches.
 */
interface DomFile { readonly type: string; readonly name: string }
interface DomDragEvent {
  preventDefault(): void;
  readonly dataTransfer: { readonly files?: ArrayLike<DomFile | undefined> } | null;
}
interface DomEventTarget {
  addEventListener(type: string, handler: (e: DomDragEvent) => void): void;
  removeEventListener(type: string, handler: (e: DomDragEvent) => void): void;
}
declare const window: { matchMedia?: (query: string) => { matches: boolean } } | undefined;
declare const URL: { createObjectURL(file: DomFile): string };

export function StudioShoot({ shotRole, banner, onPick, onDropAsset, onBack }: StudioShootProps) {
  const paneRef = useRef<View | null>(null);
  const [hover, setHover] = useState(false);

  // The hint invites a DRAG, so it shows only where the pointer can hover.
  const pointerHovers =
    typeof window !== 'undefined' &&
    typeof window?.matchMedia === 'function' &&
    window.matchMedia('(hover: hover)').matches;

  useEffect(() => {
    // react-native-web backs a View with a real DOM element; the ref IS that
    // element on web. Guarded so a non-DOM environment simply has no drop.
    const node = paneRef.current as unknown as (DomEventTarget & { addEventListener?: unknown }) | null;
    if (node === null || typeof node.addEventListener !== 'function') return;
    const over = (e: DomDragEvent) => {
      e.preventDefault(); // this is what makes the pane a drop target
      setHover(true);
    };
    const leave = () => setHover(false);
    const drop = (e: DomDragEvent) => {
      e.preventDefault(); // without this the browser navigates to the image
      setHover(false);
      const file = e.dataTransfer?.files?.[0];
      if (file === undefined) return; // a text/link drag — nothing to take
      onDropAsset({ uri: URL.createObjectURL(file), mimeType: file.type, fileName: file.name });
    };
    node.addEventListener('dragover', over);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    return () => {
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, [onDropAsset]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingTop: GEO.screenPad.top, paddingHorizontal: GEO.screenPad.side }}>
        <HeaderStacked title="Boutik+ Studio" onBack={onBack} />
        <Text style={role({ f: 'IS', w: 400, s: 12 }, P.sub)}>{t('studio.honnete_ia')}</Text>
        <Text style={[role({ f: 'BG', w: 700, s: 20 }, P.ink), { marginTop: 14 }]}>{t(roleTitleKey(shotRole))}</Text>
      </View>

      {/* the pane: same region the review pane and the native viewfinder use.
          Pressing it does exactly what the primary button does — one ACTION,
          two targets. The dashed frame is VISIBLE on the surface (the W2 note:
          the guide-style inset was white-on-white); on hover-with-a-file it
          answers in supply green. */}
      <View style={{ flex: 1, marginTop: 13 }}>
        <Pressable
          ref={paneRef}
          onPress={onPick}
          accessibilityRole="button"
          style={{
            flex: 1,
            borderRadius: C21.viseur.r,
            overflow: 'hidden',
            boxShadow: SHADOW.heroStudio,
            backgroundColor: hover ? P.greenSoft : P.surface,
            borderWidth: 1.5,
            borderStyle: hover ? 'solid' : 'dashed',
            borderColor: hover ? P.green : P.borderCtl,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {pointerHovers && (
            <Text style={role({ f: 'IS', w: 500, s: 13 }, hover ? P.green : P.sub)}>
              {t('studio.glisser_ici')}
            </Text>
          )}
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
