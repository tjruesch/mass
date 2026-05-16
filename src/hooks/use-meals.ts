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
import { addDays, startOfDay } from '@/src/lib/time';

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
