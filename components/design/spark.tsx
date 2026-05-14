import { useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';

import { tokens } from '@/theme/tokens';

type Props = {
  w?: number;
  h?: number;
  color?: string;
  /** Deterministic seed — same seed renders the same sparkline */
  seed?: number;
  points?: number;
  /** Optional explicit data series, overrides seeded random */
  data?: readonly number[];
};

/**
 * Mini sparkline. Generates a deterministic series from `seed` so the
 * line stays stable across renders. Pass `data` to plot a real series.
 *
 * Ported from designs/shared.jsx — same LCG, same padding, same stroke.
 */
export function Spark({ w = 60, h = 18, color = tokens.ink, seed = 1, points = 18, data }: Props) {
  const series = useMemo<readonly number[]>(() => {
    if (data && data.length > 0) return data;
    let s = seed;
    const rnd = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    return Array.from({ length: points }, () => 0.3 + rnd() * 0.7);
  }, [data, seed, points]);

  const max = Math.max(...series);
  const min = Math.min(...series);
  const pad = 2;
  const d = series
    .map((v, i) => {
      const x = pad + (i / (series.length - 1)) * (w - pad * 2);
      const y = h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      <Path d={d} fill="none" stroke={color} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}
