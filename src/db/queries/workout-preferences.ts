/**
 * Singleton at id=1 with a sensible default weekly template.
 *
 * Mirrors the design's intent: M push, W pull, F push (or legs), with
 * other days as rest. Users can edit the template in settings; the seed
 * just ensures there's *something* to render on first run.
 */

import { eq } from 'drizzle-orm';

import { db } from '@/src/db';
import {
  workoutPreferences,
  type NewWorkoutPreferences,
  type WorkoutPreferences,
} from '@/src/db/schema';

export async function getPreferences(): Promise<WorkoutPreferences> {
  const rows = await db.select().from(workoutPreferences).limit(1);
  if (rows[0]) return rows[0];
  // Default template: 3-day push/pull/legs split. User edits in settings.
  const [seeded] = await db
    .insert(workoutPreferences)
    .values({
      id: 1,
      monType: 'push',
      tueType: null,
      wedType: 'pull',
      thuType: null,
      friType: 'legs',
      satType: null,
      sunType: null,
    })
    .returning();
  return seeded;
}

export async function updatePreferences(
  patch: Partial<NewWorkoutPreferences>,
): Promise<void> {
  await db.update(workoutPreferences).set(patch).where(eq(workoutPreferences.id, 1));
}
