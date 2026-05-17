/**
 * Plan — forward-looking hub (Slice 9, #102).
 *
 * v1 scaffold + "this week" stats strip. Workouts week card (#103)
 * and meals week card (#104) land on top of this. The screen is a
 * top-level tab destination, so it carries a custom dateline + h1
 * header and the TabBar.
 *
 * Stats strip pulls counts from existing hooks — no new aggregation
 * code:
 *   - workouts: useWorkoutPreferences template + useWorkoutsThisWeek.
 *   - meals: useWeekPlan + useWeekStockNeed (missing meal count).
 *   - pantry: useWeekStockNeed (out + short + low items).
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Glyph, TabBar } from '@/components/design';
import {
  WorkoutGlyph,
  toneColor,
} from '@/components/design/plan-day-drawer';
import {
  totalPlannedMinutes,
  type WorkoutTypeDef,
} from '@/src/db/queries/workout-types';
import type { WorkoutPreferences } from '@/src/db/schema';
import { useWeekPlan } from '@/src/hooks/use-meal-plan';
import { useWeekStockNeed } from '@/src/hooks/use-week-stock-need';
import { useWorkoutPreferences } from '@/src/hooks/use-workout-preferences';
import { useWorkoutTypes } from '@/src/hooks/use-workout-types';
import { useWorkoutsThisWeek } from '@/src/hooks/use-workouts';
import {
  addDays,
  dowMondayFirst,
  formatMinutes,
  startOfDay,
} from '@/src/lib/time';
import { useNow } from '@/src/lib/use-now';
import { fonts, textStyles, tokens } from '@/theme/tokens';

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

const DOW_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

type DayCellState = 'done' | 'today' | 'planned' | 'rest';
type TemplateSlot = {
  readonly dow: number;
  readonly type: string | null;
  readonly timeMin: number | null;
  readonly hasLoggedWorkout: boolean;
};

export default function PlanScreen() {
  const router = useRouter();
  const now = useNow(60_000);
  const workoutPrefs = useWorkoutPreferences();
  const workoutsThisWeek = useWorkoutsThisWeek();
  const workoutTypes = useWorkoutTypes();
  const mealPlan = useWeekPlan();
  const stockNeed = useWeekStockNeed();

  const todayDow = dowMondayFirst(now);

  // Build the 7-slot template + per-day "has workout logged this
  // week" flag. The day cells and stats strip both read from here.
  const templateByDow = useMemo<ReadonlyArray<TemplateSlot>>(() => {
    if (workoutPrefs === null) return [];
    const types: ReadonlyArray<string | null> = [
      workoutPrefs.monType,
      workoutPrefs.tueType,
      workoutPrefs.wedType,
      workoutPrefs.thuType,
      workoutPrefs.friType,
      workoutPrefs.satType,
      workoutPrefs.sunType,
    ];
    const times: ReadonlyArray<number | null> = [
      workoutPrefs.monTimeMin,
      workoutPrefs.tueTimeMin,
      workoutPrefs.wedTimeMin,
      workoutPrefs.thuTimeMin,
      workoutPrefs.friTimeMin,
      workoutPrefs.satTimeMin,
      workoutPrefs.sunTimeMin,
    ];
    // Workouts logged per-dow this week — same Mon-first index.
    const todayStart = startOfDay(now);
    const monday = addDays(todayStart, -todayDow);
    const loggedByDow = new Set<number>();
    for (const w of workoutsThisWeek) {
      const dayMs = startOfDay(w.startedAt).getTime();
      const offset = Math.round((dayMs - monday.getTime()) / 86_400_000);
      if (offset >= 0 && offset < 7) loggedByDow.add(offset);
    }
    return types.map((t, i) => ({
      dow: i,
      type: t,
      timeMin: times[i],
      hasLoggedWorkout: loggedByDow.has(i),
    }));
  }, [workoutPrefs, workoutsThisWeek, now, todayDow]);

  const typesByKey = useMemo(() => {
    const map = new Map<string, WorkoutTypeDef>();
    for (const t of workoutTypes) map.set(t.key, t);
    return map;
  }, [workoutTypes]);

  const next = useMemo(
    () => findNextWorkout(templateByDow, todayDow),
    [templateByDow, todayDow],
  );

  const workoutStats = useMemo(() => {
    const planned = templateByDow.filter(
      (s) => s.type !== null && s.type !== '',
    ).length;
    const done = templateByDow.filter((s) => s.hasLoggedWorkout).length;
    const toGo = Math.max(0, planned - done);
    return { done, planned, toGo };
  }, [templateByDow]);

  const pantryStats = useMemo(() => {
    let out = 0;
    let short = 0;
    let low = 0;
    for (const status of stockNeed.statusByPantryId.values()) {
      if (status === 'out') out++;
      else if (status === 'short') short++;
      else if (status === 'low') low++;
    }
    return { toBuy: out + short + low, urgent: out + short };
  }, [stockNeed]);

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
          <Text style={styles.title}>Plan</Text>
        </View>

        {/* ── This-week stats strip ────────────────────────────────── */}
        <View style={styles.statsOuter}>
          <Text style={[styles.kicker, textStyles.cap]}>this week</Text>
          <View style={styles.statsRow}>
            <StatColumn
              label="workouts"
              count={`${workoutStats.done}/${workoutStats.planned}`}
              sub={
                workoutStats.toGo > 0
                  ? `${workoutStats.toGo} to go`
                  : 'all logged'
              }
              subColor={workoutStats.toGo > 0 ? tokens.ink4 : '#1F7A3A'}
              isFirst
            />
            <StatColumn
              label="meals"
              count={`${mealPlan.count}`}
              sub={
                stockNeed.missingMealCount > 0
                  ? `${stockNeed.missingMealCount} missing`
                  : 'planned'
              }
              subColor={
                stockNeed.missingMealCount > 0 ? tokens.warn : tokens.ink4
              }
            />
            <StatColumn
              label="pantry"
              count={`${pantryStats.toBuy}`}
              sub={
                pantryStats.urgent > 0
                  ? `${pantryStats.urgent} urgent`
                  : 'to buy'
              }
              subColor={
                pantryStats.urgent > 0 ? tokens.warn : tokens.ink4
              }
            />
          </View>
          <View style={styles.divider} />
        </View>

        {/* ── Workouts week card ───────────────────────────────────── */}
        <View style={styles.sectionOuter}>
          <WorkoutHeadline
            next={next}
            type={next ? typesByKey.get(next.type) ?? null : null}
            onSeeAll={() => router.push('/workouts' as never)}
          />
          <View style={styles.weekCard}>
            <View style={styles.weekRow}>
              {templateByDow.map((slot) => (
                <WorkoutDayCell
                  key={slot.dow}
                  slot={slot}
                  state={stateFor(slot, todayDow)}
                  type={
                    slot.type !== null
                      ? typesByKey.get(slot.type) ?? null
                      : null
                  }
                />
              ))}
            </View>
          </View>
        </View>

        {/* Placeholder until #104 fills the meals week card. */}
        <View style={styles.placeholderOuter}>
          <Text style={[styles.kicker, textStyles.cap]}>coming next</Text>
          <Text style={styles.placeholder}>meals week card</Text>
        </View>
      </ScrollView>

      <TabBar active="plan" />
    </View>
  );
}

