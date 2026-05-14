import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { tokens } from '@/theme/tokens';

type Props = {
  size?: number;
  stroke?: number;
  pct?: number;
  color?: string;
  track?: string;
  capRound?: boolean;
  children?: ReactNode;
};

/**
 * Ring gauge — a single arc with optional center content.
 * Pixel-faithful port of the SVG-based Ring in designs/shared.jsx.
 *
 * `pct` is 0–1. The arc starts at 12 o'clock and sweeps clockwise.
 */
export function Ring({
  size = 96,
  stroke = 8,
  pct = 0.5,
  color = tokens.ink,
  track = tokens.line,
  capRound = true,
  children,
}: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ position: 'relative', width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${c * pct} ${c}`}
          strokeLinecap={capRound ? 'round' : 'butt'}
          // start at 12 o'clock
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children !== undefined && <View style={[StyleSheet.absoluteFillObject, styles.center]}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
