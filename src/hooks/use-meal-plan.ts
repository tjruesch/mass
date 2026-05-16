/**
 * Reactive meal plan (#95).
 *
 *   - `useWeekPlan()` — returns a 7×4 index of the current week's
 *     plan entries joined to their library meal row. `/meals` reads
 *     this to render ghost cards; `/meals-plan` reads it to render
 *     the editor.
 *   - `usePlanEntryForSlot(date, slot)` — single lookup the meal log
 *     drawer uses for its prefill-from-plan path.
 */

import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/src/db';
import { mealPlan, meals, type Meal, type MealPlanEntry } from '@/src/db/schema';
import { useNow } from '@/src/lib/use-now';
import {
  addDays,
  dowMondayFirst,
  startOfDay,
  ymd,
} from '@/src/lib/time';

import type { MealSlot } from './use-meals';

export type WeekPlanEntry = {
  readonly entry: MealPlanEntry;
  readonly meal: Meal;
};

export type WeekPlanState = {
  /** Monday-of-current-week at local midnight. */
  readonly weekStart: Date;
  /** Index 0 = Monday … 6 = Sunday. Each day maps slot → entry+meal. */
  readonly bySlot: ReadonlyArray<
    Partial<Record<MealSlot, WeekPlanEntry>>
  >;
  /** How many populated (day, slot) cells exist this week. */
  readonly count: number;
};

export function useWeekPlan(): WeekPlanState {
  // Re-tick once a minute so crossing midnight migrates the index
  // without a manual refresh. Matches use-meals.
  const now = useNow(60_000);
  const todayStart = startOfDay(now);
  const todayDow = dowMondayFirst(now);
  const weekStart = addDays(todayStart, -todayDow);
  const weekEnd = addDays(weekStart, 6); // inclusive end

  const weekStartKey = ymd(weekStart);
  const weekEndKey = ymd(weekEnd);

  const { data: planRows } = useLiveQuery(
    db
      .select()
      .from(mealPlan)
      .where(
        and(
          gte(mealPlan.dateKey, weekStartKey),
          lte(mealPlan.dateKey, weekEndKey),
        ),
      ),
  );

  // Library meals (eatenAt = null). We join client-side because the
  // small library + week-bounded plan rows make this trivial, and it
  // sidesteps drizzle's expo-sqlite live-query join restrictions.
  const { data: libraryRows } = useLiveQuery(
    db
      .select()
      .from(meals)
      .where(isNull(meals.eatenAt))
      .orderBy(asc(meals.id)),
  );

  return useMemo<WeekPlanState>(() => {
    const byId = new Map<number, Meal>();
    for (const m of libraryRows ?? []) byId.set(m.id, m);

    const bySlot: Partial<Record<MealSlot, WeekPlanEntry>>[] = Array.from(
      { length: 7 },
      () => ({}),
    );
    let count = 0;

    for (const entry of planRows ?? []) {
      const meal = byId.get(entry.mealId);
      if (!meal) continue; // referenced library meal vanished
      // Resolve dow from the entry's dateKey via the week-start offset.
      // dateKey is 'YYYY-MM-DD'; compute days-since-monday.
      const offset = daysBetween(weekStartKey, entry.dateKey);
      if (offset < 0 || offset > 6) continue;
      const slot = entry.slot as MealSlot;
      if (!isMealSlot(slot)) continue;
      bySlot[offset][slot] = { entry, meal };
      count++;
    }
    return { weekStart, bySlot, count };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planRows, libraryRows, weekStartKey, weekEndKey]);
}

export function usePlanEntryForSlot(
  date: Date | null,
  slot: MealSlot | null,
): WeekPlanEntry | null {
  const dateKey = date ? ymd(date) : null;
  const { data: planRows } = useLiveQuery(
    db
      .select()
      .from(mealPlan)
      .where(
        dateKey && slot
          ? and(eq(mealPlan.dateKey, dateKey), eq(mealPlan.slot, slot))
          : // No-match predicate when we have no date/slot to look up.
            eq(mealPlan.id, -1),
      )
      .limit(1),
  );
  const { data: libraryRows } = useLiveQuery(
    db.select().from(meals).where(isNull(meals.eatenAt)),
  );

  return useMemo(() => {
    const entry = planRows?.[0];
    if (!entry) return null;
    const meal = (libraryRows ?? []).find((m) => m.id === entry.mealId);
    if (!meal) return null;
    return { entry, meal };
  }, [planRows, libraryRows]);
}

// ─── helpers ──────────────────────────────────────────────────────────────
function isMealSlot(s: string): s is MealSlot {
  return s === 'breakfast' || s === 'lunch' || s === 'dinner' || s === 'snack';
}

/** Difference in calendar days between two 'YYYY-MM-DD' strings,
 *  parsed as local midnight. Negative when `b` is before `a`. */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  const aDate = new Date(ay, am - 1, ad);
  const bDate = new Date(by, bm - 1, bd);
  return Math.round(
    (bDate.getTime() - aDate.getTime()) / 86_400_000,
  );
}
