/**
 * WeightChart — port of designs/screen-weight.jsx WeightChart with
 * react-native-svg. Pure presentational: caller passes the data + prefs,
 * the component just draws.
 *
 * Layers (each gated by a `weight_preferences` toggle where applicable):
 *   - optimal trajectory (start → goal, accent dashed)        `showOptimal`
 *   - goal horizontal line (warn-colored short-dash)          always when targetKg
 *   - 7-day MA path (dark solid through entries)              `showMovingAvg`
 *   - projected MA (today's MA → goal, light dashed)          `showProjected`
 *   - daily readings (small open circles)                     always
 *   - today marker (vertical accent + puck + callout)         always when today in window
 *
 * Y-axis bounds:
 *   default: [min(current, target, start) - 2, max(...) + 1]
 *   snapToGoalRange: ±5kg around the latest MA value
 *
 * X-axis bounds:
 *   start: prefs.startKg's anchor date (= first entry's at if startKg null)
 *   end:   prefs.targetDate, or `+28 calendar days` from start if null
 */

import { Text, View } from 'react-native';
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from 'react-native-svg';

import type { WeightPreferences } from '@/src/db/schema';
import type { WeightHistoryPoint } from '@/src/hooks/use-weight';
import { addDays, startOfDay } from '@/src/lib/time';
import { fonts, tokens } from '@/theme/tokens';

const MONTH_DAY = new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short' });

type Props = {
  history: ReadonlyArray<WeightHistoryPoint>;
  prefs: WeightPreferences;
  width: number;
  height: number;
};

const PAD_L = 34;
const PAD_R = 16;
const PAD_T = 36;
const PAD_B = 28;

