/**
 * Singleton row at id=1. Mirrors `fasting-preferences.ts` and
 * `water-preferences.ts` — seed on first read so screens can assume
 * the row exists.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/src/db';
import {
  weightPreferences,
  type NewWeightPreferences,
  type WeightPreferences,
} from '@/src/db/schema';

export async function getPreferences(): Promise<WeightPreferences> {
  const rows = await db.select().from(weightPreferences).limit(1);
  if (rows[0]) return rows[0];
  const [seeded] = await db.insert(weightPreferences).values({ id: 1 }).returning();
  return seeded;
}

export async function updatePreferences(patch: Partial<NewWeightPreferences>): Promise<void> {
  await db.update(weightPreferences).set(patch).where(eq(weightPreferences.id, 1));
}
