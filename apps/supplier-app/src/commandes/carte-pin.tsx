/**
 * CONFIER-CARTE — HER PIN ON A MAP, ON HIS FOLD (founder, 2026-08-31: « i
 * want the pin localization on the map displayed so i can know the buyer's
 * location before relaying to the rider »; 2026-09-01: « make slidable and
 * zoomable »).
 *
 * A small slippy map now, still DISPLAY-ONLY: the pin already rides the Séra
 * brief by itself (CONFIER-AUTO) — nothing here touches any wire, and no
 * gesture moves HER point. The view has a centre and a zoom; her pin renders
 * at its GEOGRAPHIC position inside that view (glued to the ground, never to
 * the frame), so sliding away simply leaves it behind and « Recentrer »
 * brings it back. OpenStreetMap tiles, their credit riding the view (the
 * no-emoji chrome rule bans the copyright glyph, so the words « Cartes
 * OpenStreetMap » carry it).
 *
 * WHY NO LIBRARY (the shop-plus geo-carte precedent, its math mirrored): a
 * slippy map at integer zooms is Web-Mercator arithmetic plus a grid of
 * <Image> tiles — deterministic and dependency-free. The drag follows the
 * buyer module's own laws: live translate while the finger moves, commit on
 * release with the SUBTRACTED offset (map dragged right ⇒ centre moved
 * west), and a press that never moved (< 4 px) commits nothing — a tap is
 * not a drag. Zoom is by steps (z13–z19, OSM's own ceiling) around the view
 * centre. A tile that cannot load leaves the calm ground (the vignette
 * discipline: the failed URL is hidden, never a broken glyph).
 *
 * THE CONTROLS ARE REAL 44 dp LAYOUT, not hitSlop: react-native-web 0.21
 * does not implement hitSlop on Pressable and this console SHIPS AS WEB
 * (the tap-targets-44 law's own finding). They sit ABOVE the drag surface,
 * so a tap on a control is never claimed by the map.
 *
 * WHAT THIS MODULE NEVER DOES: no sensor, no link-out — and it keeps no
 * coordinate beyond its own view state. The pin is the same privacy class
 * as her phone: it renders on the founder's authenticated console and exits
 * nowhere new (the tile server learns only which map squares were fetched,
 * exactly as it already does for her own capture on the buyer PWA).
 */
import { useRef, useState } from 'react';
import { Image, Pressable, Text, View, type GestureResponderEvent } from 'react-native';
import { Svg, Path } from 'react-native-svg';
import { P } from '../ui/v2/palette';
import { role } from '../ui/v2/styles';
import { t } from '../i18n';

const TUILE = 256;

/** The STARTING zoom, one step wider than the buyer's capture (her z17 is
 *  for PLACING a point; his card opens on KNOWING a neighbourhood):
 *  ~2.4 m/px in Ouagadougou. */
export const CARTE_ZOOM = 16;
/** His zoom range: z13 keeps him inside a city's frame (never a world map on
 *  a 180 dp card); z19 is OpenStreetMap's own deepest tile. */
export const ZOOM_MIN = 13;
export const ZOOM_MAX = 19;

/** The photograph law, applied to the map (founder report 2026-09-01:
 *  « this one is to large » — on a desktop browser the uncapped card ran
 *  the fold's whole width): THE CARD IS CAPPED, NEVER THE SCREEN — the
 *  same 340 dp the proof photo lives by. Full width on a phone, a calm
 *  card on a desktop. */
const CARTE_LARGEUR_MAX = 340;

/** The window the tile grid must cover, in dp around the centre — the
 *  half-width must clear half the cap above (170), held at 215 for margin;
 *  the frame clips the rest. The grid then adds ONE EXTRA RING beyond the
 *  window (the buyer module's law), so a drag meets tiles, not blank. */
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

/** Web-Mercator inverse: world pixels at `zoom` → degrees (the shop-plus
 *  formula, verbatim). */
export function mondeVersGeo(x: number, y: number, zoom: number): { lat: number; lng: number } {
  const n = TUILE * Math.pow(2, zoom);
  const lng = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lng };
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
  /** Offset of the tile's top-left corner from the view CENTRE, in dp. */
  readonly dx: number;
  readonly dy: number;
}

/** The grid that covers the window around the view's centre at its zoom,
 *  plus one ring so a drag meets tiles. Pure — the walks and the mutation
 *  tests drive this exact function. */
export function tuilesPourVue(centre: { lat: number; lng: number }, zoom: number): readonly TuilePosee[] {
  const c = geoVersMonde(centre.lat, centre.lng, zoom);
  const x0 = Math.floor((c.x - DEMI_L) / TUILE) - 1;
  const x1 = Math.floor((c.x + DEMI_L) / TUILE) + 1;
  const y0 = Math.floor((c.y - DEMI_H) / TUILE) - 1;
  const y1 = Math.floor((c.y + DEMI_H) / TUILE) + 1;
  const posees: TuilePosee[] = [];
  for (let yt = y0; yt <= y1; yt += 1) {
    for (let xt = x0; xt <= x1; xt += 1) {
      const url = urlTuile(zoom, xt, yt);
      if (url === null) continue;
      posees.push({ url, dx: xt * TUILE - c.x, dy: yt * TUILE - c.y });
    }
  }
  return posees;
}

/** Where a fixed geographic point sits inside the view, in dp from the view
 *  centre — the pin is GLUED TO THE GROUND, so this is what anchors it. */
