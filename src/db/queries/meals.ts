/**
 * Meal + meal-item CRUD. A meal is the parent row; its meal_items
 * carry per-ingredient nutrition (copied at write time so a later
 * pantry-item edit doesn't retroactively change a logged meal).
 *
 * Writes happen in a single transaction (parent + N children) so a
 * partial failure can't leave orphaned meal_items rows. Mirrors the
 * pattern from `src/db/queries/workout-types.ts` (workout_types +
 * workout_type_steps).
 */

import { and, asc, desc, eq, gte, isNotNull, isNull, lt } from 'drizzle-orm';

import { db, type DbClient } from '@/src/db';
import {
  meals,
  mealItems,
  type Meal,
  type MealItem,
  type NewMeal,
  type NewMealItem,
} from '@/src/db/schema';
import { addDays, startOfDay } from '@/src/lib/time';

import { touchPantryItemsLastUsed } from './pantry';

/**
 * Shape callers pass for each meal_items row when writing. Fields
 * mirror the schema with `mealId` and `createdAt` omitted (the
 * transaction fills them in).
 */
export type MealItemInput = Omit<NewMealItem, 'id' | 'mealId' | 'createdAt'>;

/**
 * A meal joined with its items. Returned from `getMealById` + the
 * list helpers that need per-item drilling (e.g. the edit composer).
 */
export type MealWithItems = {
  readonly meal: Meal;
  readonly items: ReadonlyArray<MealItem>;
};

/**
 * Add a meal + its items in one transaction. Returns the new meal's
 * id. Also bumps `lastUsedAt` on any referenced pantry items so the
 * library picker's "recents" stays accurate.
 */
export async function addMeal(
  meal: Omit<NewMeal, 'id' | 'createdAt'>,
  items: ReadonlyArray<MealItemInput> = [],
): Promise<number> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(meals)
      .values(meal)
      .returning({ id: meals.id });
    if (items.length > 0) {
      await tx.insert(mealItems).values(
        items.map((it) => ({
          mealId: row.id,
          pantryItemId: it.pantryItemId ?? null,
          freeText: it.freeText ?? null,
          quantity: it.quantity ?? 1,
          unit: it.unit ?? 'serving',
          kcal: it.kcal ?? null,
          proteinG: it.proteinG ?? null,
          carbsG: it.carbsG ?? null,
          fatG: it.fatG ?? null,
        })),
      );
      const pantryIds = items
        .map((it) => it.pantryItemId)
        .filter((id): id is number => typeof id === 'number');
      await touchPantryItemsLastUsed(pantryIds, tx);
    }
    return row.id;
  });
}

/**
 * Update only the parent meal row's mutable fields. Items are managed
 * via `replaceMealItems` — kept separate so an "edit name + slot"
 * change doesn't have to diff the items array.
 */
export async function updateMeal(
  id: number,
  patch: Partial<Omit<NewMeal, 'id' | 'createdAt'>>,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await db.update(meals).set(patch).where(eq(meals.id, id));
}

/**
 * Replace the full items list for a meal. Simpler than diffing — the
 * composer's save flow is uncommon enough that full-replace is fine.
 */
export async function replaceMealItems(
  mealId: number,
  items: ReadonlyArray<MealItemInput>,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(mealItems).where(eq(mealItems.mealId, mealId));
    if (items.length > 0) {
      await tx.insert(mealItems).values(
        items.map((it) => ({
          mealId,
          pantryItemId: it.pantryItemId ?? null,
          freeText: it.freeText ?? null,
          quantity: it.quantity ?? 1,
          unit: it.unit ?? 'serving',
          kcal: it.kcal ?? null,
          proteinG: it.proteinG ?? null,
          carbsG: it.carbsG ?? null,
          fatG: it.fatG ?? null,
        })),
      );
      const pantryIds = items
        .map((it) => it.pantryItemId)
        .filter((id): id is number => typeof id === 'number');
      await touchPantryItemsLastUsed(pantryIds, tx);
    }
  });
}

export async function deleteMeal(id: number): Promise<void> {
  // FK ON DELETE CASCADE on meal_items.meal_id wipes children too.
  await db.delete(meals).where(eq(meals.id, id));
}

// ─── List + lookup helpers ──────────────────────────────────────────────────

export async function listMealsInRange(start: Date, end: Date): Promise<Meal[]> {
  return db
    .select()
    .from(meals)
    .where(
      and(
        isNotNull(meals.eatenAt),
        gte(meals.eatenAt, start),
        lt(meals.eatenAt, end),
      ),
    )
    .orderBy(desc(meals.eatenAt));
}

export async function listMealsForDay(d: Date): Promise<Meal[]> {
  const start = startOfDay(d);
  const end = addDays(start, 1);
  return listMealsInRange(start, end);
}

/**
 * Recent *logged* meals — those with a non-null `eatenAt`. Excludes
 * library entries (#87 will introduce nullable-eatenAt library meals).
 */
export async function listRecentMeals(limit: number = 8): Promise<Meal[]> {
  return db
    .select()
    .from(meals)
    .where(isNotNull(meals.eatenAt))
    .orderBy(desc(meals.eatenAt))
    .limit(limit);
}

/**
 * Library meals — those with a null `eatenAt`. Filed under `meals`
 * (not a separate table) so the new-meal composer (#87) and the
 * meal-log drawer (#85) share the same shape. Listed alphabetically.
 */
export async function listLibraryMeals(): Promise<Meal[]> {
  return db
    .select()
    .from(meals)
    .where(isNull(meals.eatenAt))
    .orderBy(asc(meals.name));
}

export async function getMealById(id: number): Promise<MealWithItems | null> {
  const [row] = await db.select().from(meals).where(eq(meals.id, id)).limit(1);
  if (!row) return null;
  const items = await db
    .select()
    .from(mealItems)
    .where(eq(mealItems.mealId, id))
    .orderBy(mealItems.id);
  return { meal: row, items };
}
