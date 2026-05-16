/**
 * Weekly pantry demand derived from the meal_plan (#90 part B).
 *
 * For every (date, slot) the user has planned for the current week,
 * we look up the library meal's items and sum their quantities by
 * pantry_item_id. Plans whose slot has already been LOGGED for the
 * day are excluded — once a meal is logged the planned demand is
 * considered satisfied, so the "still need this week" count drops.
 *
 * Returns:
 *   - `needByPantryId`: Map<pantryItemId, qty> aggregating the
 *     remaining required quantities.
 *   - `statusByPantryId`: Map<pantryItemId, StockStatus> combining
 *     the need with each pantry row's currentQty + lowThreshold.
 *   - `missingByMealId`: Map<libraryMealId, pantryItems[]> listing
 *     which ingredients each planned meal is short on. Used by the
 *     /meals slot card warnings and the top-of-page banner.
 */

import { and, eq, gte, isNotNull, isNull, lte } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/src/db';
import {
  mealItems,
  mealPlan,
  meals,
  pantryItems,
  type PantryItem,
} from '@/src/db/schema';
import {
  addDays,
  dowMondayFirst,
  startOfDay,
  ymd,
} from '@/src/lib/time';
import { useNow } from '@/src/lib/use-now';
import { stockStatusFor, type StockStatus } from '@/src/lib/pantry-stock';

import type { MealSlot } from './use-meals';

export type WeekStockNeedState = {
  /** Remaining required qty (sum over planned-but-not-logged meals). */
  readonly needByPantryId: ReadonlyMap<number, number>;
  /** Stock status keyed by pantry id. Includes every pantry row. */
  readonly statusByPantryId: ReadonlyMap<number, StockStatus>;
  /** Per-library-meal list of items that are currently `out` or `short`. */
  readonly missingByMealId: ReadonlyMap<number, ReadonlyArray<PantryItem>>;
  /** How many planned-but-unlogged meals in the week are missing
   *  ingredients. Drives the top-of-/meals warning banner. */
  readonly missingMealCount: number;
};

export function useWeekStockNeed(): WeekStockNeedState {
  // Same cadence as the other week-level hooks — re-tick once a
  // minute so day-crossings flow through without a manual refresh.
  const now = useNow(60_000);
  const todayStart = startOfDay(now);
  const todayDow = dowMondayFirst(now);
  const weekStart = addDays(todayStart, -todayDow);
  const weekEnd = addDays(weekStart, 6);
  const weekStartKey = ymd(weekStart);
  const weekEndKey = ymd(weekEnd);

  // 1. Plan rows for the week.
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

  // 2. Library meal items (parent meal has eatenAt IS NULL). Small
  //    table; client-side aggregation is fine. Join keeps everything
  //    in one live query so plan changes + library edits both trip.
  const { data: itemRows } = useLiveQuery(
    db
      .select({ item: mealItems, parent: meals })
      .from(mealItems)
      .innerJoin(meals, eq(meals.id, mealItems.mealId))
      .where(and(isNull(meals.eatenAt), isNotNull(mealItems.pantryItemId))),
  );

  // 3. All pantry rows so we can build the status map. Live so editor
  //    edits propagate.
  const { data: pantryRows } = useLiveQuery(db.select().from(pantryItems));

  // 4. Logged meals for the week so we can filter out plans whose
  //    slot is already fulfilled. We use eatenAt-bucketing via the
  //    same dateKey scheme to stay aligned with the plan.
  const { data: weekLogged } = useLiveQuery(
    db
      .select()
      .from(meals)
      .where(
        and(
          isNotNull(meals.eatenAt),
          gte(meals.eatenAt, weekStart),
          lte(meals.eatenAt, addDays(weekStart, 7)),
        ),
      ),
  );

  return useMemo<WeekStockNeedState>(() => {
    // Bucket logged meals by (dateKey, slot) so plan filtering can
    // ask "was this slot already eaten today?". Slot inference here
    // mirrors `slotForHour` — kept inline to avoid an import cycle.
    const loggedSlotSet = new Set<string>();
    for (const m of weekLogged ?? []) {
      if (!m.eatenAt) continue;
      const key = `${ymd(m.eatenAt)}::${slotForHour(m.eatenAt.getHours())}`;
      loggedSlotSet.add(key);
    }

    // Group library meal items by mealId.
    const itemsByMealId = new Map<
      number,
      { pantryItemId: number; quantity: number }[]
    >();
    for (const row of itemRows ?? []) {
      const it = row.item;
      if (it.pantryItemId === null) continue;
      const list = itemsByMealId.get(it.mealId) ?? [];
      list.push({ pantryItemId: it.pantryItemId, quantity: it.quantity });
      itemsByMealId.set(it.mealId, list);
    }

    // Sum required qty across planned-but-not-yet-logged plan rows.
    const need = new Map<number, number>();
    for (const plan of planRows ?? []) {
      const key = `${plan.dateKey}::${plan.slot}`;
      if (loggedSlotSet.has(key)) continue;
      const items = itemsByMealId.get(plan.mealId);
      if (!items) continue;
      for (const it of items) {
        need.set(
          it.pantryItemId,
          (need.get(it.pantryItemId) ?? 0) + it.quantity,
        );
      }
    }

    // Build status map for every pantry row.
    const status = new Map<number, StockStatus>();
    const pantryById = new Map<number, PantryItem>();
    for (const row of pantryRows ?? []) {
      pantryById.set(row.id, row);
      status.set(row.id, stockStatusFor(row, need.get(row.id) ?? 0));
    }

    // Per-meal missing list. A meal is missing an item when the item
    // is `out` or `short` against the week's aggregate demand.
    const missingByMeal = new Map<number, PantryItem[]>();
    let missingMealCount = 0;
    for (const plan of planRows ?? []) {
      const key = `${plan.dateKey}::${plan.slot}`;
      if (loggedSlotSet.has(key)) continue;
      const items = itemsByMealId.get(plan.mealId);
      if (!items) continue;
      const missing: PantryItem[] = [];
      for (const it of items) {
        const s = status.get(it.pantryItemId);
        if (s === 'out' || s === 'short') {
          const p = pantryById.get(it.pantryItemId);
          if (p) missing.push(p);
        }
      }
      if (missing.length > 0) {
        missingByMeal.set(plan.mealId, missing);
        missingMealCount++;
      }
    }

    return {
      needByPantryId: need,
      statusByPantryId: status,
      missingByMealId: missingByMeal,
      missingMealCount,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planRows, itemRows, pantryRows, weekLogged, weekStartKey, weekEndKey]);
}

// Inlined to avoid importing from use-meals (which already imports
// from this layer indirectly). Kept in sync with `slotForHour` over
// there — touch both when the windows change.
function slotForHour(hour: number): MealSlot {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 15) return 'lunch';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'snack';
}
