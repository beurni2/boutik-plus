import { createElement } from 'react';
import { View } from 'react-native';
import { GEO } from '../ui/v2/tokens';

/** The photo column cap, mirrored from screens1.tsx so the clip shares the
 *  photograph's frame on wide screens instead of stretching past it. */
const PHOTO_FRAME_MAX = 680;

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
    <View style={{ marginTop: 14, alignItems: 'center' }}>
      {createElement('video', {
        src,
        ...(poster !== undefined && poster !== '' ? { poster } : {}),
        muted: true,
        loop: true,
        autoPlay: true,
        playsInline: true,
        preload: 'metadata',
        // THE PHOTO'S FRAME, EXACTLY (founder order 2026-08-03: « make it be
        // like photo frame but playing the video »).
        //
        // A `maxHeight` was the first attempt and he was right to reject it: a
        // cap stops a clip filling the screen but leaves it a DIFFERENT SHAPE
        // from every photograph beside it, so the fiche read as two competing
        // frames. These four values are copied from the photo's own style in
        // screens1.tsx — same width rule, same 680 column cap, same square, same
        // radius — so the clip is simply one more tile in his gallery that
        // happens to move. `objectFit: cover` is the photo's `resizeMode`.
        //
        // KEEP THESE IN STEP WITH THE PHOTO. If the photo's frame changes and
        // this does not, the two drift apart again and the report comes back;
        // the pin in fiche-video.test.ts asserts they match, value by value.
        //
        // ONE COMPONENT, BOTH SCREENS — the fiche and the fournisseur card
        // render this same element, which is why his report named « produits »
        // AND « mes produits », and why one change answers both.
        style: {
          width: '100%',
          maxWidth: PHOTO_FRAME_MAX,
          aspectRatio: 1,
          objectFit: 'cover',
          borderRadius: GEO.r.iconTile,
          display: 'block',
        },
      })}
    </View>
  );
}