export function WeightChart({ history, prefs, width, height }: Props) {
  if (history.length < 2) {
    return (
      <View
        style={{
          width,
          height,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
        }}>
        <Text
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            color: tokens.ink4,
            textAlign: 'center',
            fontStyle: 'italic',
            letterSpacing: 0.44,
          }}>
          log a few weigh-ins to see the trend
        </Text>
      </View>
    );
  }

  // ── Domain bounds ────────────────────────────────────────────────
  const today = startOfDay(new Date());
  const firstEntry = history[0];
  const lastEntry = history[history.length - 1];

  const startDate = startOfDay(firstEntry.entry.at);
  const endDate = prefs.targetDate
    ? startOfDay(prefs.targetDate)
    : addDays(startDate, 28);

  const startKg = prefs.startKg ?? firstEntry.entry.kg;
  const targetKg = prefs.targetKg;
  const latestMa = lastEntry.ma;

  // Y axis — see file header.
  let yMin: number;
  let yMax: number;
  if (prefs.snapToGoalRange) {
    yMin = latestMa - 5;
    yMax = latestMa + 5;
  } else {
    const candidates: number[] = [latestMa, startKg];
    if (targetKg !== null) candidates.push(targetKg);
    for (const p of history) candidates.push(p.entry.kg);
    yMin = Math.min(...candidates) - 2;
    yMax = Math.max(...candidates) + 1;
  }

  // ── Coordinate transforms ────────────────────────────────────────
  const innerW = width - PAD_L - PAD_R;
  const innerH = height - PAD_T - PAD_B;
  const xRangeMs = endDate.getTime() - startDate.getTime();
  // Empty window (target == start) is theoretically possible — guard the divisor.
  const sx = (d: Date) => {
    if (xRangeMs === 0) return PAD_L;
    const t = (d.getTime() - startDate.getTime()) / xRangeMs;
    return PAD_L + Math.max(0, Math.min(1, t)) * innerW;
  };
  const sy = (v: number) => {
    const t = (v - yMin) / (yMax - yMin);
    return PAD_T + innerH - Math.max(0, Math.min(1, t)) * innerH;
  };

  // ── Ticks ────────────────────────────────────────────────────────
  // Three labeled X ticks: start, today (if in window), end.
  const todayInWindow =
    today.getTime() >= startDate.getTime() && today.getTime() <= endDate.getTime();
  const xTicks: { x: number; label: string }[] = [
    { x: sx(startDate), label: MONTH_DAY.format(startDate).toLowerCase() },
  ];
  if (todayInWindow) {
    xTicks.push({ x: sx(today), label: 'today' });
  }
  xTicks.push({ x: sx(endDate), label: MONTH_DAY.format(endDate).toLowerCase() });

  // Y ticks — 4 evenly-spaced kg values, rounded to nearest integer for
  // a clean axis. Skip ticks that round outside the range.
  const yTickValues = computeYTicks(yMin, yMax, 4);

  // ── Path strings ─────────────────────────────────────────────────
  const maPath = history
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'}${sx(p.entry.at).toFixed(1)},${sy(p.ma).toFixed(1)}`,
    )
    .join(' ');

  // Projected MA: from today's MA (which is `latestMa`, anchored at the
  // last entry's date) toward (endDate, targetKg). Skip when no target.
  const projectedPath =
    targetKg !== null
      ? `M${sx(lastEntry.entry.at).toFixed(1)},${sy(latestMa).toFixed(1)} L${sx(endDate).toFixed(1)},${sy(targetKg).toFixed(1)}`
      : null;

  // ── Render ───────────────────────────────────────────────────────
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        {/* Top legend */}
        <G transform={`translate(${PAD_L}, 14)`}>
          <LegendEntry x={0} swatchColor={tokens.ink} label="actual μ" dashed={false} />
          {prefs.showOptimal && (
            <LegendEntry
              x={70}
              swatchColor={tokens.accentInk}
              label="optimal"
              dashed
            />
          )}
          {targetKg !== null && (
            <LegendEntry
              x={130}
              swatchColor={tokens.warn}
              label={`goal ${Math.round(targetKg)}`}
              dashed
              thin
            />
          )}
        </G>

        {/* Plot frame */}
        <Line
          x1={PAD_L}
          y1={PAD_T}
          x2={PAD_L}
          y2={PAD_T + innerH}
          stroke={tokens.ink}
          strokeOpacity={0.3}
          strokeWidth={0.8}
        />
        <Line
          x1={PAD_L}
          y1={PAD_T + innerH}
          x2={PAD_L + innerW}
          y2={PAD_T + innerH}
          stroke={tokens.ink}
          strokeOpacity={0.3}
          strokeWidth={0.8}
        />

        {/* Y ticks + gridlines */}
        {yTickValues.map((v) => (
          <G key={`y-${v}`}>
            <Line
              x1={PAD_L - 3}
              y1={sy(v)}
              x2={PAD_L}
              y2={sy(v)}
              stroke={tokens.ink}
              strokeOpacity={0.3}
              strokeWidth={0.8}
            />
            <Line
              x1={PAD_L}
              y1={sy(v)}
              x2={PAD_L + innerW}
              y2={sy(v)}
              stroke={tokens.ink}
              strokeOpacity={0.06}
              strokeWidth={0.5}
              strokeDasharray="1 3"
            />
            <SvgText
              x={PAD_L - 6}
              y={sy(v) + 3}
              fontSize={8.5}
              fontFamily={fonts.mono}
              fill={tokens.ink4}
              textAnchor="end">
              {v}
            </SvgText>
          </G>
        ))}

        {/* X labels */}
        {xTicks.map((t, i) => (
          <G key={`x-${i}`}>
            <Line
              x1={t.x}
              y1={PAD_T + innerH}
              x2={t.x}
              y2={PAD_T + innerH + 3}
              stroke={tokens.ink}
              strokeOpacity={0.3}
              strokeWidth={0.8}
            />
            <SvgText
              x={t.x}
              y={PAD_T + innerH + 14}
              fontSize={8.5}
              fontFamily={fonts.mono}
              fill={tokens.ink4}
              textAnchor="middle">
              {t.label}
            </SvgText>
          </G>
        ))}

        {/* Optimal line (start → goal) — only when goal + toggle on */}
        {prefs.showOptimal && targetKg !== null && (
          <Line
            x1={sx(startDate)}
            y1={sy(startKg)}
            x2={sx(endDate)}
            y2={sy(targetKg)}
            stroke={tokens.accentInk}
            strokeWidth={1.2}
            strokeDasharray="3 2.5"
            opacity={0.85}
          />
        )}

        {/* Goal horizontal target line */}
        {targetKg !== null && (
          <>
            <Line
              x1={PAD_L}
              y1={sy(targetKg)}
              x2={PAD_L + innerW}
              y2={sy(targetKg)}
              stroke={tokens.warn}
              strokeWidth={0.9}
              strokeDasharray="1.5 2"
              opacity={0.95}
            />
            <SvgText
              x={PAD_L + innerW - 2}
              y={sy(targetKg) - 4}
              fontSize={8}
              fontFamily={fonts.mono}
              fill={tokens.warn}
              textAnchor="end">
              {`goal ${Math.round(targetKg)}`}
            </SvgText>
          </>
        )}

        {/* Projected MA continuation */}
        {prefs.showProjected && projectedPath && (
          <Path
            d={projectedPath}
            stroke={tokens.ink}
            strokeWidth={1.3}
            fill="none"
            strokeDasharray="3 3"
            opacity={0.4}
          />
        )}

        {/* MA path */}
        {prefs.showMovingAvg && (
          <Path
            d={maPath}
            stroke={tokens.ink}
            strokeWidth={1.6}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}

        {/* Daily reading circles */}
        {history.map((p, i) => (
          <Circle
            key={i}
            cx={sx(p.entry.at)}
            cy={sy(p.entry.kg)}
            r={2.4}
            fill={tokens.card}
            stroke={tokens.ink}
            strokeWidth={1}
            opacity={0.75}
          />
        ))}

        {/* Today marker + callout */}
        {todayInWindow && (
          <G>
            <Line
              x1={sx(today)}
              y1={PAD_T}
              x2={sx(today)}
              y2={PAD_T + innerH}
              stroke={tokens.accentInk}
              strokeWidth={0.7}
              strokeDasharray="1.5 2.5"
              opacity={0.7}
            />
            <Circle
              cx={sx(lastEntry.entry.at)}
              cy={sy(latestMa)}
              r={5}
              fill={tokens.card}
              stroke={tokens.accentInk}
              strokeWidth={1.6}
            />
            <Circle
              cx={sx(lastEntry.entry.at)}
              cy={sy(latestMa)}
              r={1.7}
              fill={tokens.accentInk}
            />
            <SvgText
              x={sx(lastEntry.entry.at) + 10}
              y={sy(latestMa) - 18}
              fontSize={9}
              fontFamily={fonts.monoSemibold}
              fill={tokens.ink}>
              {lastEntry.entry.kg.toFixed(1)}
            </SvgText>
            <SvgText
              x={sx(lastEntry.entry.at) + 10}
              y={sy(latestMa) - 8}
              fontSize={8}
              fontFamily={fonts.mono}
              fill={tokens.ink4}>
              {`μ ${latestMa.toFixed(1)} kg`}
            </SvgText>
          </G>
        )}
      </Svg>
    </View>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function LegendEntry({
  x,
  swatchColor,
  label,
  dashed,
  thin = false,
}: {
  x: number;
  swatchColor: string;
  label: string;
  dashed: boolean;
  thin?: boolean;
}) {
  return (
    <G transform={`translate(${x}, 0)`}>
      <Line
        x1={0}
        y1={0}
        x2={16}
        y2={0}
        stroke={swatchColor}
        strokeWidth={thin ? 0.9 : dashed ? 1.2 : 1.6}
        strokeDasharray={dashed ? (thin ? '1.5 2' : '3 2.5') : undefined}
        opacity={thin ? 0.9 : 1}
      />
      <SvgText x={20} y={3} fontSize={8.5} fontFamily={fonts.mono} fill={tokens.ink3}>
        {label}
      </SvgText>
    </G>
  );
}

/**
 * Pick `count` evenly-spaced integer kg values within [yMin, yMax].
 * For ranges < 4 kg we widen the step to 0.5 kg increments so the labels
 * aren't all the same integer.
 */
function computeYTicks(yMin: number, yMax: number, count: number): number[] {
  const range = yMax - yMin;
  const stepRaw = range / (count - 1);
  // Snap to 0.5 if range is narrow, else integer steps.
  const step = stepRaw >= 1 ? Math.max(1, Math.round(stepRaw)) : 0.5;
  const out: number[] = [];
  const first = step >= 1 ? Math.ceil(yMin) : Math.ceil(yMin * 2) / 2;
  for (let v = first; v <= yMax; v += step) {
    out.push(step >= 1 ? Math.round(v) : v);
    if (out.length > 10) break; // safety
  }
  return out;
}
