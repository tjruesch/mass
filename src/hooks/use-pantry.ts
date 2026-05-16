/**
 * Reactive pantry state.
 *
 * Two hooks:
 *   - `usePantryItems()`         — full alphabetical library; powers the
 *                                  pantry screen + the new-meal composer's
 *                                  ingredient picker.
 *   - `useRecentPantryItems(n)`  — items recently referenced by a
 *                                  meal_items row, ordered by `lastUsedAt`.
 *                                  Powers the meal-log drawer's recents.
 *
 * Both are live via `useLiveQuery` so an insert / edit anywhere in the
 * app refreshes the consuming screen without manual invalidation.
 */

import { asc, desc, isNotNull } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/src/db';
import { pantryItems, type PantryItem } from '@/src/db/schema';

export function usePantryItems(): ReadonlyArray<PantryItem> {
  const { data } = useLiveQuery(
    db.select().from(pantryItems).orderBy(asc(pantryItems.name)),
  );
  return data ?? [];
}

export function useRecentPantryItems(limit: number = 6): ReadonlyArray<PantryItem> {
  const { data } = useLiveQuery(
    db
      .select()
      .from(pantryItems)
      .where(isNotNull(pantryItems.lastUsedAt))
      .orderBy(desc(pantryItems.lastUsedAt))
      .limit(limit),
  );
  return data ?? [];
}
