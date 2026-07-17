/**
 * C02 StripeTissée — style DATA for the property-diff gate. The band is the
 * 38px cycle [green 18 · bg 6 · gold 8 · bg 6] at height 6 (Phase-0: the S02
 * stripe's repeating-linear-gradient stops, transcribed as literal segments —
 * RN has no repeating gradient; the 0.000 % visual diff proved equivalence).
 */
import { P } from '../palette';

export const C02_STYLES = {
  band: { height: 6, flexDirection: 'row' as const, overflow: 'hidden' as const, backgroundColor: P.bg },
} as const;

export const C02_CYCLE = [
  { w: 18, c: P.green },
  { w: 6, c: P.bg },
  { w: 8, c: P.gold },
  { w: 6, c: P.bg },
] as const;
