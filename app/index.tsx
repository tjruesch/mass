import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Locked to en so the dateline stays compact ("thu 14 may") regardless of
// device locale — matches the design's deliberately terse mono treatment.
const WEEKDAY_FMT = new Intl.DateTimeFormat('en', { weekday: 'short' });
const MONTH_FMT = new Intl.DateTimeFormat('en', { month: 'short' });

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

/** Time-of-day greeting bucket. Boundaries match what feels natural for an
 *  app with a wake/sleep window of ~06:00–22:00. Late-night users (post-21:00
 *  through pre-05:00) get "Evening" rather than a clinical "Night" because
 *  the surface is a fitness/health log, not a sleep aid. */
function formatMacroG(g: number): string {
  if (g === 0) return '0g';
  if (Number.isInteger(g)) return `${g}g`;
  return `${Math.round(g * 10) / 10}g`;
}


function greetingFor(d: Date): string {
  const h = d.getHours();
  if (h < 5) return 'Evening';
  if (h < 12) return 'Morning';
  if (h < 17) return 'Afternoon';
  return 'Evening';
}

import { TabBar, WindowStrip } from '@/components/design';
import { useTodayMove } from '@/src/hooks/use-move';
import { useFasting, type FastingState } from '@/src/hooks/use-fasting';
import { useFastingPreferences } from '@/src/hooks/use-fasting-preferences';
import { useMealPreferences } from '@/src/hooks/use-meal-preferences';
import { useTodayMeals } from '@/src/hooks/use-meals';
import { useWaterToday } from '@/src/hooks/use-water';
import { useWaterPreferences } from '@/src/hooks/use-water-preferences';
import { useNow } from '@/src/lib/use-now';
import {
  FASTING_PHASES,
  formatHM,
  formatHMS,
  formatRelative,
  isInWindow,
  minutesUntil,
  nowMinutes,
} from '@/src/lib/time';
import { fonts, textStyles, tokens } from '@/theme/tokens';

