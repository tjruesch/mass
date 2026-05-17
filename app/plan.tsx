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

import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { TabBar } from '@/components/design';
import { useWeekPlan } from '@/src/hooks/use-meal-plan';
import { useWeekStockNeed } from '@/src/hooks/use-week-stock-need';
import { useWorkoutPreferences } from '@/src/hooks/use-workout-preferences';
import { useWorkoutsThisWeek } from '@/src/hooks/use-workouts';
import { dowMondayFirst, startOfDay } from '@/src/lib/time';
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

export default function PlanScreen() {
  const now = useNow(60_000);
  const workoutPrefs = useWorkoutPreferences();
  const workoutsThisWeek = useWorkoutsThisWeek();
  const mealPlan = useWeekPlan();
  const stockNeed = useWeekStockNeed();

  const workoutStats = useMemo(() => {
    const types = workoutPrefs
      ? [
          workoutPrefs.monType,
          workoutPrefs.tueType,
          workoutPrefs.wedType,
          workoutPrefs.thuType,
          workoutPrefs.friType,
          workoutPrefs.satType,
          workoutPrefs.sunType,
        ]
      : [];
    const planned = types.filter((t) => t !== null && t !== '').length;
    // Done = unique calendar-day count this week that has at least
    // one workout entry. Two workouts on the same day still count as
    // one "session done" against the weekly template.
    const today = startOfDay(now);
    const monday = new Date(today);
    monday.setDate(today.getDate() - dowMondayFirst(today));
    const doneDays = new Set<number>();
    for (const w of workoutsThisWeek) {
      doneDays.add(startOfDay(w.startedAt).getTime());
    }
    const done = doneDays.size;
    const toGo = Math.max(0, planned - done);
    return { done, planned, toGo };
  }, [workoutPrefs, workoutsThisWeek, now]);

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

        {/* Placeholder for #103 + #104. */}
        <View style={styles.placeholderOuter}>
          <Text style={[styles.kicker, textStyles.cap]}>coming next</Text>
          <Text style={styles.placeholder}>
            workouts week card · meals week card
          </Text>
        </View>
      </ScrollView>

      <TabBar active="plan" />
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
});