export function posDansVue(
  point: { lat: number; lng: number },
  centre: { lat: number; lng: number },
  zoom: number,
): { dx: number; dy: number } {
  const p = geoVersMonde(point.lat, point.lng, zoom);
  const c = geoVersMonde(centre.lat, centre.lng, zoom);
  return { dx: p.x - c.x, dy: p.y - c.y };
}

/** The committed centre after a finished drag of (dx, dy) dp: the map moved
 *  right ⇒ the centre moved west — the offset SUBTRACTS (the buyer module's
 *  sign law, verbatim). */
export function centreApresGlisse(
  centre: { lat: number; lng: number },
  dx: number,
  dy: number,
  zoom: number,
): { lat: number; lng: number } {
  const c = geoVersMonde(centre.lat, centre.lng, zoom);
  return mondeVersGeo(c.x - dx, c.y - dy, zoom);
}

/** A press that never moved commits nothing — a tap is not a drag. */
const SEUIL_TAP = 4;

const CREDIT = role({ f: 'IS', w: 400, s: 10 }, P.sub);
const PUCE_TXT = role({ f: 'BG', w: 800, s: 16 }, P.ink);
const PUCE_PETIT = role({ f: 'BG', w: 800, s: 12 }, P.ink);

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

/** One map control: REAL 44 dp square (the tap-targets-44 law — hitSlop is
 *  inert on the shipped web build), calm card surface, token ink. */
function Puce({
  label,
  a11y,
  onPress,
  style,
  petit,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
  style?: object;
  petit?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={[
        {
          minWidth: 44,
          height: 44,
          paddingHorizontal: 10,
          borderRadius: 12,
          backgroundColor: P.surface,
          borderWidth: 1,
          borderColor: P.borderCtl,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}
    >
      <Text style={petit === true ? PUCE_PETIT : PUCE_TXT}>{label}</Text>
    </Pressable>
  );
}

/** The map card: slidable, zoomable, her pin glued to her point. */
export function CartePin({ lat, lng }: { lat: number; lng: number }) {
  const [vue, setVue] = useState<{ centre: { lat: number; lng: number }; zoom: number }>({
    centre: { lat, lng },
    zoom: CARTE_ZOOM,
  });
  /** Live drag offset (render only — the commit happens on release). */
  const [glisse, setGlisse] = useState<{ dx: number; dy: number } | null>(null);
  const depart = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  // The vignette discipline: a tile that failed once is hidden for this
  // mount — the calm ground shows through, never a broken image glyph.
  const [mortes, setMortes] = useState<ReadonlySet<string>>(new Set());

  const lacher = (): void => {
    const d = depart.current;
    depart.current = null;
    setGlisse(null);
    if (d === null) return;
    if (Math.abs(d.dx) + Math.abs(d.dy) < SEUIL_TAP) return;
    setVue((v) => ({ ...v, centre: centreApresGlisse(v.centre, d.dx, d.dy, v.zoom) }));
  };
  const zoomer = (pas: 1 | -1): void => {
    setVue((v) => ({ ...v, zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom + pas)) }));
  };

  const tuiles = tuilesPourVue(vue.centre, vue.zoom).filter((p) => !mortes.has(p.url));
  const epingle = posDansVue({ lat, lng }, vue.centre, vue.zoom);
  return (
    <View
      style={{
        width: '100%',
        maxWidth: CARTE_LARGEUR_MAX,
        height: 180,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: P.bg,
        borderWidth: 1,
        borderColor: P.borderCard,
      }}
    >
      <View
        testID="carte-toile"
        style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e: GestureResponderEvent) => {
          depart.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY, dx: 0, dy: 0 };
          setGlisse({ dx: 0, dy: 0 });
        }}
        onResponderMove={(e: GestureResponderEvent) => {
          const d = depart.current;
          if (d === null) return;
          d.dx = e.nativeEvent.pageX - d.x;
          d.dy = e.nativeEvent.pageY - d.y;
          setGlisse({ dx: d.dx, dy: d.dy });
        }}
        onResponderRelease={lacher}
        onResponderTerminate={lacher}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            transform: [{ translateX: glisse?.dx ?? 0 }, { translateY: glisse?.dy ?? 0 }],
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
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              marginLeft: epingle.dx - EPINGLE / 2,
              // The tip on the point: 21.4/24 of the glyph height above it.
              marginTop: epingle.dy - Math.round((EPINGLE * 21.4) / 24),
            }}
          >
            <Epingle />
          </View>
        </View>
      </View>
      {/* The controls live ABOVE the drag surface: a tap here is a tap. */}
      <View style={{ position: 'absolute', right: 6, top: 6, gap: 6 }}>
        <Puce label="+" a11y={t('confier.carte_plus')} onPress={() => zoomer(1)} />
        <Puce label="−" a11y={t('confier.carte_moins')} onPress={() => zoomer(-1)} />
      </View>
      <View style={{ position: 'absolute', left: 6, bottom: 6 }}>
        <Puce
          label={t('confier.carte_recentrer')}
          a11y={t('confier.carte_recentrer')}
          petit
          onPress={() => setVue((v) => ({ ...v, centre: { lat, lng } }))}
        />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', right: 6, bottom: 4 }}>
        <Text style={CREDIT}>{t('confier.carte_osm')}</Text>
      </View>
    </View>
  );
}
