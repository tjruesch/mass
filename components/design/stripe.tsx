import type { DimensionValue } from 'react-native';
import { Text, View } from 'react-native';
import Svg, { Defs, G, Line, Pattern, Rect } from 'react-native-svg';

import { tokens, fonts } from '@/theme/tokens';

type Props = {
  /** Width as a RN dimension value (number or '50%' etc.). Defaults to filling the row. */
  width?: DimensionValue;
  height?: number;
  label?: string;
  radius?: number;
  dark?: boolean;
};

/**
 * Diagonal-stripe placeholder rectangle used in design mockups to mark
 * "imagery TBD" zones. Matches the look of the CSS
 * `repeating-linear-gradient(45deg, …)` source via a tiled SVG pattern.
 */
export function Stripe({ width = '100%', height = 80, label = '', radius = 8, dark = false }: Props) {
  const stripeA = dark ? '#1a1a17' : '#F0F0E8';
  const stripeB = dark ? '#222220' : '#E6E6DE';
  const ink = dark ? '#8a8a82' : tokens.ink4;
  // pattern tile = 12px square (6px stripe + 6px stripe) at 45°
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: stripeA,
      }}>
      <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%">
        <Defs>
          <Pattern id="stripes" patternUnits="userSpaceOnUse" width={12} height={12} patternTransform="rotate(45)">
            <Rect x={0} y={0} width={12} height={12} fill={stripeA} />
            <G>
              <Line x1={0} y1={3} x2={12} y2={3} stroke={stripeB} strokeWidth={6} />
            </G>
          </Pattern>
        </Defs>
        <Rect x={0} y={0} width="100%" height="100%" fill="url(#stripes)" />
      </Svg>
      {label.length > 0 && (
        <Text
          style={{
            fontFamily: fonts.mono,
            fontSize: 10,
            letterSpacing: 0.8,
            textTransform: 'uppercase',
            color: ink,
          }}>
          {label}
        </Text>
      )}
    </View>
  );
}
