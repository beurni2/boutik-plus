/**
 * CONFIER-CARTE — HER PIN ON A MAP, ON HIS FOLD (founder, 2026-08-31: « i
 * want the pin localization on the map displayed so i can know the buyer's
 * location before relaying to the rider »).
 *
 * DISPLAY-ONLY, deliberately: the pin already rides the Séra brief by itself
 * (CONFIER-AUTO) — this card changes nothing on any wire. It exists so the
 * founder RECOGNIZES the neighbourhood before « Créer la course »: a static
 * grid of OpenStreetMap tiles centred on her confirmed point, the pin marker
 * over the centre, the OSM credit riding the view (their attribution policy
 * asks for a clearly visible credit; the app's no-emoji chrome rule bans the
 * copyright glyph, so the words « Cartes OpenStreetMap » carry it).
 *
 * WHY NO LIBRARY (the shop-plus geo-carte precedent, its math mirrored): a
 * map at ONE fixed zoom with no interaction is Web-Mercator arithmetic plus
 * a handful of <Image> tiles — deterministic and dependency-free. A tile
 * that cannot load leaves the calm ground (the vignette discipline: the
 * failed URL is hidden, never a broken glyph); her position is the FIX,
 * never the tiles.
 *
 * WHAT THIS MODULE NEVER DOES: no drag, no zoom chrome, no sensor, no
 * link-out — and it keeps no coordinate. The pin is the same privacy class
 * as her phone: it renders on the founder's authenticated console and exits
 * nowhere new (the tile server learns only which map squares were fetched,
 * exactly as it already does for her own capture on the buyer PWA).
 */
import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { P } from '../ui/v2/palette';
import { role } from '../ui/v2/styles';
import { t } from '../i18n';

const TUILE = 256;

/** One fixed zoom, one step wider than the buyer's capture (her z17 is for
 *  PLACING a point; his card is for KNOWING a neighbourhood): ~2.4 m/px in
 *  Ouagadougou — the quartier's main roads readable in a 180 dp card. */
export const CARTE_ZOOM = 16;

/** The window the tile grid must cover, in dp around the centre. The card
 *  is full-width, so the half-width must clear HALF THE WIDEST phone this
 *  console meets (~430 dp ⇒ 215), or the widest screens would show bare
 *  ground where tiles belong (verifier MINOR, fixed in-build); the frame
 *  clips the rest on narrower phones. */
const DEMI_L = 215;
const DEMI_H = 100;

/** Web-Mercator forward: degrees → world pixels at `zoom` (the shop-plus
 *  geo-carte formula, verbatim — one projection across the ecosystem). */
export function geoVersMonde(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = TUILE * Math.pow(2, zoom);
  const rad = (lat * Math.PI) / 180;
  return {
    x: ((lng + 180) / 360) * n,
    y: ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n,
  };
}

/** Tile URL — x wraps around the antimeridian, y outside the globe is null
 *  (those rows do not exist; the view shows its own calm ground). */
export function urlTuile(zoom: number, xt: number, yt: number): string | null {
  const cote = Math.pow(2, zoom);
  if (yt < 0 || yt >= cote) return null;
  const x = ((xt % cote) + cote) % cote;
  return `https://tile.openstreetmap.org/${zoom}/${x}/${yt}.png`;
}

export interface TuilePosee {
  readonly url: string;
  /** Offset of the tile's top-left corner from the view CENTRE, in dp —
   *  the centre is her pin, whatever width the card actually gets. */
  readonly dx: number;
  readonly dy: number;
}

/** The grid that covers the window around her pin, each tile with its
 *  centre-relative offset. Pure — the walks and the mutation tests drive
 *  this exact function. */
export function tuilesPourPin(pin: { lat: number; lng: number }): readonly TuilePosee[] {
  const c = geoVersMonde(pin.lat, pin.lng, CARTE_ZOOM);
  const x0 = Math.floor((c.x - DEMI_L) / TUILE);
  const x1 = Math.floor((c.x + DEMI_L) / TUILE);
  const y0 = Math.floor((c.y - DEMI_H) / TUILE);
  const y1 = Math.floor((c.y + DEMI_H) / TUILE);
  const posees: TuilePosee[] = [];
  for (let yt = y0; yt <= y1; yt += 1) {
    for (let xt = x0; xt <= x1; xt += 1) {
      const url = urlTuile(CARTE_ZOOM, xt, yt);
      if (url === null) continue;
      posees.push({ url, dx: xt * TUILE - c.x, dy: yt * TUILE - c.y });
    }
  }
  return posees;
}

const CREDIT = role({ f: 'IS', w: 400, s: 10 }, P.sub);

/** The pin glyph — the ecosystem's épingle (shop-plus geo-carte path): the
 *  dot is a fill-rule HOLE, one token colour, zero hardcoded hex. */
const EPINGLE = 36;
function Epingle() {
  return (
    <Svg
      width={EPINGLE}
      height={EPINGLE}
      viewBox="0 0 24 24"
      fill={P.greenDeep}
      fillRule="evenodd"
      accessibilityRole="image"
    >
      <Path d="M12 2a7 7 0 0 0-7 7c0 4.9 5.7 11.4 6.6 12.4a.55.55 0 0 0 .8 0C13.3 20.4 19 13.9 19 9a7 7 0 0 0-7-7zm0 4.4a2.6 2.6 0 1 1 0 5.2 2.6 2.6 0 0 1 0-5.2z" />
    </Svg>
  );
}

/** Read-only map card: tiles centred on her pin, the marker's TIP on the
 *  point (the glyph's tip sits at ~21.4/24 of its height). */
export function CartePin({ lat, lng }: { lat: number; lng: number }) {
  // The vignette discipline: a tile that failed once is hidden for this
  // mount — the calm ground shows through, never a broken image glyph.
  const [mortes, setMortes] = useState<ReadonlySet<string>>(new Set());
  const tuiles = tuilesPourPin({ lat, lng }).filter((p) => !mortes.has(p.url));
  return (
    <View
      style={{
        height: 180,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: P.bg,
        borderWidth: 1,
        borderColor: P.borderCard,
      }}
    >
      {tuiles.map((p) => (
        <Image
          key={p.url}
          source={{ uri: p.url }}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            marginLeft: p.dx,
            marginTop: p.dy,
            width: TUILE,
            height: TUILE,
          }}
          onError={() => setMortes((m) => new Set(m).add(p.url))}
        />
      ))}
      <View
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          marginLeft: -EPINGLE / 2,
          // The tip on the point: 21.4/24 of the glyph height above centre.
          marginTop: -Math.round((EPINGLE * 21.4) / 24),
        }}
      >
        <Epingle />
      </View>
      <Text style={[CREDIT, { position: 'absolute', right: 6, bottom: 4 }]}>{t('confier.carte_osm')}</Text>
    </View>
  );
}
