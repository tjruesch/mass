import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme/use-theme';

/**
 * Single source-of-truth icon set, ported from designs/shared.jsx (the `G`
 * object). Stroke widths and viewBoxes mirror the source so the look stays
 * consistent across screens; pass `color` to recolor (defaults to ink).
 */
export type GlyphName =
  | 'fast'
  | 'water'
  | 'lift'
  | 'meal'
  | 'scale'
  | 'mic'
  | 'spark'
  | 'plus'
  | 'chev'
  | 'arrUp'
  | 'arrDn'
  | 'dot'
  | 'home'
  | 'today'
  | 'plan'
  | 'trends'
  | 'me'
  | 'cog'
  // aliases preserved from shared.jsx
  | 'chart'
  | 'list';

type Props = {
  name: GlyphName;
  size?: number;
  color?: string;
};

export function Glyph({ name, size, color }: Props) {
  const theme = useTheme();
  const stroke = color ?? theme.ink;
  return <GlyphInner name={name} size={size} color={stroke} />;
}

function GlyphInner({
  name,
  size,
  color,
}: Required<Pick<Props, 'name' | 'color'>> & Pick<Props, 'size'>) {
  switch (name) {
    case 'fast':
      return (
        <Svg width={size ?? 14} height={size ?? 14} viewBox="0 0 14 14">
          <Circle cx={7} cy={7} r={5.5} fill="none" stroke={color} strokeWidth={1.3} />
          <Path d="M7 4v3l2 1.5" stroke={color} strokeWidth={1.3} fill="none" strokeLinecap="round" />
        </Svg>
      );
    case 'water':
      return (
        <Svg width={size ?? 14} height={size ?? 14} viewBox="0 0 14 14">
          <Path
            d="M7 1.5C9.5 5 11 7 11 9a4 4 0 0 1-8 0c0-2 1.5-4 4-7.5z"
            fill="none"
            stroke={color}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'lift':
      return (
        <Svg width={size ?? 14} height={size ?? 14} viewBox="0 0 14 14">
          <Path
            d="M2 7h10M3.5 5v4M10.5 5v4M5.5 4v6M8.5 4v6"
            stroke={color}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'meal':
      return (
        <Svg width={size ?? 14} height={size ?? 14} viewBox="0 0 14 14">
          <Path
            d="M3 2v10M5 2v3a1 1 0 0 1-2 0V2M9 12V8c0-2 1-5 2-5v9"
            stroke={color}
            strokeWidth={1.3}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'scale':
      return (
        <Svg width={size ?? 14} height={size ?? 14} viewBox="0 0 14 14">
          <Rect x={1.5} y={3.5} width={11} height={8} rx={1.5} fill="none" stroke={color} strokeWidth={1.3} />
          <Path d="M7 5.5v2M5.5 7.5h3" stroke={color} strokeWidth={1.3} strokeLinecap="round" />
        </Svg>
      );
    case 'mic':
      return (
        <Svg width={size ?? 14} height={size ?? 14} viewBox="0 0 14 14">
          <Rect x={5} y={1.5} width={4} height={7} rx={2} fill="none" stroke={color} strokeWidth={1.3} />
          <Path
            d="M3 7a4 4 0 0 0 8 0M7 11v1.5"
            stroke={color}
            strokeWidth={1.3}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      );
    case 'spark':
      return (
        <Svg width={size ?? 14} height={size ?? 14} viewBox="0 0 14 14">
          <Path
            d="M7 1.5l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z"
            fill="none"
            stroke={color}
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'plus':
      return (
        <Svg width={size ?? 12} height={size ?? 12} viewBox="0 0 12 12">
          <Path d="M6 1v10M1 6h10" stroke={color} strokeWidth={1.4} strokeLinecap="round" />
        </Svg>
      );
    case 'chev':
      return (
        <Svg width={size ?? 10} height={size ?? 10} viewBox="0 0 10 10">
          <Path
            d="M3.5 2l3 3-3 3"
            stroke={color}
            strokeWidth={1.4}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'arrUp':
      return (
        <Svg width={size ?? 10} height={size ?? 10} viewBox="0 0 10 10">
          <Path
            d="M5 8V2M2.5 4.5L5 2l2.5 2.5"
            stroke={color}
            strokeWidth={1.4}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'arrDn':
      return (
        <Svg width={size ?? 10} height={size ?? 10} viewBox="0 0 10 10">
          <Path
            d="M5 2v6M2.5 5.5L5 8l2.5-2.5"
            stroke={color}
            strokeWidth={1.4}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'dot':
      return (
        <Svg width={size ?? 6} height={size ?? 6} viewBox="0 0 6 6">
          <Circle cx={3} cy={3} r={2} fill={color} />
        </Svg>
      );
    case 'home':
      return (
        <Svg width={size ?? 16} height={size ?? 16} viewBox="0 0 16 16">
          <Path
            d="M2 7l6-4.5L14 7v6.5a.5.5 0 0 1-.5.5h-3v-4h-3v4h-3a.5.5 0 0 1-.5-.5z"
            fill="none"
            stroke={color}
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'today':
      return (
        <Svg width={size ?? 16} height={size ?? 16} viewBox="0 0 16 16">
          <Rect x={2} y={3.5} width={12} height={10} rx={1.5} fill="none" stroke={color} strokeWidth={1.3} />
          <Line x1={2} y1={6.5} x2={14} y2={6.5} stroke={color} strokeWidth={1.3} />
          <Line x1={5.5} y1={2} x2={5.5} y2={4.5} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
          <Line x1={10.5} y1={2} x2={10.5} y2={4.5} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
          <Rect x={5.5} y={8.5} width={2.5} height={2.5} rx={0.4} fill={color} />
        </Svg>
      );
    case 'plan':
    case 'list':
      return (
        <Svg width={size ?? 16} height={size ?? 16} viewBox="0 0 16 16">
          <Rect x={2} y={3} width={12} height={10} rx={1.5} fill="none" stroke={color} strokeWidth={1.3} />
          <Line x1={5} y1={6} x2={12} y2={6} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
          <Line x1={5} y1={8.5} x2={12} y2={8.5} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
          <Line x1={5} y1={11} x2={9} y2={11} stroke={color} strokeWidth={1.3} strokeLinecap="round" />
        </Svg>
      );
    case 'trends':
    case 'chart':
      return (
        <Svg width={size ?? 16} height={size ?? 16} viewBox="0 0 16 16">
          <Path
            d="M2 12l3.5-4 2.5 2 4.5-5.5"
            fill="none"
            stroke={color}
            strokeWidth={1.3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={12.5} cy={4.5} r={1.2} fill={color} />
        </Svg>
      );
    case 'me':
      return (
        <Svg width={size ?? 16} height={size ?? 16} viewBox="0 0 16 16">
          <Circle cx={8} cy={5.5} r={2.6} fill="none" stroke={color} strokeWidth={1.3} />
          <Path
            d="M2.5 14c1-2.5 3-4 5.5-4s4.5 1.5 5.5 4"
            stroke={color}
            strokeWidth={1.3}
            fill="none"
            strokeLinecap="round"
          />
        </Svg>
      );
    case 'cog':
      return (
        <Svg width={size ?? 16} height={size ?? 16} viewBox="0 0 16 16">
          <Circle cx={8} cy={8} r={2.2} fill="none" stroke={color} strokeWidth={1.3} />
          <Path
            d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4"
            stroke={color}
            strokeWidth={1.3}
            strokeLinecap="round"
          />
        </Svg>
      );
  }
}
