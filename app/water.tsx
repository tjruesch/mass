/**
 * Water detail screen — port of designs/screen-water.jsx WaterDisplay.
 *
 * Status: scaffold + hero + quick-add (issues #37, #38). Remaining:
 *   #39 — today's log list + edit/delete
 *   #40 — streak heatmap + history hook
 *   #41 — μ pace logic (the stat row is rendered here but always reads `—`).
 *
 * The WaterColumn SVG lives inline below; if it ever gets reused elsewhere
 * (a different screen or a future preview tile), extract to components/design.
 */

import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, {
  ClipPath,
  Defs,
  LinearGradient,
  Line,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import {
  Glyph,
  HEAT_COLORS,
  HEATMAP_CELL,
  HEATMAP_GAP,
  StreakHeatmap,
  SubHeader,
  TabBar,
  WaterLogDrawer,
} from '@/components/design';
import { addWaterLog } from '@/src/db/queries/water';
import { useWaterHistory, useWaterToday, type WaterTodayState } from '@/src/hooks/use-water';
import { useWaterPreferences } from '@/src/hooks/use-water-preferences';
import { addDays, formatRelative } from '@/src/lib/time';
import { useNow } from '@/src/lib/use-now';
import type { WaterLog, WaterPreferences } from '@/src/db/schema';
import { fonts, textStyles, tokens } from '@/theme/tokens';

export default function WaterScreen() {
  const router = useRouter();
  const prefs = useWaterPreferences();
  const today = useWaterToday();
  // Single piece of state drives both create + edit modes — `editingSip`
  // null means create, otherwise the drawer opens pre-filled with that row.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingSip, setEditingSip] = useState<WaterLog | null>(null);

  const openCreateDrawer = useCallback(() => {
    setEditingSip(null);
    setDrawerOpen(true);
  }, []);

  const openEditDrawer = useCallback((sip: WaterLog) => {
    setEditingSip(sip);
    setDrawerOpen(true);
  }, []);

  // Singleton load happens in app/_layout.tsx — but on the very first frame
  // before the seed lands we still render an empty state. Returning null is
  // cleaner than rendering with `prefs?.targetMl ?? 3000` everywhere.
  if (!prefs) return null;

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <SubHeader
          title="Water"
          back="Home"
          onBack={() => router.back()}
          trailing={
            <Pressable onPress={() => router.push('/water-settings')} hitSlop={8}>
              <View style={styles.cogBubble}>
                <Glyph name="cog" />
              </View>
            </Pressable>
          }
        />

        <HeroCard prefs={prefs} today={today} />
        <QuickAddRow prefs={prefs} onOpenDrawer={openCreateDrawer} />
        <TodayLogSection sips={today.sips} onEdit={openEditDrawer} />
        <StreakSection />
      </ScrollView>
      <TabBar active="home" />

      <WaterLogDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        prefs={prefs}
        sip={editingSip}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick-add row — 4 tap-to-log tiles + dark `+` button → drawer.
// ─────────────────────────────────────────────────────────────────────────────
function QuickAddRow({
  prefs,
  onOpenDrawer,
}: {
  prefs: WaterPreferences;
  onOpenDrawer: () => void;
}) {
  // We log the sip directly from a quick-tap (no drawer roundtrip) — the
  // failure case is rare enough that an Alert is the simplest recovery.
  // No `at` argument means the helper stamps `new Date()` server-side.
  const handleQuickTap = useCallback(async (ml: number) => {
    try {
      await addWaterLog({ ml });
    } catch (err) {
      Alert.alert('Could not log sip', err instanceof Error ? err.message : String(err));
    }
  }, []);

  const tiles: ReadonlyArray<{ ml: number; label: string }> = [
    { ml: prefs.quickAdd1Ml, label: prefs.quickAdd1Label },
    { ml: prefs.quickAdd2Ml, label: prefs.quickAdd2Label },
    { ml: prefs.quickAdd3Ml, label: prefs.quickAdd3Label },
    { ml: prefs.quickAdd4Ml, label: prefs.quickAdd4Label },
  ];

  return (
    <View style={styles.quickAddOuter}>
      <Text style={[styles.kicker, textStyles.cap, styles.quickAddKicker]}>quick add</Text>
      <View style={styles.quickAddRow}>
        {tiles.map((t, i) => (
          <Pressable
            key={i}
            onPress={() => handleQuickTap(t.ml)}
            style={({ pressed }) => [
              styles.quickAddTile,
              pressed && { opacity: 0.6 },
            ]}>
            <View style={styles.quickAddTileValueRow}>
              <Text style={[styles.quickAddTileValue, textStyles.tnum]}>{t.ml}</Text>
              <Text style={styles.quickAddTileUnit}>ml</Text>
            </View>
            <Text style={[styles.quickAddTileSub, textStyles.cap]}>{t.label}</Text>
          </Pressable>
        ))}
        <Pressable
          onPress={onOpenDrawer}
          accessibilityLabel="Open log water drawer"
          style={({ pressed }) => [
            styles.quickAddPlus,
            pressed && { opacity: 0.65 },
          ]}>
          <Glyph name="plus" color={tokens.accent} size={14} />
        </Pressable>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Today's log — reverse chrono list of sips. Tap a row to edit/delete.
// ─────────────────────────────────────────────────────────────────────────────
function TodayLogSection({
  sips,
  onEdit,
}: {
  sips: ReadonlyArray<WaterLog>;
  onEdit: (sip: WaterLog) => void;
}) {
  if (sips.length === 0) {
    return (
      <View style={styles.logEmptyOuter}>
        <Text style={[styles.kicker, textStyles.cap, styles.logKicker]}>
          log · 0 sips today
        </Text>
        <Text style={styles.logEmptyText}>no sips yet today</Text>
      </View>
    );
  }

  return (
    <View style={styles.logOuter}>
      <Text style={[styles.kicker, textStyles.cap, styles.logKicker]}>
        log · {sips.length} sip{sips.length === 1 ? '' : 's'} today
      </Text>
      <View style={styles.logCard}>
        {sips.map((s, i) => {
          const isLast = i === sips.length - 1;
          const isTea = s.kind === 'tea';
          return (
            <Pressable
              key={s.id}
              onPress={() => onEdit(s)}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${s.ml} ml ${s.kind} from ${formatClockTime(s.at)}`}
              style={({ pressed }) => [
                styles.logRow,
                !isLast && styles.logRowBorder,
                pressed && { opacity: 0.65 },
              ]}>
              <Text style={[styles.logTime, textStyles.tnum]}>
                {formatClockTime(s.at)}
              </Text>
              <Text
                style={[
                  styles.logKind,
                  isTea && styles.logKindTea,
                ]}>
                {s.kind}
              </Text>
              <View style={styles.logMlRow}>
                <Text style={[styles.logMl, textStyles.tnum]}>{s.ml}</Text>
                <Text style={styles.logMlUnit}>ml</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function formatClockTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// StreakSection — heatmap card with current/best streak + legend. Layout
// mirrors fasting/StreakSection: weeks count is computed dynamically from
// the measured container width so cells stay at their fixed 14×14 design
// size rather than scaling.
// ─────────────────────────────────────────────────────────────────────────────
const STREAK_DAY_LABELS_WIDTH = 14;
const STREAK_LABEL_GAP = 6;
const MIN_WEEKS = 14;

function StreakSection() {
  const [weeks, setWeeks] = useState(MIN_WEEKS);
  const prefs = useWaterPreferences();

  const onSectionLayout = (e: LayoutChangeEvent) => {
    const innerWidth = e.nativeEvent.layout.width - 22 * 2; // streakWrap paddingHorizontal
    const gridWidth = innerWidth - STREAK_DAY_LABELS_WIDTH - STREAK_LABEL_GAP;
    // weeks * CELL + (weeks - 1) * GAP ≤ gridWidth
    //   → weeks ≤ (gridWidth + GAP) / (CELL + GAP)
    const fits = Math.floor((gridWidth + HEATMAP_GAP) / (HEATMAP_CELL + HEATMAP_GAP));
    const next = Math.max(MIN_WEEKS, fits);
    if (next !== weeks) setWeeks(next);
  };

  const history = useWaterHistory(weeks);
  const today = new Date();
  // weeks * 7 days back from today, inclusive of today (subtract `weeks*7 - 1`).
  // addDays is DST-safe, unlike ms arithmetic.
  const startDate = addDays(today, -(weeks * 7 - 1));
  const fmtDayMonth = new Intl.DateTimeFormat('en', { day: '2-digit', month: 'short' });
  const startLabel = fmtDayMonth.format(startDate).toLowerCase();
  const endLabel = fmtDayMonth.format(today).toLowerCase();

  return (
    <View style={styles.streakWrap} onLayout={onSectionLayout}>
      <View style={styles.streakHeader}>
        <Text style={[styles.kicker, textStyles.cap]}>streak · last {weeks} weeks</Text>
        <Text style={[styles.streakMeta, textStyles.tnum]}>
          current <Text style={styles.streakMetaStrong}>{history.currentStreak}d</Text>
          <Text style={styles.streakMetaDot}>{'  ·  '}</Text>
          best <Text style={styles.streakMetaStrong}>{history.bestStreak}d</Text>
        </Text>
      </View>

      <StreakHeatmap
        cells={history.cells}
        weeks={weeks}
        today={today}
        weekdayBitmask={prefs?.weekdayBitmask}
      />

      <View style={styles.streakLegend}>
        <Text style={styles.streakLegendEdge}>{startLabel}</Text>
        <View style={styles.streakLegendKey}>
          <Text style={styles.streakLegendWord}>less</Text>
          {([0, 1, 2, 3, 4] as const).map((l) => (
            <View
              key={l}
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                backgroundColor: HEAT_COLORS[l],
                borderWidth: l === 0 ? 1 : 0,
                borderColor: tokens.line2,
              }}
            />
          ))}
          <Text style={styles.streakLegendWord}>more</Text>
        </View>
        <Text style={styles.streakLegendEdge}>{endLabel}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Hero — left readout column + right WaterColumn fill cylinder.
// ─────────────────────────────────────────────────────────────────────────────
function HeroCard({ prefs, today }: { prefs: WaterPreferences; today: WaterTodayState }) {
  // 60s ticker so "23m ago" relative time stays fresh; sip mutations themselves
  // re-render via the live query in `useWaterToday`.
  const now = useNow(60_000);

  // Every kind counts equally — total ml is what shows in the big number
  // and drives the fill column.
  const counted = today.totalMl;
  const target = prefs.targetMl;
  const pct = target > 0 ? Math.round((counted / target) * 100) : 0;
  const remaining = Math.max(0, target - counted);

  const lastSipMs = today.lastSipAt ? now.getTime() - today.lastSipAt.getTime() : null;
  const pace = computePace(now, target, counted);

  return (
    <View style={styles.heroOuter}>
      <View style={styles.heroCard}>
        <View style={styles.heroReadout}>
          <Text style={[styles.kicker, textStyles.cap]}>today</Text>

          <View style={styles.bigNumberRow}>
            <Text style={[styles.bigNumber, textStyles.tnum]}>{formatLiters(counted)}</Text>
            <Text style={styles.bigNumberUnit}>L</Text>
          </View>

          <Text style={[styles.subline, textStyles.tnum]}>
            of <Text style={styles.sublineStrong}>{formatLiters(target, 1)}</Text> L
            <Text style={styles.sublineDot}>{'  ·  '}</Text>
            <Text style={styles.sublineStrong}>{pct}%</Text>
          </Text>

          <View style={styles.statStrip}>
            <StatRow label="to goal" value={`${formatLiters(remaining)} L`} />
            <StatRow
              label="last sip"
              value={lastSipMs === null ? '—' : `${formatRelative(lastSipMs)} ago`}
            />
            <StatRow
              label="μ pace"
              value={pace.label}
              tone={pace.tone}
            />
          </View>
        </View>

        <WaterColumn width={92} height={232} consumed={counted} target={target} />
      </View>
    </View>
  );
}

/**
 * Naive pace expectation: target ml is consumed linearly between WAKE and
 * SLEEP. Before wake → expected 0; after sleep → expected target. The
 * returned `label` already includes the sign + unit; `tone` drives color.
 *
 * The 06:00–22:00 window is hardcoded for v1 (no user setting yet). The
 * shape of the curve here is intentionally crude — once we have actual
 * historical pace data we'll replace with a real μ. For now this just
 * answers "should I drink more right now?"
 */
const PACE_WAKE_MIN = 6 * 60;
const PACE_SLEEP_MIN = 22 * 60;
const PACE_DAY_LENGTH = PACE_SLEEP_MIN - PACE_WAKE_MIN;
// |delta| under this threshold reads as "on pace" — avoids a constant ±1ml
// jitter from rounding.
const PACE_DEADBAND_ML = 50;

type PaceTone = 'normal' | 'warn' | 'muted';
type PaceReadout = { label: string; tone: PaceTone };

function computePace(now: Date, targetMl: number, totalMl: number): PaceReadout {
  if (targetMl <= 0) return { label: '—', tone: 'muted' };

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  let expected: number;
  if (minutesNow < PACE_WAKE_MIN) {
    // Before wake — comparing against 0 makes every drop "+N ml" which is
    // noisy and meaningless. Show muted until the day starts.
    return { label: '—', tone: 'muted' };
  } else if (minutesNow >= PACE_SLEEP_MIN) {
    expected = targetMl;
  } else {
    expected = targetMl * ((minutesNow - PACE_WAKE_MIN) / PACE_DAY_LENGTH);
  }

  const delta = Math.round(totalMl - expected);

  if (Math.abs(delta) < PACE_DEADBAND_ML) {
    return { label: 'on pace', tone: 'normal' };
  }

  // U+2212 (typographic minus) — JBMono ships a clean glyph that aligns
  // with the digits at our sizes; ASCII hyphen reads as a half-width dash.
  const sign = delta > 0 ? '+' : '−';
  return {
    label: `${sign}${Math.abs(delta)} ml vs μ`,
    tone: delta > 0 ? 'normal' : 'warn',
  };
}

function StatRow({
  label,
  value,
  tone = 'normal',
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'warn' | 'muted';
}) {
  return (
    <View style={styles.statRow}>
      <Text style={[styles.statLabel, textStyles.cap]}>{label}</Text>
      <Text
        style={[
          styles.statValue,
          textStyles.tnum,
          tone === 'muted' && styles.statValueMuted,
          tone === 'warn' && styles.statValueWarn,
        ]}>
        {value}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WaterColumn — vertical fill cylinder.
//
// Layout: a tick-label column on the left (0.0 L → target L, top→bottom), then
// the glass cylinder with a gradient fill clipped to the rounded rect. The
// surface line uses the accent ink so it reads against the dark fill.
//
// Tick marks every 500 ml; majors at L boundaries get a longer line and
// bolder/larger label.
// ─────────────────────────────────────────────────────────────────────────────
function WaterColumn({
  width,
  height,
  consumed,
  target,
}: {
  width: number;
  height: number;
  consumed: number;
  target: number;
}) {
  const radius = 14;
  const pct = target > 0 ? Math.min(consumed / target, 1) : 0;
  const fillTopY = height - pct * height;

  // Generate tick stops every 500 ml up to target. We then drop the first
  // and last from both the marks and labels — 0 ml is implicit and the
  // target value is shown in the readout next to the column, so neither
  // edge tick is informative and they crowd the corners.
  const allTicks = generateTicks(target);
  const innerTicks = allTicks.slice(1, -1);

  return (
    <View style={waterColumnStyles.outer}>
      {/* Left: tick labels reading top→bottom for inner ticks only. The
          labels are absolute-positioned so they line up exactly with the
          tick marks inside the cylinder. */}
      <View style={[waterColumnStyles.labels, { height, width: 28 }]}>
        {innerTicks.map((ml) => {
          const reached = consumed >= ml;
          const isMajor = ml % 1000 === 0;
          const y = height - (ml / target) * height;
          return (
            <Text
              key={ml}
              style={[
                waterColumnStyles.tickLabel,
                {
                  top: y - 5, // centers the 10px line-height around the tick y
                  color: reached ? tokens.ink3 : tokens.ink4,
                  fontFamily: isMajor ? fonts.monoMedium : fonts.mono,
                  fontStyle: reached ? 'normal' : 'italic',
                },
              ]}>
              {(ml / 1000).toFixed(1)} L
            </Text>
          );
        })}
      </View>

      {/* Glass cylinder — fill alone communicates progress; no surface
          indicator any more. */}
      <Svg width={width} height={height}>
        <Defs>
          <ClipPath id="waterClip">
            <Rect x={0} y={0} width={width} height={height} rx={radius} ry={radius} />
          </ClipPath>
          <LinearGradient id="waterFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={tokens.ink} stopOpacity={0.9} />
            <Stop offset="100%" stopColor={tokens.ink} stopOpacity={1} />
          </LinearGradient>
        </Defs>

        {/* Glass body. */}
        <Rect
          x={0.5}
          y={0.5}
          width={width - 1}
          height={height - 1}
          rx={radius - 0.5}
          ry={radius - 0.5}
          fill={tokens.bg2}
          stroke={tokens.line2}
          strokeWidth={1}
        />

        {/* Fill + surface squiggle, clipped to the cylinder. */}
        <Rect
          x={0}
          y={fillTopY}
          width={width}
          height={height - fillTopY}
          fill="url(#waterFill)"
          clipPath="url(#waterClip)"
        />
        <Path
          d={surfacePath(width, height, fillTopY)}
          fill={tokens.ink}
          fillOpacity={0.15}
          clipPath="url(#waterClip)"
        />
        {/* Subtle highlight strip on the left, like a real glass. */}
        <Rect
          x={4}
          y={4}
          width={3}
          height={height - 8}
          rx={1.5}
          fill={tokens.card}
          fillOpacity={0.15}
          clipPath="url(#waterClip)"
        />

        {/* Tick marks on the right edge inside the cylinder — inner only. */}
        {innerTicks.map((ml) => {
          const y = height - (ml / target) * height;
          const major = ml % 1000 === 0;
          const reached = consumed >= ml;
          return (
            <Line
              key={ml}
              x1={width - (major ? 14 : 9)}
              y1={y}
              x2={width - 2}
              y2={y}
              stroke={reached ? tokens.bg : tokens.ink3}
              strokeOpacity={reached ? 0.7 : 0.35}
              strokeWidth={major ? 0.9 : 0.6}
            />
          );
        })}
      </Svg>
    </View>
  );
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

function generateTicks(target: number): number[] {
  const step = 500;
  const out: number[] = [];
  for (let v = 0; v <= target; v += step) out.push(v);
  if (out[out.length - 1] !== target) out.push(target);
  return out;
}

/**
 * Build the wavy "surface" path that fills from the water line down. We use a
 * gentle S-curve so it looks like a meniscus without trying too hard.
 */
function surfacePath(w: number, h: number, fillTopY: number): string {
  return (
    `M0 ${fillTopY}` +
    ` C ${w * 0.25} ${fillTopY - 4}, ${w * 0.5} ${fillTopY + 4}, ${w * 0.75} ${fillTopY - 2}` +
    ` S ${w} ${fillTopY + 1}, ${w} ${fillTopY}` +
    ` L ${w} ${h} L 0 ${h} Z`
  );
}

/** 2-decimal default, configurable for the "of 3.0" target row. */
function formatLiters(ml: number, decimals: number = 2): string {
  return (ml / 1000).toFixed(decimals);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 100,
  },
  cogBubble: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroOuter: {
    paddingTop: 6,
    paddingHorizontal: 22,
  },
  heroCard: {
    backgroundColor: tokens.card,
    borderColor: tokens.line,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 18,
  },

  heroReadout: {
    flex: 1,
    minWidth: 0,
  },

  kicker: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 2.2,
  },

  bigNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 6,
  },
  bigNumber: {
    fontFamily: fonts.monoMedium,
    fontSize: 56,
    color: tokens.ink,
    // Web design used `-0.04em` for tight tabular display, but at this size
    // RN's letterSpacing in absolute px causes glyph collision against JBMono's
    // slashed zero. -1 reads as the design intent without breaking the figure.
    letterSpacing: -1,
    // Line-height must be ≥ font-size or RN clips the cap line, which made
    // "0.00" look like a series of horizontal bars on the device.
    lineHeight: 60,
  },
  bigNumberUnit: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink3,
  },

  subline: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink3,
    marginTop: 5,
    letterSpacing: 0.48,
  },
  sublineStrong: {
    color: tokens.ink,
    fontFamily: fonts.monoMedium,
  },
  sublineDot: {
    color: tokens.ink4,
  },

  statStrip: {
    marginTop: 12,
    paddingTop: 12,
    borderTopColor: tokens.line,
    borderTopWidth: 1,
    gap: 6,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    letterSpacing: 1.8,
  },
  statValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: tokens.ink,
  },
  statValueMuted: {
    color: tokens.ink4,
    fontFamily: fonts.mono,
  },
  statValueWarn: {
    color: tokens.warn,
  },

  // ── Quick add ───────────────────────────────────────────────────
  quickAddOuter: {
    paddingTop: 14,
    paddingHorizontal: 22,
  },
  quickAddKicker: {
    marginBottom: 8,
  },
  quickAddRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickAddTile: {
    flex: 1,
    paddingTop: 10,
    paddingBottom: 8,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    alignItems: 'center',
    gap: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.03,
  },
  quickAddTileValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  quickAddTileValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 15,
    color: tokens.ink,
    letterSpacing: -0.15,
  },
  quickAddTileUnit: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
  },
  quickAddTileSub: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    letterSpacing: 1.6,
  },
  quickAddPlus: {
    width: 44,
    borderRadius: 12,
    backgroundColor: tokens.ink,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 14,
    shadowOpacity: 0.12,
  },

  // ── Today's log ─────────────────────────────────────────────────
  logOuter: {
    paddingTop: 16,
    paddingHorizontal: 22,
  },
  logEmptyOuter: {
    paddingTop: 16,
    paddingHorizontal: 22,
  },
  logKicker: {
    marginBottom: 8,
  },
  logEmptyText: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.26,
  },
  logCard: {
    backgroundColor: tokens.card,
    borderColor: tokens.line,
    borderWidth: 1,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    shadowOpacity: 0.02,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 12,
  },
  logRowBorder: {
    borderBottomColor: tokens.line,
    borderBottomWidth: 1,
  },
  logTime: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink3,
    letterSpacing: 0.48,
    width: 56,
  },
  logKind: {
    flex: 1,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 1.98,
    textTransform: 'uppercase',
  },
  logKindTea: {
    color: tokens.cool,
    fontStyle: 'italic',
  },
  logMlRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  logMl: {
    fontFamily: fonts.monoSemibold,
    fontSize: 14,
    color: tokens.ink,
  },
  logMlUnit: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
  },

  // ── Streak section ──────────────────────────────────────────────
  streakWrap: {
    paddingTop: 16,
    paddingHorizontal: 22,
  },
  streakHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  streakMeta: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink3,
  },
  streakMetaStrong: {
    fontFamily: fonts.monoSemibold,
    color: tokens.ink,
  },
  streakMetaDot: {
    color: tokens.ink4,
  },
  streakLegend: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  streakLegendEdge: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  streakLegendKey: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  streakLegendWord: {
    fontFamily: fonts.mono,
    fontSize: 10,
    color: tokens.ink4,
  },
});

const waterColumnStyles = StyleSheet.create({
  outer: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
  },
  labels: {
    position: 'relative',
  },
  tickLabel: {
    position: 'absolute',
    right: 0,
    fontSize: 11,
    letterSpacing: 0.44,
    lineHeight: 12,
    textAlign: 'right',
  },
});
