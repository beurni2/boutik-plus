import { Text, View } from 'react-native';
import { P } from '../ui/v2/palette';
import { GEO } from '../ui/v2/tokens';
import { role } from '../ui/v2/styles';
import { t as tr } from '../i18n';

/**
 * VIDEO-PARTOUT — the clip on HIS OWN product page, NATIVE half (see
 * `fiche-video.web.tsx` for the real one: the listing surface is a webapp by
 * founder ruling, exactly like `studio/pick-video`).
 *
 * Native has no `<video>`, and this app carries no media module — so this half
 * states the TRUTH it can state: the product HAS a clip. That is the answer to
 * « did my clip ride? », which is the whole reason this surface exists; a
 * silent nothing here would recreate the gap. Metro resolves per platform;
 * tsc and vitest resolve this file.
 */
export function FicheVideo({
  src,
}: {
  readonly src?: string | undefined;
  /** Accepted so BOTH halves share one contract (tsc resolves this file);
   *  unused here — there is no element to poster. */
  readonly poster?: string | undefined;
}): React.ReactElement | null {
  if (src === undefined || src === '') return null;
  return (
    <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: GEO.r.banner, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: P.successBg }}>
      <Text style={[role({ f: 'IS', w: 400, s: 13, lh: 1.55 }, P.successFg), { flex: 1 }]}>
        {tr('produits.video_presente')}
      </Text>
    </View>
  );
}
