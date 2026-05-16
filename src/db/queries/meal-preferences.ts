/**
 * Singleton row at id=1 for meal preferences (#92). Seed on first read
 * so callers can assume it exists, then become a no-op select.
 *
 * Mirrors the fasting/water/weight/workout preference pattern.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/src/db';
import {
  mealPreferences,
  type MealPreferences,
  type NewMealPreferences,
} from '@/src/db/schema';

export async function getPreferences(): Promise<MealPreferences> {
  const rows = await db.select().from(mealPreferences).limit(1);
  if (rows[0]) return rows[0];
  const [seeded] = await db
    .insert(mealPreferences)
    .values({ id: 1 })
    .returning();
  return seeded;
}

export async function updatePreferences(
  patch: Partial<NewMealPreferences>,
): Promise<void> {
  await db
    .update(mealPreferences)
    .set(patch)
    .where(eq(mealPreferences.id, 1));
}