// ─── Workouts — helpers ────────────────────────────────────────────────────
type NextWorkout = {
  /** 0 = today, 1 = tomorrow, … 6 = 6 days out. */
  readonly dayOffset: number;
  readonly type: string;
  readonly timeMin: number | null;
};

/**
 * Walk forward from today through the weekly template, skipping
 * every consecutive rest day. Wraps within a single 7-day window
 * (Mon-Sun template repeats, so offset is still 0-6).
 */
function findNextWorkout(
  template: ReadonlyArray<TemplateSlot>,
  todayDow: number,
): NextWorkout | null {
  for (let i = 0; i < 7; i++) {
    const slot = template[(todayDow + i) % 7];
    if (slot.type !== null && slot.type !== '') {
      return { dayOffset: i, type: slot.type, timeMin: slot.timeMin };
    }
  }
  return null;
}

function stateFor(slot: TemplateSlot, todayDow: number): DayCellState {
  if (slot.type === null) return 'rest';
  if (slot.dow === todayDow) return 'today';
  if (slot.dow < todayDow) return 'done';
  return 'planned';
}

function dayRelativeLabel(offset: number): string {
  if (offset === 0) return 'today';
  if (offset === 1) return 'tomorrow';
  return `in ${offset}d`;
}

// ─── Workouts — sub-components ─────────────────────────────────────────────
function WorkoutHeadline({
  next,
  type,
  onSeeAll,
}: {
  next: NextWorkout | null;
  type: WorkoutTypeDef | null;
  onSeeAll: () => void;
}) {
  const label = type?.label ?? '—';
  const colour = type ? toneColor(type.tone) : tokens.ink4;
  const minutes = type ? totalPlannedMinutes(type) : 0;
  const time =
    next && next.timeMin !== null ? formatMinutes(next.timeMin) : null;

  return (
    <View style={styles.headlineRow}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.kicker, textStyles.cap, styles.headlineKicker]}>
          workouts
        </Text>
        {next === null ? (
          <Text style={styles.headlineEmpty}>
            no sessions in template — edit on /workouts-settings
          </Text>
        ) : (
          <>
            <View style={styles.headlineBigRow}>
              <Text style={[styles.headlineBig, { color: colour }]}>
                {label}
              </Text>
              <Text style={styles.headlineNext}> · next</Text>
            </View>
            <Text style={[styles.headlineMeta, textStyles.tnum]}>
              {time !== null && (
                <Text style={styles.headlineMetaStrong}>{time}</Text>
              )}
              {time !== null && <Text> · </Text>}
              <Text>{dayRelativeLabel(next.dayOffset)}</Text>
              {minutes > 0 && (
                <>
                  <Text> · </Text>
                  <Text style={styles.headlineMetaStrong}>{minutes}m</Text>
                </>
              )}
            </Text>
          </>
        )}
      </View>
      <Pressable
        onPress={onSeeAll}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="See workouts"
        style={({ pressed }) => [
          styles.seeAll,
          pressed && { opacity: 0.55 },
        ]}>
        <Text style={[styles.seeAllText, textStyles.cap]}>see all</Text>
        <Glyph name="chev" color={tokens.accentInk} />
      </Pressable>
    </View>
  );
}

