/**
 * Singleton row at id=1 for user preferences. Seeded on first read
 * so callers (use-user-preferences, /me editor) can assume the row
 * exists.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/src/db';
import {
  userPreferences,
  type NewUserPreferences,
  type UserPreferences,
} from '@/src/db/schema';

export async function getPreferences(): Promise<UserPreferences> {
  const rows = await db.select().from(userPreferences).limit(1);
  if (rows[0]) return rows[0];
  const [seeded] = await db
    .insert(userPreferences)
    .values({ id: 1 })
    .returning();
  return seeded;
}

export async function updatePreferences(
  patch: Partial<NewUserPreferences>,
): Promise<void> {
  await db
    .update(userPreferences)
    .set(patch)
    .where(eq(userPreferences.id, 1));
}
