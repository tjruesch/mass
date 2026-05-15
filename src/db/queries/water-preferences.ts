/**
 * Singleton row at id=1. Seed on first read so callers can assume it exists.
 * Mirrors `fasting-preferences.ts` deliberately — keep them parallel.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/src/db';
import {
  waterPreferences,
  type NewWaterPreferences,
  type WaterPreferences,
} from '@/src/db/schema';

export async function getPreferences(): Promise<WaterPreferences> {
  const rows = await db.select().from(waterPreferences).limit(1);
  if (rows[0]) return rows[0];
  const [seeded] = await db.insert(waterPreferences).values({ id: 1 }).returning();
  return seeded;
}

export async function updatePreferences(patch: Partial<NewWaterPreferences>): Promise<void> {
  await db.update(waterPreferences).set(patch).where(eq(waterPreferences.id, 1));
}