// ─────────────────────────────────────────────────────────────────────────────
// Hero rings — three concentric kcal/h2o/move arcs, no center label.
// ─────────────────────────────────────────────────────────────────────────────
function Concentric({
  size = 138,
  kcalPct,
  h2oPct,
  movePct,
}: {
  size?: number;
  /** 0..1+ — outer ring (ink). Driven by meals consumed / budget. */
  kcalPct?: number;
  /** 0..1+ — middle ring (cool). Arc clamps at 1; the head puck keeps going past it. */
  h2oPct?: number;
  /** 0..1+ — inner ring (accent). Driven by HK exercise minutes / target. */
  movePct?: number;
}) {
  const kcalRaw = kcalPct === undefined ? 0 : Math.max(0, kcalPct);
  const h2oRaw = h2oPct === undefined ? 0.617 : Math.max(0, h2oPct);
  const moveRaw = movePct === undefined ? 0 : Math.max(0, movePct);
  const cx = size / 2;
  const cy = size / 2;
  const rings = [
    // Outer + inner radii anchor the design (83 and 35 at size 184); the
    // middle ring sits at their midpoint (radius 59 = rOff 24) so the
    // stroke-to-stroke gaps land at 8px on both sides — equally spaced
    // regardless of sw. Bump sw to thicken the bands without changing the
    // outer or inner ring size; gap simply shrinks.
    { rOff: 0, target: kcalRaw, c: tokens.ink, sw: 16 },
    { rOff: 24, target: h2oRaw, c: tokens.cool, sw: 16 },
    { rOff: 48, target: moveRaw, c: tokens.accentInk, sw: 16 },
  ];

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {rings.map((r, i) => {
          // Inset accounts for the outer ring's half-stroke + head puck
          // stroke overhang + anti-alias safety. At sw=16, 10 per side
          // keeps the outer ring + puck fully inside the viewport with
          // ~2px slack.
          const outerInset = 10;
          const radius = (size - outerInset * 2) / 2 - r.rOff;
          return (
            <Ring
              key={i}
              cx={cx}
              cy={cy}
              radius={radius}
              strokeWidth={r.sw}
              color={r.c}
              target={r.target}
              // Tiny stagger so outer-to-inner reads like a sweep rather
              // than a simultaneous fill — Apple Watch does the same trick.
              delay={i * 60}
            />
          );
        })}
      </Svg>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Single ring — animated fill + head puck via react-native-reanimated.
//
// The fill value `progress` lives in a shared value so the arc's
// strokeDasharray and the puck's cx/cy can both react to it on the UI
// thread (no JS-side re-renders per frame). The arc renders clamped to
// one lap, but the puck reads the raw value so over-target days keep the
// puck advancing into a second rotation.
// ─────────────────────────────────────────────────────────────────────────────
function Ring({
  cx,
  cy,
  radius,
  strokeWidth,
  color,
  target,
  delay = 0,
}: {
  cx: number;
  cy: number;
  radius: number;
  strokeWidth: number;
  color: string;
  target: number;
  delay?: number;
}) {
  const progress = useSharedValue(0);
  const c = 2 * Math.PI * radius;
  const headFillR = strokeWidth / 2 - 1;

  const firstMountRef = useRef(true);

  useEffect(() => {
    const isFirst = firstMountRef.current;
    firstMountRef.current = false;

    const startAnimation = () => {
      progress.value = withTiming(target, {
        duration: 800,
        easing: Easing.out(Easing.cubic),
      });
    };

    // Stagger only on the first paint — afterwards, value changes (e.g. a
    // new sip) animate immediately so the puck tracks the data without lag.
    if (isFirst && delay > 0) {
      const handle = setTimeout(startAnimation, delay);
      return () => clearTimeout(handle);
    }
    startAnimation();
  }, [target, delay, progress]);

  const arcProps = useAnimatedProps(() => {
    const arc = Math.min(1, progress.value);
    return {
      strokeDasharray: [c * arc, c] as [number, number],
    };
  });

  const headProps = useAnimatedProps(() => {
    const angle = -Math.PI / 2 + progress.value * 2 * Math.PI;
    return {
      cx: cx + Math.cos(angle) * radius,
      cy: cy + Math.sin(angle) * radius,
      // Puck fades in on the first few percent so it doesn't pop visibly
      // at angle=-π/2 the moment the animation starts.
      opacity: Math.min(1, progress.value / 0.03),
    };
  });

  return (
    <G>
      {/* track */}
      <Circle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={tokens.bg2}
        strokeWidth={strokeWidth}
      />
      {/* progress arc */}
      <AnimatedCircle
        cx={cx}
        cy={cy}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cy})`}
        animatedProps={arcProps}
      />
      {/* head puck */}
      <AnimatedCircle
        r={headFillR}
        fill={tokens.card}
        stroke={color}
        strokeWidth={1.5}
        animatedProps={headProps}
      />
    </G>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Legend row — color swatch + label + value/unit + pct/target.
// ─────────────────────────────────────────────────────────────────────────────
type LegendProps = {
  swatch: string;
  label: string;
  value: string;
  unit?: string;
  target: string;
  pct: string;
};

function Legend({ swatch, label, value, unit, target, pct }: LegendProps) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendSwatch, { backgroundColor: swatch }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.legendLabel, textStyles.cap]}>{label}</Text>
        <Text style={[styles.legendValue, textStyles.tnum]}>
          {value}
          {unit ? <Text style={styles.legendUnit}> {unit}</Text> : null}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.legendPct, textStyles.tnum]}>{pct}</Text>
        <Text style={[styles.legendTarget, textStyles.tnum]}>{target}</Text>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase bar — 5 segments + animated "now" marker driven by current elapsed.
// ─────────────────────────────────────────────────────────────────────────────
function PhaseBar({ elapsedHours }: { elapsedHours: number }) {
  return (
    <View>
      <View style={styles.phaseRow}>
        {FASTING_PHASES.map((p) => {
          const isPast = elapsedHours >= p.end;
          const isCurrent = elapsedHours >= p.start && elapsedHours < p.end;
          const isFuture = elapsedHours < p.start;
          const flex = p.end - p.start;
          const innerWidthPct = isCurrent ? ((elapsedHours - p.start) / (p.end - p.start)) * 100 : 0;
          return (
            <View
              key={p.id}
              style={{
                flex,
                height: '100%',
                borderRadius: 3,
                backgroundColor: isPast ? tokens.ink : tokens.bg2,
                opacity: isFuture ? 0.45 : 1,
                borderWidth: 1,
                borderColor: isCurrent ? tokens.ink : 'transparent',
                overflow: 'hidden',
              }}>
              {isCurrent && (
                <View
                  style={{
                    position: 'absolute',
                    top: 1,
                    bottom: 1,
                    left: 1,
                    width: `${innerWidthPct}%`,
                    backgroundColor: tokens.ink,
                    borderRadius: 2,
                  }}
                />
              )}
            </View>
          );
        })}
        {/* "Now" marker — vertical accent line at current elapsed % */}
        <View
          style={[styles.nowMarker, { left: `${(Math.min(elapsedHours, 24) / 24) * 100}%` }]}
        />
      </View>
      <View style={styles.phaseLabels}>
        {FASTING_PHASES.map((p) => {
          const isCurrent = elapsedHours >= p.start && elapsedHours < p.end;
          return (
            <Text
              key={p.id}
              style={{
                flex: p.end - p.start,
                textAlign: 'left',
                fontFamily: isCurrent ? fonts.monoSemibold : fonts.mono,
                fontSize: 11,
                letterSpacing: 0.44,
                color: isCurrent ? tokens.ink2 : tokens.ink4,
              }}>
              {p.short}
            </Text>
          );
        })}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FastingCardBody — header + counter + bar; same layout for active/idle.
//
// Active: counter is elapsed HH:MM:SS, chip shows current fasting phase, bar
// is the 5-phase fasting progression.
//
// Idle:   counter is the countdown to the next fast (or to the eating
// window opening, when outside it), chip reflects the eating-day phase, bar
// is the 24h eating-window strip — mirroring the EatingDayBar on /fasting.
// ─────────────────────────────────────────────────────────────────────────────
function FastingCardBody({ fasting }: { fasting: FastingState }) {
  if (fasting.status === 'active') {
    return (
      <>
        <View style={styles.fastingHeader}>
          <Text style={[styles.cardLabel, textStyles.cap]}>fasting</Text>
          <View style={styles.fastingChip}>
            <View style={styles.streakDot} />
            <Text style={styles.fastingChipText}>{fasting.currentPhase.short}</Text>
          </View>
        </View>
        <View style={styles.fastingTimes}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text style={[styles.fastingElapsed, textStyles.tnum]}>
              {formatHMS(fasting.elapsedMs).slice(0, 5)}
              <Text style={styles.fastingElapsedSeconds}>
                {formatHMS(fasting.elapsedMs).slice(5)}
              </Text>
            </Text>
            <Text style={styles.fastingElapsedLabel}>elapsed</Text>
          </View>
        </View>
        <PhaseBar elapsedHours={fasting.elapsedHours} />
      </>
    );
  }
  return <IdleFastingCardBody />;
}

function IdleFastingCardBody() {
  const prefs = useFastingPreferences();
  if (!prefs) {
    // Reserve roughly the active-state height so the card doesn't jump
    // when prefs land.
    return (
      <>
        <View style={styles.fastingHeader}>
          <Text style={[styles.cardLabel, textStyles.cap]}>fasting</Text>
        </View>
        <View style={{ height: 70 }} />
      </>
    );
  }
  const { eatingWindowStartMin: startMin, eatingWindowEndMin: endMin } = prefs;
  const now = nowMinutes();
  const eating = isInWindow(now, startMin, endMin);
  const nextEventMin = eating ? endMin : startMin;
  const minsToNext = minutesUntil(now, nextEventMin);
  const chipLabel = eating ? 'eating' : 'between meals';
  const countdownLabel = eating ? 'fast in' : 'eating in';

  return (
    <>
      <View style={styles.fastingHeader}>
        <Text style={[styles.cardLabel, textStyles.cap]}>fasting</Text>
        <View style={styles.fastingChip}>
          <View style={styles.streakDot} />
          <Text style={styles.fastingChipText}>{chipLabel}</Text>
        </View>
      </View>
      <View style={styles.fastingTimes}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text style={[styles.fastingElapsed, textStyles.tnum]}>
            {formatRelative(minsToNext * 60_000)}
          </Text>
          <Text style={styles.fastingElapsedLabel}>{countdownLabel}</Text>
        </View>
      </View>
      <WindowStrip startMin={startMin} endMin={endMin} />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen.
// ─────────────────────────────────────────────────────────────────────────────
export default function HomeScreen() {
  const router = useRouter();
  const fasting = useFasting(1000);
  // Live water — 60s tick is plenty; live query also re-runs on every sip.
  const waterToday = useWaterToday();
  const waterPrefs = useWaterPreferences();
  const waterTargetMl = waterPrefs?.targetMl ?? 3000;
  const waterPctValue = waterTargetMl > 0 ? waterToday.totalMl / waterTargetMl : 0;
  const waterPctLabel = `${Math.round(waterPctValue * 100)}%`;
  const waterValueLabel = (waterToday.totalMl / 1000).toFixed(2);
  const waterTargetLabel = `of ${(waterTargetMl / 1000).toFixed(1)}`;

  // Live meals + meal prefs — kcal ring, macros card, and deficit/tdee
  // footer all read from these.
  const today = useTodayMeals();
  const mealPrefs = useMealPreferences();
  const budgetKcal = mealPrefs.budgetKcal;
  const consumedKcal = today.totalKcal;
  const kcalPctValue =
    budgetKcal > 0 ? consumedKcal / budgetKcal : 0;
  const kcalValueLabel = Math.round(consumedKcal).toString();
  const kcalTargetLabel = `of ${budgetKcal}`;
  const kcalPctLabel = `${Math.round(kcalPctValue * 100)}%`;

  // Per-macro kcal contribution drives the stacked bar widths — protein
  // and carbs are 4 kcal/g, fat is 9. When no meals are logged yet, fall
  // back to a flat split so the bar isn't a degenerate zero-width strip.
  const pKcal = today.totalProteinG * 4;
  const cKcal = today.totalCarbsG * 4;
  const fKcal = today.totalFatG * 9;
  const macroKcalSum = pKcal + cKcal + fKcal;
  const macroFlexP = macroKcalSum > 0 ? pKcal : 0;
  const macroFlexC = macroKcalSum > 0 ? cKcal : 0;
  const macroFlexF = macroKcalSum > 0 ? fKcal : 0;
  // Tail fills whatever budget remains so the bar reads as a progress
  // strip, not just a sum-of-macros. Zero macros + zero kcal collapses
  // the bar to its bg track.
  const macroFlexTail = Math.max(0, budgetKcal - macroKcalSum);

  // `left` cell shows protein remaining — the macro that actually
  // matters to hit. Total grams of all macros remaining can't be
  // computed coherently across P/C/F with different kcal densities.
  const proteinLeftG = Math.max(
    0,
    mealPrefs.proteinTargetG - today.totalProteinG,
  );
  const tdeeToShow = mealPrefs.prefs?.tdeeKcal ?? 2400;
  // Actual deficit = TDEE − consumed. Positive while cutting,
  // negative on surplus. Label flips to "surplus" past zero; the
  // number itself is always shown as a positive integer with the
  // sign carried by the colour (green = on plan, red = over).
  const actualDeficitKcal = tdeeToShow - consumedKcal;
  const overBudget = consumedKcal > budgetKcal;
  const deficitLabelText = actualDeficitKcal >= 0 ? 'deficit' : 'surplus';

  // Live move ring — active kcal from HK (Apple's red Move ring).
  // Returns null while HK auth is pending; the ring + legend
  // gracefully show 0 / '—'.
  const move = useTodayMove();
  const moveValueLabel = move.kcal === null ? '—' : Math.round(move.kcal).toString();
  const moveTargetLabel = `of ${move.target}`;
  const movePctLabel =
    move.kcal === null ? '—' : `${Math.round(move.pct * 100)}%`;
  // Dateline ticks every 60s so the displayed minute stays current. Day +
  // weekday update on the next tick after midnight, which is good enough
  // for an app you only have open in short bursts.
  const now = useNow(60_000);
  const datelineLabel = formatDateline(now);
  const timeLabel = formatClockTime(now);

  return (
    <View style={{ flex: 1, backgroundColor: tokens.bg }}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── 1. Greeting block ─────────────────────────────────── */}
        <View style={styles.greetingWrap}>
          <View style={styles.greetingTopRow}>
            <Text style={[styles.dateline, textStyles.cap]}>
              {datelineLabel} <Text style={styles.datelineDot}> · </Text>{timeLabel}
            </Text>
            <View style={styles.streakChip}>
              <View style={styles.streakDot} />
              <Text style={styles.streakText}>streak 12d</Text>
            </View>
          </View>
          <Text style={styles.greetingHeading}>
            {greetingFor(now)}, <Text style={styles.greetingHeadingName}>Tom.</Text>
          </Text>
          <Text style={styles.greetingSub}>
            {fasting.status === 'active' && fasting.msToNextPhase !== null && fasting.msToNextPhase > 0 ? (
              <>
                <Text>fasting </Text>
                <Text style={styles.greetingSubStrong}>{formatRelative(fasting.msToNextPhase)}</Text>
                <Text style={styles.greetingSubMute}> to {fasting.nextPhase?.short ?? 'next phase'}</Text>
              </>
            ) : fasting.status === 'active' ? (
              <>
                <Text>fasting </Text>
                <Text style={styles.greetingSubStrong}>{formatHM(fasting.elapsedMs)}</Text>
                <Text style={styles.greetingSubMute}> elapsed</Text>
              </>
            ) : (
              <Text style={styles.greetingSubMute}>no active fast</Text>
            )}
            <Text style={styles.greetingSubMute}>{'  ·  '}</Text>
            {/* TODO(goals slice): wire 'day 14 / 28' to active goal */}
            <Text style={styles.greetingSubStrong}>day 14</Text>
            <Text style={styles.greetingSubMute}> / 28</Text>
          </Text>
        </View>

        {/* ── 2. Hero rings — inline, flows directly under the greeting ── */}
        <View style={styles.heroSection}>
          <View style={styles.heroBody}>
            <Concentric
              size={184}
              kcalPct={kcalPctValue}
              h2oPct={waterPctValue}
              movePct={move.pct}
            />
            <View style={styles.heroLegendCol}>
              <Pressable onPress={() => router.push('/meals' as never)}>
                {({ pressed }) => (
                  <View style={pressed && { opacity: 0.6 }}>
                    <Legend
                      swatch={tokens.ink}
                      label="kcal"
                      value={kcalValueLabel}
                      target={kcalTargetLabel}
                      pct={kcalPctLabel}
                    />
                  </View>
                )}
              </Pressable>
              <View style={styles.legendDivider} />
              <Pressable onPress={() => router.push('/water')}>
                {({ pressed }) => (
                  <View style={pressed && { opacity: 0.6 }}>
                    <Legend
                      swatch={tokens.cool}
                      label="h2o"
                      value={waterValueLabel}
                      target={waterTargetLabel}
                      pct={waterPctLabel}
                    />
                  </View>
                )}
              </Pressable>
              <View style={styles.legendDivider} />
              <Legend
                swatch={tokens.accentInk}
                label="move"
                value={moveValueLabel}
                target={moveTargetLabel}
                pct={movePctLabel}
              />
            </View>
          </View>
        </View>

        {/* Temporary entries — real navigation comes via Trends (weight)
            and Plan (workouts) when those slices ship. */}
        <View style={styles.tempWeightLinkOuter}>
          <Pressable
            onPress={() => router.push('/weight')}
            style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Text style={[styles.tempWeightLinkText, textStyles.cap]}>
              → weight (temp)
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/workouts')}
            style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Text style={[styles.tempWeightLinkText, textStyles.cap]}>
              → workouts (temp)
            </Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/pantry' as never)}
            style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Text style={[styles.tempWeightLinkText, textStyles.cap]}>
              → pantry (temp)
            </Text>
          </Pressable>
        </View>

        {/* ── 3. Fasting card ───────────────────────────────────── */}
        <View style={styles.cardOuterTight}>
          <Pressable onPress={() => router.push('/fasting')}>
            {({ pressed }) => (
              <View style={[styles.card, styles.fastingCard, pressed && { opacity: 0.94 }]}>
                <FastingCardBody fasting={fasting} />
              </View>
            )}
          </Pressable>
        </View>

        {/* ── 4. Macros card ────────────────────────────────────── */}
        <Pressable onPress={() => router.push('/meals' as never)}>
          {({ pressed }) => (
            <View
              style={[
                styles.cardOuterTight,
                { marginBottom: 8 },
                pressed && { opacity: 0.94 },
              ]}>
              <View style={[styles.card, styles.macrosCard]}>
                <View style={styles.macrosHeader}>
                  <Text style={[styles.cardLabel, textStyles.cap]}>
                    macros · today
                  </Text>
                  <Text style={[styles.macrosKcal, textStyles.tnum]}>
                    <Text style={styles.macrosKcalStrong}>
                      {kcalValueLabel}
                    </Text>
                    <Text> / {budgetKcal} kcal</Text>
                  </Text>
                </View>
                <View style={styles.macrosBar}>
                  <View style={{ flex: macroFlexP, backgroundColor: tokens.ink }} />
                  <View style={{ flex: macroFlexC, backgroundColor: tokens.cool }} />
                  <View
                    style={{ flex: macroFlexF, backgroundColor: tokens.accentInk }}
                  />
                  <View style={{ flex: macroFlexTail }} />
                </View>
                <View style={styles.macrosGrid}>
                  {[
                    {
                      k: 'P',
                      v: formatMacroG(today.totalProteinG),
                      c: tokens.ink,
                      italic: false,
                    },
                    {
                      k: 'C',
                      v: formatMacroG(today.totalCarbsG),
                      c: tokens.cool,
                      italic: false,
                    },
                    {
                      k: 'F',
                      v: formatMacroG(today.totalFatG),
                      c: tokens.accentInk,
                      italic: false,
                    },
                    {
                      k: 'left',
                      v: formatMacroG(proteinLeftG),
                      c: tokens.ink4,
                      italic: true,
                    },
                  ].map((m) => (
                    <View key={m.k} style={styles.macroCell}>
                      <Text
                        style={{
                          fontFamily: fonts.monoMedium,
                          fontSize: 12,
                          color: m.c,
                          letterSpacing: 1.92,
                          textTransform: m.italic ? 'lowercase' : 'uppercase',
                          fontStyle: m.italic ? 'italic' : 'normal',
                        }}>
                        {m.k}
                      </Text>
                      <Text style={[styles.macroValue, textStyles.tnum]}>
                        {m.v}
                      </Text>
                    </View>
                  ))}
                </View>
                <View style={styles.macrosFooter}>
                  <Text>
                    <Text
                      style={[
                        styles.deficitValue,
                        textStyles.tnum,
                        { color: overBudget ? tokens.warn : '#1F7A3A' },
                      ]}>
                      {Math.abs(Math.round(actualDeficitKcal))}
                    </Text>
                    <Text style={[styles.deficitLabel, textStyles.cap]}>
                      {' '}
                      {deficitLabelText}
                    </Text>
                  </Text>
                  <Text>
                    <Text style={[styles.tdeeValue, textStyles.tnum]}>
                      {tdeeToShow}
                    </Text>
                    <Text style={[styles.deficitLabel, textStyles.cap]}>
                      {' '}
                      tdee
                    </Text>
                  </Text>
                </View>
              </View>
            </View>
          )}
        </Pressable>
      </ScrollView>

      <TabBar active="home" />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingTop: 54,
    paddingBottom: 100,
  },

  // Greeting
  greetingWrap: {
    paddingTop: 8,
    paddingHorizontal: 22,
  },
  greetingTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
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
  streakChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 9,
    backgroundColor: tokens.bg2,
    borderRadius: 999,
  },
  streakDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: tokens.accentInk,
    // approximate the source's box-shadow glow
    shadowColor: tokens.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 6,
    shadowOpacity: 1,
  },
  streakText: {
    fontFamily: fonts.mono,
    fontSize: 11,
    letterSpacing: 1.76,
    textTransform: 'uppercase',
    color: tokens.ink2,
  },
  greetingHeading: {
    fontFamily: fonts.sansSemibold,
    fontSize: 26,
    letterSpacing: -0.65,
    marginTop: 8,
    color: tokens.ink,
  },
  greetingHeadingName: {
    fontFamily: fonts.sans,
    color: tokens.ink3,
  },
  greetingSub: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink3,
    marginTop: 5,
  },
  greetingSubStrong: {
    color: tokens.ink,
    fontFamily: fonts.monoMedium,
  },
  greetingSubMute: {
    color: tokens.ink4,
  },

  // Temp — replaced by #56's proper home weight surface.
  tempWeightLinkOuter: {
    paddingTop: 12,
    paddingHorizontal: 22,
  },
  tempWeightLinkText: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    letterSpacing: 2.16,
  },

  // Cards
  cardOuter: {
    paddingTop: 16,
    paddingHorizontal: 22,
  },
  cardOuterTight: {
    paddingTop: 12,
    paddingHorizontal: 22,
  },
  card: {
    backgroundColor: tokens.card,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: tokens.line,
    // Outer drop shadow only — RN doesn't support inset shadows
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    shadowOpacity: 0.04,
  },
  cardLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },

  // Hero — inline section, no card frame. Sits on the page bg directly so
  // the rings feel like the page itself rather than the first of three boxes.
  // No internal header — the legend rows already label each ring.
  heroSection: {
    paddingTop: 22,
    paddingHorizontal: 22,
  },
  // space-between: rings stick to the page's left padding, legend stays
  // tucked against the right padding, all the slack becomes negative space
  // between them (the user wanted that air, not stretched legend rows).
  heroBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLegendCol: {
    width: 132,
  },

  // Legend
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  legendSwatch: {
    width: 8,
    height: 8,
    borderRadius: 999,
  },
  legendLabel: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink3,
    letterSpacing: 1.98,
  },
  legendValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 18,
    color: tokens.ink,
    marginTop: 3,
    letterSpacing: -0.27,
  },
  legendUnit: {
    color: tokens.ink4,
    fontSize: 12,
    fontFamily: fonts.mono,
  },
  legendPct: {
    fontFamily: fonts.monoSemibold,
    fontSize: 13,
    color: tokens.ink,
  },
  legendTarget: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    marginTop: 2,
  },
  legendDivider: {
    height: 1,
    backgroundColor: tokens.line,
  },

  // Fasting card
  fastingCard: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderRadius: 18,
  },
  fastingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  fastingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 999,
    backgroundColor: tokens.bg2,
  },
  fastingChipText: {
    fontFamily: fonts.monoSemibold,
    fontSize: 11,
    letterSpacing: 1.76,
    textTransform: 'uppercase',
    color: tokens.ink2,
  },
  fastingTimes: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 12,
  },
  fastingElapsed: {
    fontFamily: fonts.monoSemibold,
    fontSize: 30,
    color: tokens.ink,
    letterSpacing: -0.9,
    lineHeight: 36,
  },
  fastingElapsedSeconds: {
    fontFamily: fonts.mono,
    fontSize: 15,
    color: tokens.ink4,
  },
  fastingElapsedLabel: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink3,
  },
  // Phase bar
  phaseRow: {
    position: 'relative',
    flexDirection: 'row',
    height: 22,
    gap: 2,
  },
  nowMarker: {
    position: 'absolute',
    top: -3,
    bottom: -3,
    width: 2,
    marginLeft: -1, // offset to center the 2px marker on its left coordinate
    backgroundColor: tokens.accentInk,
    borderRadius: 1,
    shadowColor: tokens.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 1,
  },
  phaseLabels: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 6,
    // Match phaseRow's gap so each label sits over its own segment.
    gap: 2,
  },

  // Macros
  macrosCard: {
    paddingTop: 14,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderRadius: 16,
  },
  macrosHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 10,
  },
  macrosKcal: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink3,
  },
  macrosKcalStrong: {
    color: tokens.ink,
    fontFamily: fonts.monoMedium,
  },
  macrosBar: {
    flexDirection: 'row',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: tokens.bg2,
  },
  macrosGrid: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  macroCell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  macroValue: {
    fontFamily: fonts.monoMedium,
    fontSize: 12,
    color: tokens.ink,
  },
  macrosFooter: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: tokens.line,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  deficitLabel: {
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 1.92,
  },
  deficitValue: {
    fontFamily: fonts.monoSemibold,
    fontSize: 13,
    // Was a hardcoded green for "good" — switched to the palette's `cool`
    // teal so it reads positive without fighting the Mist · Petrol scheme.
    color: tokens.cool,
  },
  tdeeValue: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink3,
  },
});