function WorkoutDayCell({
  slot,
  state,
  type,
}: {
  slot: TemplateSlot;
  state: DayCellState;
  type: WorkoutTypeDef | null;
}) {
  const isToday = state === 'today';
  const isDone = state === 'done';
  const isPlanned = state === 'planned';
  const isRest = state === 'rest';

  // Circle palette per state. Mirrors `designs/screen-plan.jsx`.
  let bg: string;
  let glyphColor: string;
  if (isDone) {
    bg = tokens.ink;
    glyphColor = tokens.bg;
  } else if (isToday) {
    bg = tokens.bg;
    glyphColor = tokens.ink;
  } else if (isRest) {
    bg = tokens.bg2;
    glyphColor = tokens.ink4;
  } else {
    bg = tokens.bg2;
    glyphColor = tokens.ink3;
  }

  const time =
    slot.timeMin !== null && !isRest ? formatMinutes(slot.timeMin) : '—';
  const label = isRest ? 'rest' : type?.label ?? '—';
  const dowLabel = DOW_LABELS[slot.dow];

  return (
    <View style={styles.dayCell}>
      <Text
        style={[
          styles.dayDow,
          textStyles.cap,
          isToday && styles.dayDowToday,
        ]}>
        {dowLabel}
      </Text>
      <Text
        style={[
          styles.dayTime,
          textStyles.tnum,
          isToday && styles.dayTimeToday,
          isRest && { fontStyle: 'italic' },
        ]}>
        {time}
      </Text>
      <View
        style={[
          styles.dayCircle,
          { backgroundColor: bg },
          isPlanned && { borderWidth: 1, borderColor: tokens.line },
          isToday && styles.dayCircleToday,
          isPlanned && { opacity: 0.85 },
        ]}>
        <WorkoutGlyph
          icon={type?.icon ?? 'rest'}
          color={glyphColor}
          size={16}
        />
      </View>
      <Text
        style={[
          styles.dayLabel,
          isRest && { fontStyle: 'italic', color: tokens.ink4 },
        ]}
        numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// StatColumn — one of three in the this-week strip. Mirrors trends's
// FeatureColumn layout (label + big mono number + italic sub).
// ─────────────────────────────────────────────────────────────────────────────
function StatColumn({
  label,
  count,
  sub,
  subColor,
  isFirst = false,
}: {
  label: string;
  count: string;
  sub: string;
  subColor?: string;
  isFirst?: boolean;
}) {
  return (
    <View
      style={[
        styles.statCol,
        !isFirst && styles.statColBorder,
        !isFirst && { paddingLeft: 12 },
      ]}>
      <Text style={[styles.statLabel, textStyles.cap]}>{label}</Text>
      <Text style={[styles.statCount, textStyles.tnum]}>{count}</Text>
      <Text style={[styles.statSub, subColor ? { color: subColor } : null]}>
        {sub}
      </Text>
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
  kicker: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
    marginBottom: 12,
  },

  // Stats strip
  statsOuter: {
    paddingTop: 18,
    paddingHorizontal: 22,
  },
  statsRow: {
    flexDirection: 'row',
  },
  statCol: {
    flex: 1,
    gap: 4,
  },
  statColBorder: {
    borderLeftWidth: 1,
    borderLeftColor: tokens.line,
  },
  statLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink3,
    letterSpacing: 1.62,
    textTransform: 'lowercase',
  },
  statCount: {
    marginTop: 2,
    fontFamily: fonts.monoSemibold,
    fontSize: 22,
    color: tokens.ink,
    letterSpacing: -0.77,
    // ~1.2× so digit ascenders don't clip against the label above.
    lineHeight: 28,
  },
  statSub: {
    marginTop: 2,
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },

  divider: {
    height: 1,
    backgroundColor: tokens.line,
    marginTop: 18,
  },

  placeholderOuter: {
    paddingTop: 18,
    paddingHorizontal: 22,
  },
  placeholder: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
    lineHeight: 18,
  },

  // Section frame (used by workouts card + meals card)
  sectionOuter: {
    paddingTop: 20,
    paddingHorizontal: 22,
  },

  // Headline (shared shape; #104 will reuse)
  headlineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 10,
    gap: 12,
  },
  headlineKicker: {
    marginBottom: 4,
  },
  headlineEmpty: {
    fontFamily: fonts.mono,
    fontSize: 12,
    color: tokens.ink4,
    fontStyle: 'italic',
    letterSpacing: 0.4,
  },
  headlineBigRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  headlineBig: {
    fontFamily: fonts.sansSemibold,
    fontSize: 22,
    color: tokens.ink,
    letterSpacing: -0.55,
    lineHeight: 26,
  },
  headlineNext: {
    fontFamily: fonts.mono,
    fontSize: 13,
    color: tokens.ink4,
  },
  headlineMeta: {
    marginTop: 4,
    fontFamily: fonts.mono,
    fontSize: 11,
    color: tokens.ink4,
    letterSpacing: 0.4,
  },
  headlineMetaStrong: {
    fontFamily: fonts.monoSemibold,
    color: tokens.ink,
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

  // Week card body
  weekCard: {
    backgroundColor: tokens.card,
    borderWidth: 1,
    borderColor: tokens.line,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowRadius: 24,
    shadowOpacity: 0.04,
  },
  weekRow: {
    flexDirection: 'row',
    gap: 2,
  },

  // Workout day cell
  dayCell: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  dayDow: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 1.98,
  },
  dayDowToday: {
    fontFamily: fonts.monoSemibold,
    color: tokens.ink,
  },
  dayTime: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink4,
    letterSpacing: 0.4,
  },
  dayTimeToday: {
    fontFamily: fonts.monoSemibold,
    color: tokens.ink,
  },
  dayCircle: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircleToday: {
    borderWidth: 2,
    borderColor: tokens.ink,
  },
  dayLabel: {
    fontFamily: fonts.mono,
    fontSize: 9,
    color: tokens.ink3,
    letterSpacing: 0.4,
    maxWidth: 50,
    textAlign: 'center',
  },
});
