import { Pressable, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { P } from '../palette';
import { C07_STYLES } from './C07.styles';

/**
 * C07 BtnPrimary — HANDOFF V2 §2 C07 + §1.4 btnPrimary, matched to the Phase-0
 * computed values (S02 « Ajouter un produit »: 362×54, bg rgb(11,91,71), text
 * cream 16px BG700, r16, gap 9, flex-center, box-shadow
 * rgba(11,91,71,0.5) 0 12 26 -10):
 *   H 54 · r16 · fond green · texte cream BtnL (BG700/16) · ombre btnPrimary
 *   (boxShadow string — spread carried exactly) · icône 18 stroke 2.2 gap 9 ·
 *   pressé .98 (ombre btnPrimaryPressed) · désactivé disabledBg/disabledFg sans
 *   ombre.
 * NOTE: the computed padding-left 6px on the source <button> is the web UA
 * default (content is flex-centered, visually inert) — not reproduced (Δ-class:
 * UA artifact, same as PHASE0-DELTAS Δ1).
 */
export function C07BtnPrimary({
  label,
  onPress,
  icon,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  icon?: 'plus' | 'check' | 'camera' | undefined;
  disabled?: boolean | undefined;
  style?: StyleProp<ViewStyle>;
}) {
  const off = disabled === true;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off }}
      style={({ pressed }) => [
        styles.btn,
        off ? styles.btnDisabled : pressed ? styles.btnPressed : styles.btnShadow,
        style,
      ]}
    >
      {icon !== undefined && !off && (
        <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={P.cream} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          {icon === 'plus' && (
            <>
              <Path d="M12 5v14" />
              <Path d="M5 12h14" />
            </>
          )}
          {icon === 'check' && <Path d="M5 12.5l4.5 4.5L19 7.5" />}
          {icon === 'camera' && (
            <>
              <Path d="M4 8h3l2-2.5h6L17 8h3v11H4V8z" strokeWidth={1.9} />
              <Path d="M12 16.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z" strokeWidth={1.9} />
            </>
          )}
        </Svg>
      )}
      <Text style={[styles.label, off && styles.labelDisabled]}>{label}</Text>
    </Pressable>
  );
}

// style values live in C07.styles.ts (plain data) so the property-diff gate
// compares them to the Phase-0 table without rendering.
const styles = StyleSheet.create(C07_STYLES);
