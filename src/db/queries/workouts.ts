/**
 * Workout entry mutations + reads.
 *
 * Same dedup model as weight: `healthkitUuid` is the canonical key for
 * HK-mirrored rows; locally-typed rows have `healthkitUuid: null`. No
 * separate `source` column (lesson learned from #62).
 */

import { and, desc, eq, gte, like, lt } from 'drizzle-orm';

import { db, type DbClient } from '@/src/db';
import {
  workoutEntries,
  type NewWorkoutEntry,
  type WorkoutEntry,
} from '@/src/db/schema';
import { hkActivityKeyForValue } from '@/src/lib/workouts/types';

export async function addWorkoutEntry(
  opts: {
    startedAt: Date;
    endedAt: Date;
    /** HK activity key (e.g. 'functionalStrengthTraining'). */
    type: string;
    kcal?: number | null;
    distanceM?: number | null;
    notes?: string | null;
    healthkitUuid?: string;
  },
  client: DbClient = db,
): Promise<WorkoutEntry> {
  if (opts.endedAt.getTime() <= opts.startedAt.getTime()) {
    throw new Error('End time must come after start time.');
  }

  if (opts.healthkitUuid) {
    const [row] = await client
      .insert(workoutEntries)
      .values({
        startedAt: opts.startedAt,
        endedAt: opts.endedAt,
        type: opts.type,
        kcal: opts.kcal ?? null,
        distanceM: opts.distanceM ?? null,
        notes: opts.notes ?? null,
        healthkitUuid: opts.healthkitUuid,
      })
      .onConflictDoUpdate({
        target: workoutEntries.healthkitUuid,
        set: {
          startedAt: opts.startedAt,
          endedAt: opts.endedAt,
          type: opts.type,
          kcal: opts.kcal ?? null,
          distanceM: opts.distanceM ?? null,
        },
      })
      .returning();
    return row;
  }

  const [row] = await client
    .insert(workoutEntries)
    .values({
      startedAt: opts.startedAt,
      endedAt: opts.endedAt,
      type: opts.type,
      kcal: opts.kcal ?? null,
      distanceM: opts.distanceM ?? null,
      notes: opts.notes ?? null,
      healthkitUuid: null,
    })
    .returning();
  return row;
}

export async function updateWorkoutEntry(
  id: number,
  patch: Partial<Pick<NewWorkoutEntry, 'startedAt' | 'endedAt' | 'type' | 'kcal' | 'distanceM' | 'notes'>>,
): Promise<WorkoutEntry | null> {
  if (
    patch.startedAt &&
    patch.endedAt &&
    patch.endedAt.getTime() <= patch.startedAt.getTime()
  ) {
    throw new Error('End time must come after start time.');
  }
  const [row] = await db
    .update(workoutEntries)
    .set(patch)
    .where(eq(workoutEntries.id, id))
    .returning();
  return row ?? null;
}

export async function deleteWorkoutEntry(id: number): Promise<void> {
  await db.delete(workoutEntries).where(eq(workoutEntries.id, id));
}

/** Used by the HK pull path on `deletedSamples`. No-op when no row matches. */
export async function deleteWorkoutEntryByHealthKitUuid(
  uuid: string,
  client: DbClient = db,
): Promise<void> {
  await client.delete(workoutEntries).where(eq(workoutEntries.healthkitUuid, uuid));
}

/** Backfill the HK UUID after a successful write to HealthKit. */
export async function attachHealthKitUuid(id: number, uuid: string): Promise<void> {
  await db
    .update(workoutEntries)
    .set({ healthkitUuid: uuid })
    .where(eq(workoutEntries.id, id));
}

export async function listSinceDesc(
  date: Date,
  limit: number = 50,
): Promise<WorkoutEntry[]> {
  return db
    .select()
    .from(workoutEntries)
    .where(gte(workoutEntries.startedAt, date))
    .orderBy(desc(workoutEntries.startedAt))
    .limit(limit);
}

/** Inclusive `start`, exclusive `end` — typical for week / day windows. */
export async function listInRange(start: Date, end: Date): Promise<WorkoutEntry[]> {
  return db
    .select()
    .from(workoutEntries)
    .where(and(gte(workoutEntries.startedAt, start), lt(workoutEntries.startedAt, end)))
    .orderBy(desc(workoutEntries.startedAt));
}

/**
 * Rewrites legacy `activity_<N>` fallback types to their real HK enum
 * key. Slice 4 shipped with a hand-curated 6-entry HK activity map; any
 * pulled workout outside that set was stored as `activity_<num>` (e.g.
 * `activity_57` for yoga). #82 expanded the catalog to the full HK enum,
 * but those legacy rows kept their stale type — which both rendered
 * poorly and broke linker candidate matching.
 *
 * Idempotent: rows whose type doesn't match the pattern are skipped.
 * Runs once at app boot from `_layout.tsx` alongside the other seeders.
 */
export async function backfillLegacyActivityKeys(): Promise<number> {
  const stale = await db
    .select()
    .from(workoutEntries)
    .where(like(workoutEntries.type, 'activity_%'));
  if (stale.length === 0) return 0;
  let updated = 0;
  await db.transaction(async (tx) => {
    for (const row of stale) {
      const m = row.type.match(/^activity_(\d+)$/);
      if (!m) continue;
      const num = Number.parseInt(m[1], 10);
      const key = hkActivityKeyForValue(num);
      if (!key) continue;
      await tx
        .update(workoutEntries)
        .set({ type: key })
        .where(eq(workoutEntries.id, row.id));
      updated++;
    }
  });
  return updated;
}
