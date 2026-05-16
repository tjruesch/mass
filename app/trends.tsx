/**
 * Trends — backward-looking hub (Slice 7, #97).
 *
 * v1 scaffold only. Lays the route + header so the streak and chart
 * cards can land on top of it in #98–#101. The screen is a
 * top-level destination (not a sub-screen), so it uses a custom
 * header — dateline kicker + Trends h1 — rather than the
 * back-arrow `SubHeader`.
 *
 * Tab bar reachability is still wire-pending — #20 will route the
 * tabs once the 5-tab structure lands. Until then, the home screen
 * carries a temp `→ trends` link.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import Svg, { G, Line, Rect } from 'react-native-svg';

import { Glyph, TabBar } from '@/components/design';
import { useCombinedStreak } from '@/src/hooks/use-combined-streak';
import {
  useFeatureStreaks,
  type FeatureStreakStat,
} from '@/src/hooks/use-feature-streaks';
import { useWeightHistory } from '@/src/hooks/use-weight';
import { useNow } from '@/src/lib/use-now';
import { addDays, dowMondayFirst, startOfDay } from '@/src/lib/time';
import { fonts, textStyles, tokens } from '@/theme/tokens';

const WEEKDAY_FMT = new Intl.DateTimeFormat('en', { weekday: 'short' });
const MONTH_FMT = new Intl.DateTimeFormat('en', { month: 'short' });
const SINCE_FMT = new Intl.DateTimeFormat('en', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
});
const ETA_FMT = new Intl.DateTimeFormat('en', {
  day: '2-digit',
  month: 'short',
});

const DOT_DAYS = 14;
const LEGEND_ITEMS = [
  { hits: 3, label: '3/3' },
  { hits: 2, label: '2/3' },
  { hits: 1, label: '1/3' },
  { hits: 0, label: '0/3' },
] as const;

// Heat steps mirror the heatmap palette in `designs/screen-trends.jsx`
// — accent-ink for 3, then progressively diluted ink against bg.
// Reused by both the combined hero (hits = 0-3 goals met) and the
// per-feature mini dots (0-3 intensity for that feature alone).
function dotBackground(hits: number): string {
  if (hits === 3) return tokens.accentInk;
  if (hits === 2) return mix(tokens.ink, tokens.bg, 0.55);
  if (hits === 1) return mix(tokens.ink, tokens.bg, 0.22);
  return tokens.bg2;
}

/** Cheap linear color blend in sRGB. Approximation good enough for
 *  static UI tints; produces the same visual mix the design source's
 *  `color-mix(in oklab, ...)` lands on. */
function mix(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const r = Math.round(ar * t + br * (1 - t));
  const g = Math.round(ag * t + bg * (1 - t));
  const bl = Math.round(ab * t + bb * (1 - t));
  return `rgb(${r}, ${g}, ${bl})`;
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const v = parseInt(h, 16);
  return [(v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff];
}

function formatDateline(d: Date): string {
  const w = WEEKDAY_FMT.format(d).toLowerCase();
  const day = d.getDate().toString().padStart(2, '0');
  const m = MONTH_FMT.format(d).toLowerCase();
  return `${w} ${day} ${m}`;
}

function formatClockTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// Mon→Sun delta bars. Each bar = MA(day) − MA(day - 1). Scale adapts
// to the week's largest swing with a tiny 0.1 kg floor so flat weeks
// don't divide by zero. Bars above midline = gain (warn terracotta),
// below = loss (forest green). Days in the future render as a
// midline tick — same treatment as missing-data days. Today's bar
// is full opacity; prior days are dimmed.
const DELTA_BAR_CHART_H = 96;
const DELTA_BAR_MIN_SCALE_KG = 0.1;
const DAYS_IN_WEEK = 7;
const DOW_LABELS_MON_FIRST = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun',
] as const;

type DeltaPoint = {
  readonly date: Date;
  readonly delta: number | null;
  /** Future days (relative to today) get a placeholder bar — the
   *  chart still spans Mon-Sun so the user reads it as the week. */
  readonly future: boolean;
};

