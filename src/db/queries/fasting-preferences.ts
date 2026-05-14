/**
 * Singleton row at id=1. Seed on first read so callers can assume it exists.
 * Subsequent calls become a no-op select.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/src/db';
import {
  fastingPreferences,
  type FastingPreferences,
  type NewFastingPreferences,
} from '@/src/db/schema';

export async function getPreferences(): Promise<FastingPreferences> {
  const rows = await db.select().from(fastingPreferences).limit(1);
  if (rows[0]) return rows[0];
  const [seeded] = await db.insert(fastingPreferences).values({ id: 1 }).returning();
  return seeded;
}

export async function updatePreferences(patch: Partial<NewFastingPreferences>): Promise<void> {
  await db
    .update(fastingPreferences)
    .set(patch)
    .where(eq(fastingPreferences.id, 1));
}
