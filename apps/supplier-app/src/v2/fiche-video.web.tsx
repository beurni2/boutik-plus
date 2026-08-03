import { createElement } from 'react';
import { View } from 'react-native';
import { GEO } from '../ui/v2/tokens';

/**
 * VIDEO-PARTOUT — the clip on HIS OWN product page, WEB half (the real one).
 *
 * React Native Web renders to the DOM, so a genuine `<video>` element is
 * legitimate here — the same element the buyer's vitrine and product page use,
 * with the same honesty kit: MUTED (autoplay's only respectful form), LOOP (a
 * 6-second clip that stops once reads as broken), PLAYSINLINE (never a
 * fullscreen hijack), `preload="metadata"` with the hero PHOTOGRAPH as poster
 * so a slow connection sees the product instantly.
 *
 * NO `data-role="video-hero"` HERE, deliberately: that role is the buyer PWA's
 * scroll-observer contract. This screen has one clip on screen at a time and no
 * observer; borrowing the role would imply machinery that does not exist here.
 */
export function FicheVideo({
  src,
  poster,
}: {
  readonly src?: string | undefined;
  readonly poster?: string | undefined;
}): React.ReactElement | null {
  if (src === undefined || src === '') return null;
  return (
    <View style={{ marginTop: 14, borderRadius: GEO.r.banner, overflow: 'hidden' }}>
      {createElement('video', {
        src,
        ...(poster !== undefined && poster !== '' ? { poster } : {}),
        muted: true,
        loop: true,
        autoPlay: true,
        playsInline: true,
        preload: 'metadata',
        // THE HEIGHT CAP (founder report 2026-08-03: « when I tap the video
        // product to see it, the frame becomes too big and filling the screen
        // which is inappropriate to see »). `width: 100%` with no height bound
        // means a PORTRAIT clip renders taller than it is wide — on a phone
        // that is most of the screen, and the name, the price and the actions
        // all fall below the fold. He is looking at a product record, not
        // watching a film.
        //
        // 320px keeps the clip to well under half a phone screen, so the facts
        // around it stay visible without scrolling. `objectFit: cover` matters
        // at the cap: without it a clip taller than 320 letterboxes inside its
        // own frame instead of filling it.
        //
        // ONE COMPONENT, BOTH SCREENS — this is why his report named « produits »
        // AND « mes produits »: the fiche and the fournisseur card render the
        // same element, so they were the same bug and this is the same fix.
        style: { width: '100%', maxHeight: 320, objectFit: 'cover', display: 'block' },
      })}
    </View>
  );
}
