import { useMemo } from 'react';
import Svg, { Rect } from 'react-native-svg';

import { tokens } from '@/theme/tokens';

type Props = {
  w?: number;
  h?: number;
  color?: string;
  /** Deterministic seed for the placeholder series */
  seed?: number;
  n?: number;
  /** Optional explicit data series (values normalized to 0–1), overrides seed */
  data?: readonly number[];
};

/**
 * Tiny bar chart. Same deterministic LCG as Spark — feeds a placeholder
 * series when no `data` is supplied, so layouts stay stable in design demos.
 */
export function Bars({ w = 80, h = 26, color = tokens.ink, seed = 2, n = 12, data }: Props) {
  const series = useMemo<readonly number[]>(() => {
    if (data && data.length > 0) return data;
    let s = seed;
    const rnd = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
    return Array.from({ length: n }, () => 0.25 + rnd() * 0.75);
  }, [data, seed, n]);

  const gap = 1.5;
  const bw = (w - gap * (series.length - 1)) / series.length;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {series.map((v, i) => (
        <Rect key={i} x={i * (bw + gap)} y={h - v * h} width={bw} height={v * h} fill={color} rx={0.5} />
      ))}
    </Svg>
  );
}
