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

import { Glyph, TabBar, WeightChart } from '@/components/design';
import { useCombinedStreak } from '@/src/hooks/use-combined-streak';
import {
  useFeatureStreaks,
  type FeatureStreakStat,
} from '@/src/hooks/use-feature-streaks';
import { useWeightHistory } from '@/src/hooks/use-weight';
import { useWeightPreferences } from '@/src/hooks/use-weight-preferences';
import { useNow } from '@/src/lib/use-now';
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

// Width of the weight chart inside its card. Card has 22 px outer +
// 12 px inner padding × 2; matches the design source's 314-px inner.
const WEIGHT_CARD_INNER_W = 346 - 22 * 2;
const WEIGHT_CHART_W = WEIGHT_CARD_INNER_W - 12 * 2;
const WEIGHT_CHART_H = 170;

export default function TrendsScreen() {
  const router = useRouter();
  // Once-a-minute tick keeps the dateline live across midnight without
  // a manual refresh, same cadence as the home greeting.
  const now = useNow(60_000);
  const combined = useCombinedStreak();
  const features = useFeatureStreaks();
  const weightHistory = useWeightHistory({ days: 90 });
  const weightPrefs = useWeightPreferences();
  // Last DOT_DAYS slice of the 90-day window for the row of dots.
  const dotWindow = combined.hitsPerDay.slice(-DOT_DAYS);

  const weightSummary = useMemo(
    () => buildWeightSummary(weightHistory, weightPrefs),
    [weightHistory, weightPrefs],
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
        <View style={styles.weightOuter}>
          <View style={styles.weightHeader}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.kicker, textStyles.cap]}>weight</Text>
              <View style={styles.weightHeroRow}>
                <Text style={[styles.weightHeroNumber, textStyles.tnum]}>
                  {weightSummary.latestKgLabel}
                </Text>
                <Text style={styles.weightUnit}>kg</Text>
                {weightSummary.delta !== null && (
                  <Text
                    style={[
                      styles.weightDelta,
                      textStyles.tnum,
                      { color: weightSummary.deltaColor },
                    ]}>
                    {weightSummary.delta.arrow}{' '}
                    {weightSummary.delta.absLabel} / 7d
                  </Text>
                )}
              </View>
              <Text style={styles.weightHint}>
                {weightSummary.hint}
              </Text>
            </View>
            <Pressable
              onPress={() => router.push('/weight' as never)}
              accessibilityRole="button"
              accessibilityLabel="See full weight history"
              hitSlop={6}
              style={({ pressed }) => [
                styles.seeAll,
                pressed && { opacity: 0.55 },
              ]}>
              <Text style={[styles.seeAllText, textStyles.cap]}>see all</Text>
              <Glyph name="chev" color={tokens.accentInk} />
            </Pressable>
          </View>
          <View style={styles.weightCard}>
            {weightPrefs ? (
              <WeightChart
                history={weightHistory.points}
                // Trends shows a backward-only 14-day view — hide the
                // optimal trajectory + projected MA so the eye reads
                // the 7-day MA against recent weigh-ins cleanly.
                prefs={{
                  ...weightPrefs,
                  showOptimal: false,
                  showProjected: false,
                }}
                width={WEIGHT_CHART_W}
                height={WEIGHT_CHART_H}
                range={{ mode: 'window', days: 14 }}
              />
            ) : (
              <View style={styles.weightLoading}>
                <Text style={styles.weightLoadingText}>loading…</Text>
              </View>
            )}
          </View>
        </View>

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
// Weight summary — current kg, 7d MA delta + arrow + colour, hint.
// Pulled out so the JSX above stays focused on layout.
// ─────────────────────────────────────────────────────────────────────────────
type WeightSummary = {
  latestKgLabel: string;
  delta: { arrow: string; absLabel: string } | null;
  deltaColor: string;
  hint: string;
};

function buildWeightSummary(
  hist: ReturnType<typeof useWeightHistory>,
  prefs: ReturnType<typeof useWeightPreferences>,
): WeightSummary {
  if (hist.latestKg === null) {
    return {
      latestKgLabel: '—',
      delta: null,
      deltaColor: tokens.ink3,
      hint: 'no weigh-ins yet',
    };
  }

  // Direction: a goal-direction-aware colour for the delta. Without a
  // target we can't tell which way the user is trying to go, so the
  // delta renders in neutral ink.
  const cutting =
    prefs?.targetKg !== undefined &&
    prefs?.targetKg !== null &&
    prefs.targetKg < hist.latestKg;
  const bulking =
    prefs?.targetKg !== undefined &&
    prefs?.targetKg !== null &&
    prefs.targetKg > hist.latestKg;

  let delta: WeightSummary['delta'] = null;
  let deltaColor: string = tokens.ink3;
  if (hist.sevenDayDelta !== null) {
    const v = hist.sevenDayDelta;
    delta = {
      arrow: v < 0 ? '▼' : v > 0 ? '▲' : '·',
      absLabel: formatOne(Math.abs(v)),
    };
    if (cutting) deltaColor = v < 0 ? '#1F7A3A' : tokens.warn;
    else if (bulking) deltaColor = v > 0 ? '#1F7A3A' : tokens.warn;
  }

  // Hint: ETA when we can project an MA → target intersect, otherwise
  // a status string. Computed daily-velocity from sevenDayDelta keeps
  // the math straightforward; signs are checked so a non-trending
  // user doesn't get a goal-impossible ETA in the past.
  let hint = 'tracking · keep logging';
  if (prefs?.targetKg !== null && prefs?.targetKg !== undefined) {
    if (hist.sevenDayDelta === null || hist.latestMa === null) {
      hint = `goal ${formatOne(prefs.targetKg)} kg · need a week of data`;
    } else {
      const dailyVel = hist.sevenDayDelta / 7;
      const remaining = prefs.targetKg - hist.latestMa;
      // Going the right direction?
      const goodDirection =
        (remaining < 0 && dailyVel < 0) ||
        (remaining > 0 && dailyVel > 0) ||
        Math.abs(remaining) < 0.1;
      if (Math.abs(dailyVel) < 0.005 || !goodDirection) {
        hint = `goal ${formatOne(prefs.targetKg)} kg · off pace`;
      } else {
        const days = Math.max(1, Math.round(remaining / dailyVel));
        const eta = new Date(Date.now() + days * 86_400_000);
        hint = `eta ${ETA_FMT.format(eta).toLowerCase()}`;
      }
    }
  }

  return {
    latestKgLabel: formatOne(hist.latestKg),
    delta,
    deltaColor,
    hint,
  };
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
  weightDelta: {
    marginLeft: 4,
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
  },
  weightHint: {
    marginTop: 4,
    fontFamily: fonts.mono,
    fontSize: 9.5,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
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
  weightLoading: {
    height: WEIGHT_CHART_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weightLoadingText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    fontStyle: 'italic',
  },
});
