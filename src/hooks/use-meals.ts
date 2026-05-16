/**
 * Reactive meal state.
 *
 *   - `useRecentMeals(n)`  — recent *logged* meals, desc by eatenAt.
 *   - `useTodayMeals()`    — today's meals + aggregate macros + per-slot
 *                            index. The slot is inferred from `eatenAt`
 *                            hour-of-day until / unless a `slot` column
 *                            lands on the schema.
 *   - `useLibraryMeals()`  — reusable templates (eatenAt = null). Fed
 *                            into the meal-log drawer's library picker
 *                            and the new-meal composer's edit path.
 *
 * Each hook is live via `useLiveQuery` so logging a meal refreshes the
 * home kcal ring + the /meals screen + the streak heatmap-in-future
 * automatically.
 */

import { and, asc, desc, gte, isNotNull, isNull, lt } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/src/db';
import { meals, type Meal } from '@/src/db/schema';
import { useNow } from '@/src/lib/use-now';
import { addDays, dowMondayFirst, startOfDay } from '@/src/lib/time';

/** Slot buckets used by the per-slot index. Time windows are inclusive
 *  on the start and exclusive on the end. The order matches what's
 *  rendered top-to-bottom on /meals. */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEAL_SLOTS: ReadonlyArray<MealSlot> = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
];

/**
 * Map an hour-of-day (0-23) to a meal slot. Snack is the fallback for
 * anything outside the three main windows (e.g. a 3pm coffee + cookie
 * lands in snack; an 11pm protein shake too). When a per-meal `slot`
 * column lands on the schema this becomes a column read.
 */
export function slotForHour(hour: number): MealSlot {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}

export type TodayMealsState = {
  /** All of today's logged meals, desc by `eatenAt`. */
  readonly meals: ReadonlyArray<Meal>;
  /** Indexed by inferred slot. May be empty arrays. */
  readonly bySlot: Record<MealSlot, ReadonlyArray<Meal>>;
  /** Aggregate macros across today's meals. Skipped meal-level nulls
   *  contribute 0 — the macro card on home shows what we have, not
   *  blocks on incomplete data. */
  readonly totalKcal: number;
  readonly totalProteinG: number;
  readonly totalCarbsG: number;
  readonly totalFatG: number;
  /** When the most recent meal was logged today, or null if none. */
  readonly lastEatenAt: Date | null;
};

