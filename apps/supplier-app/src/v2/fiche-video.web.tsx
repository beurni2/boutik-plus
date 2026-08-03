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
        style: { width: '100%', display: 'block' },
      })}
    </View>
  );
}
