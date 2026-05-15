import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { fonts, tokens } from '@/theme/tokens';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Full-width 50px dark button with an accent chevron tail — the design's
 * primary CTA (`start fast`, `end fast`, `save`, etc.). Mirrors the
 * inline `PrimaryButton` defined alongside the drawer designs.
 */
export function PrimaryButton({ label, onPress, disabled = false, style }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.btn,
        pressed && !disabled && { opacity: 0.85 },
        disabled && { opacity: 0.35 },
        style,
      ]}>
      <Text style={styles.label}>{label}</Text>
      <Svg width={10} height={10} viewBox="0 0 10 10">
        <Path
          d="M3 2l3 3-3 3"
          stroke={tokens.accent}
          strokeWidth={1.6}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 50,
    borderRadius: 14,
    backgroundColor: tokens.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 24,
    shadowOpacity: 0.16,
  },
  label: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    letterSpacing: 1.98,
    textTransform: 'uppercase',
    color: tokens.bg,
  },
});
