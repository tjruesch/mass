/**
 * Pantry-item CRUD. Pantry items are the food library — reusable
 * macro references that meal_items can link to. Items themselves have
 * no notion of stock on hand (yet — see deferred issue #90); they're
 * just nutrition templates indexed by name.
 *
 * `lastUsedAt` is bumped each time a meal_items row references the
 * item so the meal-log drawer's library picker can show "recently
 * used" first.
 */

import { desc, eq, isNotNull, like, or } from 'drizzle-orm';

import { db, type DbClient } from '@/src/db';
import {
  pantryItems,
  type NewPantryItem,
  type PantryItem,
} from '@/src/db/schema';
import { inferFoodMacros } from '@/src/lib/food-llm';

export async function addPantryItem(
  opts: Omit<NewPantryItem, 'id' | 'createdAt' | 'lastUsedAt'>,
): Promise<PantryItem> {
  if (opts.name.trim() === '') {
    throw new Error('Pantry item name is required.');
  }
  if (!Number.isFinite(opts.kcalPerServing) || opts.kcalPerServing < 0) {
    throw new Error('kcalPerServing must be a non-negative number.');
  }
  const [row] = await db
    .insert(pantryItems)
    .values({
      ...opts,
      name: opts.name.trim(),
    })
    .returning();
  return row;
}

export async function updatePantryItem(
  id: number,
  patch: Partial<Omit<NewPantryItem, 'id' | 'createdAt'>>,
): Promise<PantryItem | null> {
  if (patch.name !== undefined && patch.name.trim() === '') {
    throw new Error('Pantry item name cannot be empty.');
  }
  if (
    patch.kcalPerServing !== undefined &&
    (!Number.isFinite(patch.kcalPerServing) || patch.kcalPerServing < 0)
  ) {
    throw new Error('kcalPerServing must be a non-negative number.');
  }
  const cleaned = patch.name !== undefined ? { ...patch, name: patch.name.trim() } : patch;
  const [row] = await db
    .update(pantryItems)
    .set(cleaned)
    .where(eq(pantryItems.id, id))
    .returning();
  return row ?? null;
}

export async function deletePantryItem(id: number): Promise<void> {
  // ON DELETE SET NULL on meal_items.pantry_item_id handles dangling
  // references — the meal_item keeps its copied macros + reverts to a
  // free-text reference.
  await db.delete(pantryItems).where(eq(pantryItems.id, id));
}

export async function listPantryItems(): Promise<PantryItem[]> {
  // Alphabetical by name — the library screen renders in this order;
  // search refines it client-side.
  return db.select().from(pantryItems).orderBy(pantryItems.name);
}

export async function listRecentPantryItems(limit: number = 6): Promise<PantryItem[]> {
  // Recently-used items only — those that have at least one meal_item
  // referencing them. New items show up here once they've been used.
  return db
    .select()
    .from(pantryItems)
    .where(isNotNull(pantryItems.lastUsedAt))
    .orderBy(desc(pantryItems.lastUsedAt))
    .limit(limit);
}

export async function searchPantryItems(query: string): Promise<PantryItem[]> {
  const q = query.trim();
  if (q === '') return listPantryItems();
  const needle = `%${q}%`;
  return db
    .select()
    .from(pantryItems)
    .where(or(like(pantryItems.name, needle), like(pantryItems.brand, needle)))
    .orderBy(pantryItems.name);
}

export async function getPantryItemById(
  id: number,
  client: DbClient = db,
): Promise<PantryItem | null> {
  const rows = await client.select().from(pantryItems).where(eq(pantryItems.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Create a pantry item from just a name, then kick off the LLM
 * autofill in the background. The item is inserted immediately with
 * placeholder macros so the caller (e.g. new-meal composer) can wire
 * it into the UI right away; the macros populate a moment later when
 * the Claude call lands, and `useLiveQuery` propagates the change.
 *
 * Falls back gracefully when the LLM is disabled or the call fails —
 * the item just stays with zeroed macros, which the user can fix on
 * the pantry editor.
 */
export async function addPantryItemFromName(
  rawName: string,
): Promise<PantryItem> {
  const name = rawName.trim();
  if (name === '') throw new Error('Pantry item name is required.');

  const item = await addPantryItem({
    name,
    brand: null,
    defaultServingQty: 100,
    defaultServingUnit: 'g',
    kcalPerServing: 0,
    proteinG: 0,
    carbsG: 0,
    fatG: 0,
    category: 'pantry',
    currentQty: null,
    stockUnit: null,
    lowThreshold: null,
    restockedAt: null,
  });

  // Fire-and-forget. Errors land in the dev console; the row stays at
  // 0-macros until the user edits it manually.
  inferFoodMacros(name)
    .then((inferred) => {
      if (inferred === null) return;
      return updatePantryItem(item.id, {
        kcalPerServing: inferred.kcal,
        proteinG: inferred.proteinG,
        carbsG: inferred.carbsG,
        fatG: inferred.fatG,
        category: inferred.category,
      });
    })
    .catch((err) => {
      console.warn('[pantry] LLM autofill failed:', err);
    });

  return item;
}

/**
 * Bump `lastUsedAt` to now for the given pantry items. Used by the
 * meals write path so recently-referenced items float to the top of
 * the library picker. Idempotent — safe to call with an empty array.
 */
export async function touchPantryItemsLastUsed(
  ids: ReadonlyArray<number>,
  client: DbClient = db,
): Promise<void> {
  if (ids.length === 0) return;
  const now = new Date();
  for (const id of ids) {
    await client
      .update(pantryItems)
      .set({ lastUsedAt: now })
      .where(eq(pantryItems.id, id));
  }
}