export function useTodayMeals(): TodayMealsState {
  const dayStart = startOfDay(new Date());
  const dayEnd = addDays(dayStart, 1);
  // 60s tick so the slot index re-buckets if the user keeps the page
  // open past a slot boundary (e.g. logging 11am breakfast then a
  // 12pm coffee — both appear in the same slot list otherwise).
  const _now = useNow(60_000);

  const { data } = useLiveQuery(
    db
      .select()
      .from(meals)
      .where(
        and(
          isNotNull(meals.eatenAt),
          gte(meals.eatenAt, dayStart),
          lt(meals.eatenAt, dayEnd),
        ),
      ),
  );

  return useMemo<TodayMealsState>(() => {
    const today = (data ?? []).slice().sort((a, b) => {
      const at = a.eatenAt?.getTime() ?? 0;
      const bt = b.eatenAt?.getTime() ?? 0;
      return bt - at;
    });
    const bySlot: Record<MealSlot, Meal[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    let totalKcal = 0;
    let totalP = 0;
    let totalC = 0;
    let totalF = 0;
    for (const m of today) {
      const hour = m.eatenAt?.getHours() ?? 12;
      bySlot[slotForHour(hour)].push(m);
      totalKcal += m.kcal ?? 0;
      totalP += m.proteinG ?? 0;
      totalC += m.carbsG ?? 0;
      totalF += m.fatG ?? 0;
    }
    return {
      meals: today,
      bySlot,
      totalKcal,
      totalProteinG: totalP,
      totalCarbsG: totalC,
      totalFatG: totalF,
      lastEatenAt: today[0]?.eatenAt ?? null,
    };
    // _now is intentionally a dependency so the slot index recomputes
    // hourly even if the underlying meals data didn't change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, _now]);
}

export function useRecentMeals(limit: number = 8): ReadonlyArray<Meal> {
  const { data } = useLiveQuery(
    db
      .select()
      .from(meals)
      .where(isNotNull(meals.eatenAt))
      .orderBy(desc(meals.eatenAt))
      .limit(limit),
  );
  return data ?? [];
}

export type DayMeals = {
  readonly date: Date;
  readonly meals: ReadonlyArray<Meal>;
  readonly bySlot: Record<MealSlot, ReadonlyArray<Meal>>;
  readonly totalKcal: number;
};

export type WeekMealsState = {
  /** Monday-of-current-week at local midnight. */
  readonly weekStart: Date;
  /** Index 0 = Monday, 6 = Sunday. Each bucket holds that calendar day's
   *  *logged* meals (eatenAt is non-null and falls inside the day). */
  readonly days: ReadonlyArray<DayMeals>;
  /** Total kcal across the entire week so far (sum of `days[i].totalKcal`). */
  readonly weekKcal: number;
  /** How many slot positions across the week have at least one logged meal. */
  readonly plannedCount: number;
  /** Days with at least one logged meal — used for the μ kcal/day strip stat. */
  readonly daysWithMeals: number;
};

export function useThisWeekMeals(): WeekMealsState {
  // Re-tick once a minute so a meal logged near midnight migrates buckets
  // without the user needing to refresh. Same cadence as `useTodayMeals`.
  const now = useNow(60_000);
  const todayStart = startOfDay(now);
  const todayDow = dowMondayFirst(now);
  const weekStart = addDays(todayStart, -todayDow);
  const weekEnd = addDays(weekStart, 7);

  const { data } = useLiveQuery(
    db
      .select()
      .from(meals)
      .where(
        and(
          isNotNull(meals.eatenAt),
          gte(meals.eatenAt, weekStart),
          lt(meals.eatenAt, weekEnd),
        ),
      ),
  );

  // Hot path memo. `weekStart.getTime()` is stable across a single calendar
  // week so the bucketing only re-runs when meals change or we cross a day.
  const weekStartKey = weekStart.getTime();
  return useMemo<WeekMealsState>(() => {
    const days: DayMeals[] = [];
    let weekKcal = 0;
    let plannedCount = 0;
    let daysWithMeals = 0;
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const dayEnd = addDays(date, 1);
      const dayMeals = (data ?? []).filter((m) => {
        const t = m.eatenAt;
        return t != null && t >= date && t < dayEnd;
      });
      const bySlot: Record<MealSlot, Meal[]> = {
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: [],
      };
      let totalKcal = 0;
      for (const m of dayMeals) {
        const hour = m.eatenAt?.getHours() ?? 12;
        bySlot[slotForHour(hour)].push(m);
        totalKcal += m.kcal ?? 0;
      }
      // plannedCount counts populated slot-positions, mirroring the
      // designs/screen-meals-week.jsx semantics (one entry per slot).
      for (const slot of MEAL_SLOTS) {
        if (bySlot[slot].length > 0) plannedCount++;
      }
      if (dayMeals.length > 0) daysWithMeals++;
      weekKcal += totalKcal;
      days.push({ date, meals: dayMeals, bySlot, totalKcal });
    }
    return { weekStart, days, weekKcal, plannedCount, daysWithMeals };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, weekStartKey]);
}

/**
 * Returns the past N days' kcal totals (oldest first, including
 * today). Used by /meals hero 7d deficit chart (#92) — keeps the
 * existing `useThisWeekMeals` semantics intact, which is calendar-week
 * scoped rather than rolling-window scoped.
 */
export function useLastNDaysKcal(
  n: number = 7,
): ReadonlyArray<{ readonly date: Date; readonly kcal: number }> {
  const now = useNow(60_000);
  const todayStart = startOfDay(now);
  const windowStart = addDays(todayStart, -(n - 1));
  const windowEnd = addDays(todayStart, 1);

  const { data } = useLiveQuery(
    db
      .select()
      .from(meals)
      .where(
        and(
          isNotNull(meals.eatenAt),
          gte(meals.eatenAt, windowStart),
          lt(meals.eatenAt, windowEnd),
        ),
      ),
  );

  const todayKey = todayStart.getTime();
  return useMemo(() => {
    const out: { date: Date; kcal: number }[] = [];
    for (let i = 0; i < n; i++) {
      const date = addDays(windowStart, i);
      const dayEnd = addDays(date, 1);
      let kcal = 0;
      for (const m of data ?? []) {
        const t = m.eatenAt;
        if (t != null && t >= date && t < dayEnd) {
          kcal += m.kcal ?? 0;
        }
      }
      out.push({ date, kcal });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, todayKey, n]);
}

export function useLibraryMeals(): ReadonlyArray<Meal> {
  const { data } = useLiveQuery(
    db
      .select()
      .from(meals)
      .where(isNull(meals.eatenAt))
      .orderBy(asc(meals.name)),
  );
  return data ?? [];
}
