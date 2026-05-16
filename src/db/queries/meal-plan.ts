/**
 * Weekly meal plan CRUD (#95). Plan entries map (date, slot) → library
 * meal. They live alongside logged meals — saving a logged meal does
 * NOT delete the plan entry; `/meals` decides which to render based
 * on what exists for the slot.
 *
 * Plan entries reference library meals (`meals.eatenAt IS NULL`). The
 * referential integrity here is loose at the API layer — callers
 * should pass library ids — but the FK has `ON DELETE CASCADE` so a
 * library meal getting deleted via the composer takes any plan
 * entries that point at it with it.
 */

import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm';

import { db, type DbClient } from '@/src/db';
import {
  mealPlan,
  type MealPlanEntry,
  type NewMealPlanEntry,
} from '@/src/db/schema';
import { ymd } from '@/src/lib/time';

/**
 * Set the plan entry for (date, slot). UPSERT semantics — replaces any
 * existing entry for that day/slot. Returns the resulting row.
 */
export async function setPlanEntry(opts: {
  date: Date;
  slot: string;
  mealId: number;
}): Promise<MealPlanEntry> {
  const dateKey = ymd(opts.date);
  // SQLite's INSERT OR REPLACE would also work, but we want to keep
  // `createdAt` stable on update so the existing-row path goes through
  // an explicit update.
  const existing = await db
    .select()
    .from(mealPlan)
    .where(and(eq(mealPlan.dateKey, dateKey), eq(mealPlan.slot, opts.slot)))
    .limit(1);
  if (existing[0]) {
    const [row] = await db
      .update(mealPlan)
      .set({ mealId: opts.mealId })
      .where(eq(mealPlan.id, existing[0].id))
      .returning();
    return row;
  }
  const [row] = await db
    .insert(mealPlan)
    .values({ dateKey, slot: opts.slot, mealId: opts.mealId })
    .returning();
  return row;
}

export async function removePlanEntry(id: number): Promise<void> {
  await db.delete(mealPlan).where(eq(mealPlan.id, id));
}

export async function removePlanEntryFor(
  date: Date,
  slot: string,
): Promise<void> {
  const dateKey = ymd(date);
  await db
    .delete(mealPlan)
    .where(and(eq(mealPlan.dateKey, dateKey), eq(mealPlan.slot, slot)));
}

export async function getPlanEntry(
  date: Date,
  slot: string,
  client: DbClient = db,
): Promise<MealPlanEntry | null> {
  const dateKey = ymd(date);
  const rows = await client
    .select()
    .from(mealPlan)
    .where(and(eq(mealPlan.dateKey, dateKey), eq(mealPlan.slot, slot)))
    .limit(1);
  return rows[0] ?? null;
}

/** Plan entries between two calendar days inclusive. */
export async function listPlanEntriesInRange(
  start: Date,
  end: Date,
  client: DbClient = db,
): Promise<MealPlanEntry[]> {
  return client
    .select()
    .from(mealPlan)
    .where(
      and(
        gte(mealPlan.dateKey, ymd(start)),
        lte(mealPlan.dateKey, ymd(end)),
      ),
    )
    .orderBy(asc(mealPlan.dateKey), asc(mealPlan.slot));
}

/** Bulk remove — handy when a library meal disappears (the FK
 *  cascades automatically, but this lets the UI surface a confirm
 *  without waiting on a referential side effect). */
export async function removePlanEntriesForMeal(mealId: number): Promise<void> {
  await db.delete(mealPlan).where(eq(mealPlan.mealId, mealId));
}

// Re-export for callers that want to bulk-resolve mealIds. Not
// strictly needed by the plan slice — kept here so the import surface
// is concentrated.
export type PlanWriter = (opts: NewMealPlanEntry) => Promise<MealPlanEntry>;
export const _planUtilsInArray = inArray;