export default function TrendsScreen() {
  const router = useRouter();
  // Once-a-minute tick keeps the dateline live across midnight without
  // a manual refresh, same cadence as the home greeting.
  const now = useNow(60_000);
  const combined = useCombinedStreak();
  const features = useFeatureStreaks();
  const weightHistory = useWeightHistory({ days: 90 });
  // Last DOT_DAYS slice of the 90-day window for the row of dots.
  const dotWindow = combined.hitsPerDay.slice(-DOT_DAYS);

  const weightDeltas = useMemo(
    () => buildWeightDeltas(weightHistory.points, now),
    [weightHistory.points, now],
  );

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={[styles.dateline, textStyles.cap]}>
            {formatDateline(now)}
            <Text style={styles.datelineDot}> · </Text>
            {formatClockTime(now)}
          </Text>
          <Text style={styles.title}>Trends</Text>
        </View>

        {/* ── Combined streak hero ─────────────────────────────────── */}
        <View style={styles.streakOuter}>
          <Text style={[styles.kicker, textStyles.cap]}>
            streak · combined
          </Text>

          <View style={styles.streakHeroRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.streakNumberRow}>
                <Text style={[styles.streakNumber, textStyles.tnum]}>
                  {combined.currentStreak}d
                </Text>
                <Text style={styles.streakNumberSub}>all three goals</Text>
              </View>
              <Text style={styles.streakHint}>
                {combined.since
                  ? `since ${SINCE_FMT.format(combined.since).toLowerCase()}`
                  : 'no current streak'}
                <Text style={styles.streakHintSep}>{' · '}</Text>
                <Text>best {combined.bestStreak}d</Text>
              </Text>
            </View>

            <View style={styles.dotRow}>
              {dotWindow.map((hits, i) => {
                const isToday = i === dotWindow.length - 1;
                const is3 = hits === 3;
                const is0 = hits === 0;
                return (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      { backgroundColor: dotBackground(hits) },
                      is0 && styles.dotOutlined,
                      isToday && styles.dotToday,
                      isToday && is3 && styles.dotTodayGlow,
                    ]}
                  />
                );
              })}
            </View>
          </View>

          {/* Legend */}
          <View style={styles.legendRow}>
            {LEGEND_ITEMS.map((item) => (
              <View key={item.hits} style={styles.legendChip}>
                <View
                  style={[
                    styles.legendSwatch,
                    { backgroundColor: dotBackground(item.hits) },
                    item.hits === 0 && styles.dotOutlined,
                  ]}
                />
                <Text style={[styles.legendText, textStyles.cap]}>
                  {item.label}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.divider} />

          {/* ── Per-feature breakdown ───────────────────────────── */}
          <Text style={[styles.kicker, textStyles.cap, styles.subKicker]}>
            by feature
          </Text>
          <View style={styles.featureRow}>
            <FeatureColumn
              label="fasting"
              stat={features.fasting}
              meanFormatter={(h) => `μ ${formatOne(h)} h`}
              isFirst
            />
            <FeatureColumn
              label="water"
              stat={features.water}
              meanFormatter={(l) => `μ ${formatOne(l)} L`}
            />
            <FeatureColumn
              label="workouts"
              stat={features.workouts}
              meanFormatter={(n) => `μ ${formatOne(n)} / wk`}
            />
          </View>
          <View style={styles.divider} />
        </View>

        {/* ── Weight card ─────────────────────────────────────────── */}
        <Pressable
          onPress={() => router.push('/weight' as never)}
          accessibilityRole="button"
          accessibilityLabel="See full weight history"
          style={({ pressed }) => [
            styles.weightOuter,
            pressed && { opacity: 0.85 },
          ]}>
          <View style={styles.weightHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.kicker, textStyles.cap]}>weight</Text>
              <View style={styles.weightHeroRow}>
                <Text style={[styles.weightHeroNumber, textStyles.tnum]}>
                  {weightHistory.latestKg !== null
                    ? formatOne(weightHistory.latestKg)
                    : '—'}
                </Text>
                <Text style={styles.weightUnit}>kg</Text>
              </View>
            </View>
            <View style={styles.seeAll}>
              <Text style={[styles.seeAllText, textStyles.cap]}>see all</Text>
              <Glyph name="chev" color={tokens.accentInk} />
            </View>
          </View>
          <View style={styles.weightCard}>
            <DeltaBarChart deltas={weightDeltas} />
          </View>
        </Pressable>

        {/* Placeholder until #101 fills the deficit bars section. */}
        <View style={styles.placeholderOuter}>
          <Text style={[styles.kicker, textStyles.cap]}>coming next</Text>
          <Text style={styles.placeholder}>7d deficit bars</Text>
        </View>
      </ScrollView>

      <TabBar active="trends" />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FeatureColumn — one of three sub-sections in the per-feature row.
// First column has no left border; the others get a 1px divider line.
// ─────────────────────────────────────────────────────────────────────────────
function FeatureColumn({
  label,
  stat,
  meanFormatter,
  isFirst = false,
}: {
  label: string;
  stat: FeatureStreakStat;
  meanFormatter: (mean: number) => string;
  isFirst?: boolean;
}) {
  return (
    <View
      style={[
        styles.featureCol,
        !isFirst && styles.featureColBorder,
        !isFirst && { paddingLeft: 12 },
      ]}>
      <Text style={[styles.featureLabel, textStyles.cap]}>{label}</Text>
      <Text style={[styles.featureNumber, textStyles.tnum]}>
        {stat.current}d
      </Text>
      <Text style={styles.featureMean}>{meanFormatter(stat.mean)}</Text>
      <View style={styles.featureDotRow}>
        {stat.weekDots.map((v, i) => {
          const isToday = i === stat.weekDots.length - 1;
          return (
            <View
              key={i}
              style={[
                styles.featureDot,
                { backgroundColor: dotBackground(v) },
                v === 0 && styles.dotOutlined,
                isToday && styles.featureDotToday,
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

function formatOne(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n === 0) return '0';
  return (Math.round(n * 10) / 10).toFixed(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7-day MA deltas. For each of the last 7 calendar days, evaluate
// the trailing 7-day MA at that day and subtract the prior day's
// MA. Returns 7 points even with sparse logging (null `delta` when
// either side's window is empty).
// ─────────────────────────────────────────────────────────────────────────────
const MA_WINDOW_MS = 7 * 24 * 3_600_000;

function maAt(
  entries: ReadonlyArray<{ at: Date; kg: number }>,
  atTime: number,
): number | null {
  const windowStart = atTime - MA_WINDOW_MS;
  let sum = 0;
  let count = 0;
  for (const e of entries) {
    const t = e.at.getTime();
    if (t > atTime) break;
    if (t < windowStart) continue;
    sum += e.kg;
    count++;
  }
  return count > 0 ? sum / count : null;
}

function buildWeightDeltas(
  points: ReturnType<typeof useWeightHistory>['points'],
  now: Date,
): ReadonlyArray<DeltaPoint> {
  // Flatten to raw entries; useWeightHistory sorts ascending already.
  const entries = points.map((p) => p.entry);
  const todayStart = startOfDay(now);
  // Walk from Monday of the current week through Sunday so the chart
  // always reads as "this week" — the rest of the app uses the same
  // Monday-first convention.
  const weekStart = addDays(todayStart, -dowMondayFirst(todayStart));
  const out: DeltaPoint[] = [];
  for (let i = 0; i < DAYS_IN_WEEK; i++) {
    const day = addDays(weekStart, i);
    const isFuture = day.getTime() > todayStart.getTime();
    if (isFuture) {
      out.push({ date: day, delta: null, future: true });
      continue;
    }
    const prev = addDays(day, -1);
    const a = maAt(entries, prev.getTime());
    const b = maAt(entries, day.getTime());
    out.push({
      date: day,
      delta: a !== null && b !== null ? b - a : null,
      future: false,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// DeltaBarChart — 7 bars centered around a 0-line. Positive = warn
// (gain), negative = forest green (loss). Today is rightmost. The
// scale floor of 0.5 kg keeps a near-flat week from rendering as
// hairline bars.
// ─────────────────────────────────────────────────────────────────────────────
function DeltaBarChart({ deltas }: { deltas: ReadonlyArray<DeltaPoint> }) {
  const w = 290; // matches the card inner width (22+12 padding × 2 off 346)
  const h = DELTA_BAR_CHART_H;
  const padT = 8;
  const padB = 20;
  const padL = 4;
  const padR = 4;
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const midY = padT + innerH / 2;

  // Scale to the week's actual max so a 0.15 kg day uses the full
  // half-height of the chart. Tiny floor prevents divide-by-zero on
  // a perfectly flat week.
  const maxAbs = Math.max(
    DELTA_BAR_MIN_SCALE_KG,
    ...deltas.map((d) => (d.delta === null ? 0 : Math.abs(d.delta))),
  );

  const slot = innerW / deltas.length;
  const barW = Math.max(12, slot - 6);

  // todayDow within the Mon-Sun array — gives us "the last bar with
  // real data" instead of "the last bar in the array" so dow labels
  // and today highlighting stay correct on a Wednesday view.
  const todayIdx = deltas.findIndex((d) => d.future) - 1;
  const todayDow =
    todayIdx >= 0 ? todayIdx : deltas.length - 1; // Sunday-of-this-week is today

  const anyData = deltas.some((d) => d.delta !== null);
  if (!anyData) {
    return (
      <View style={styles.deltaEmpty}>
        <Text style={styles.deltaEmptyText}>
          log a few weigh-ins to see daily change
        </Text>
      </View>
    );
  }

  return (
    <View style={{ width: w, height: h }}>
      <Svg width={w} height={h}>
        {/* center 0-line */}
        <Line
          x1={padL}
          y1={midY}
          x2={padL + innerW}
          y2={midY}
          stroke={tokens.ink}
          strokeOpacity={0.25}
          strokeWidth={0.8}
        />
        <G>
          {deltas.map((d, i) => {
            const cx = padL + slot * i + slot / 2;
            const x = cx - barW / 2;
            // Future or missing-data days collapse to a midline tick.
            if (d.delta === null) {
              return (
                <Rect
                  key={i}
                  x={x}
                  y={midY - 1}
                  width={barW}
                  height={2}
                  rx={1}
                  fill={tokens.line2}
                  opacity={d.future ? 0.35 : 0.6}
                />
              );
            }
            const magnitude = Math.abs(d.delta) / maxAbs;
            const barH = magnitude * (innerH / 2);
            const isGain = d.delta > 0;
            const y = isGain ? midY - barH : midY;
            const isToday = i === todayDow;
            return (
              <Rect
                key={i}
                x={x}
                y={y}
                width={barW}
                height={Math.max(2, barH)}
                rx={2}
                fill={isGain ? tokens.warn : '#1F7A3A'}
                opacity={isToday ? 1 : 0.6}
              />
            );
          })}
        </G>
      </Svg>
      <View style={styles.deltaDowRow}>
        {deltas.map((_, i) => {
          const isToday = i === todayDow;
          return (
            <Text
              key={i}
              style={[
                styles.deltaDow,
                textStyles.cap,
                isToday && styles.deltaDowToday,
              ]}>
              {DOW_LABELS_MON_FIRST[i]}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 100,
  },
  header: {
    paddingTop: 8,
    paddingHorizontal: 22,
  },
  dateline: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    letterSpacing: 2.4,
  },
  datelineDot: {
    color: tokens.ink3,
  },
  title: {
    fontFamily: fonts.sansSemibold,
    fontSize: 24,
    color: tokens.ink,
    letterSpacing: -0.6,
    marginTop: 6,
  },

  placeholderOuter: {
    paddingTop: 26,
    paddingHorizontal: 22,
  },
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
    marginBottom: 12,
  },
  placeholder: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
    lineHeight: 18,
  },

  // Combined streak
  streakOuter: {
    paddingTop: 18,
    paddingHorizontal: 22,
  },
  streakHeroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14,
  },
  streakNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  streakNumber: {
    fontFamily: fonts.monoSemibold,
    fontSize: 44,
    color: tokens.ink,
    letterSpacing: -2,
    lineHeight: 48,
  },
  streakNumberSub: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink3,
    letterSpacing: 0.4,
  },
  streakHint: {
    marginTop: 6,
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },
  streakHintSep: {
    color: tokens.ink4,
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingBottom: 2,
  },
  dot: {
    width: 11,
    height: 14,
    borderRadius: 2,
  },
  dotOutlined: {
    borderWidth: 1,
    borderColor: tokens.line,
  },
  dotToday: {
    borderWidth: 1,
    borderColor: tokens.ink,
  },
  dotTodayGlow: {
    shadowColor: tokens.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    shadowOpacity: 1,
  },

  legendRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendSwatch: {
    width: 9,
    height: 9,
    borderRadius: 2,
  },
  legendText: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.62,
  },

  divider: {
    height: 1,
    backgroundColor: tokens.line,
    marginTop: 18,
  },

  subKicker: {
    marginTop: 18,
    marginBottom: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  featureCol: {
    flex: 1,
    gap: 6,
  },
  featureColBorder: {
    borderLeftWidth: 1,
    borderLeftColor: tokens.line,
  },
  featureLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink3,
    letterSpacing: 1.62,
    textTransform: 'lowercase',
  },
  featureNumber: {
    marginTop: 1,
    fontFamily: fonts.monoSemibold,
    fontSize: 22,
    color: tokens.ink,
    letterSpacing: -0.77,
    lineHeight: 22,
  },
  featureMean: {
    marginTop: 2,
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },
  featureDotRow: {
    marginTop: 6,
    flexDirection: 'row',
    gap: 3,
  },
  featureDot: {
    width: 9,
    height: 9,
    borderRadius: 2,
  },
  featureDotToday: {
    borderWidth: 1,
    borderColor: tokens.ink,
  },

  // Weight card
  weightOuter: {
    paddingTop: 18,
    paddingHorizontal: 22,
  },
  weightHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  weightHeroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  weightHeroNumber: {
    fontFamily: fonts.sansSemibold,
    fontSize: 30,
    color: tokens.ink,
    letterSpacing: -1.05,
    lineHeight: 30,
  },
  weightUnit: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink3,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  seeAllText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 9,
    color: tokens.accentInk,
    letterSpacing: 1.98,
  },
  weightCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    shadowOpacity: 0.04,
  },

  // Delta bars
  deltaEmpty: {
    width: '100%',
    height: DELTA_BAR_CHART_H,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  deltaEmptyText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    fontStyle: 'italic',
    textAlign: 'center',
    letterSpacing: 0.4,
  },
  deltaDowRow: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 4,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  deltaDow: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.44,
  },
  deltaDowToday: {
    fontFamily: fonts.monoSemibold,
    color: tokens.ink,
  },
});
