/**
 * C07 BtnPrimary — style DATA (plain objects, no react-native import) so the
 * property-diff gate (test/pixel-property-diff.test.ts) can compare these
 * values to the Phase-0 table WITHOUT rendering. The component wraps them in
 * StyleSheet.create unchanged. PRIMARY GATE: empty property diff == value-pass.
 */
import { P, SH } from '../palette';

export const C07_STYLES = {
  btn: {
    height: 54,
    borderRadius: 16,
    backgroundColor: P.green,
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 9,
  },
  btnShadow: { boxShadow: SH.btnPrimary },
  btnPressed: { transform: [{ scale: 0.98 }], boxShadow: SH.btnPrimaryPressed },
  btnDisabled: { backgroundColor: P.disabledBg },
  label: {
    // display face, weight 700 (fonts.ts identity: BricolageGrotesque-Bold)
    fontFamily: 'BricolageGrotesque-Bold',
    fontSize: 16,
    fontWeight: '700' as const,
    // §9.2 FROZEN: source lh 'normal' → geler à 1.2 (16 × 1.2). The property
    // gate records this as a frozen-ruling pass, not a mismatch.
    lineHeight: 19.2,
    color: P.cream,
  },
  labelDisabled: { color: P.disabledFg },
} as const;
