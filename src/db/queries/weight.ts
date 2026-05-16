/**
 * Weight entry mutations + reads.
 *
 * Dedup strategy: when a row carries `healthkitUuid`, that UUID is the
 * canonical identifier — HK re-pulls update the same row rather than
 * inserting a duplicate. Locally-typed entries have `healthkitUuid: null`
 * and are identified by their auto-increment `id`. There's no separate
 * `source` column anymore: presence/absence of a UUID is enough to tell
 * the origin apart, and the user doesn't care about the distinction
 * beyond the dedup behavior.
 *
 * Storage is always kg. The display unit (`weight_preferences.unit`) is
 * a UI projection applied at render time.
 */

import { and, desc, eq, gte, isNotNull } from 'drizzle-orm';

import { db, type DbClient } from '@/src/db';
import {
  weightEntries,
  type NewWeightEntry,
  type WeightEntry,
} from '@/src/db/schema';

export async function addWeightEntry(
  opts: {
    at?: Date;
    kg: number;
    healthkitUuid?: string;
  },
  client: DbClient = db,
): Promise<WeightEntry> {
  if (!Number.isFinite(opts.kg) || opts.kg <= 0) {
    throw new Error('Weight must be a positive number.');
  }
  // HK-sourced rows dedupe on UUID. Onconflict-update keeps the row but
  // refreshes its at/kg in case HK delivered a corrected version.
  if (opts.healthkitUuid) {
    const [row] = await client
      .insert(weightEntries)
      .values({
        at: opts.at ?? new Date(),
        kg: opts.kg,
        healthkitUuid: opts.healthkitUuid,
      })
      .onConflictDoUpdate({
        target: weightEntries.healthkitUuid,
        set: {
          at: opts.at ?? new Date(),
          kg: opts.kg,
        },
      })
      .returning();
    return row;
  }
  // Locally-typed entries — straight insert. Multiple null-UUID rows at
  // the same timestamp are allowed (the unique index only fires when
  // healthkitUuid is non-null).
  const [row] = await client
    .insert(weightEntries)
    .values({
      at: opts.at ?? new Date(),
      kg: opts.kg,
      healthkitUuid: null,
    })
    .returning();
  return row;
}

export async function updateWeightEntry(
  id: number,
  patch: Partial<Pick<NewWeightEntry, 'at' | 'kg'>>,
): Promise<WeightEntry | null> {
  if (patch.kg !== undefined && (!Number.isFinite(patch.kg) || patch.kg <= 0)) {
    throw new Error('Weight must be a positive number.');
  }
  const [row] = await db
    .update(weightEntries)
    .set(patch)
    .where(eq(weightEntries.id, id))
    .returning();
  return row ?? null;
}

export async function deleteWeightEntry(id: number): Promise<void> {
  await db.delete(weightEntries).where(eq(weightEntries.id, id));
}

/** Used by the HK pull path on `deletedSamples`. No-op if no row matches. */
export async function deleteWeightEntryByHealthKitUuid(
  uuid: string,
  client: DbClient = db,
): Promise<void> {
  await client.delete(weightEntries).where(eq(weightEntries.healthkitUuid, uuid));
}

/** Backfill the HK UUID after a successful write to HealthKit. */
export async function attachHealthKitUuid(id: number, uuid: string): Promise<void> {
  await db.update(weightEntries).set({ healthkitUuid: uuid }).where(eq(weightEntries.id, id));
}

export async function getLatest(): Promise<WeightEntry | null> {
  const rows = await db
    .select()
    .from(weightEntries)
    .orderBy(desc(weightEntries.at))
    .limit(1);
  return rows[0] ?? null;
}

export async function listRecent(limit: number = 14): Promise<WeightEntry[]> {
  return db
    .select()
    .from(weightEntries)
    .orderBy(desc(weightEntries.at))
    .limit(limit);
}

export async function listSince(date: Date): Promise<WeightEntry[]> {
  return db
    .select()
    .from(weightEntries)
    .where(gte(weightEntries.at, date))
    .orderBy(desc(weightEntries.at));
}

export async function listAll(): Promise<WeightEntry[]> {
  return db.select().from(weightEntries).orderBy(desc(weightEntries.at));
}

/**
 * Convenience: pull all HK-sourced entries (used for dedup checks when
 * we need to know "do we have any HK data yet?").
 */
export async function listHealthKitEntries(): Promise<WeightEntry[]> {
  return db
    .select()
    .from(weightEntries)
    .where(and(isNotNull(weightEntries.healthkitUuid)))
    .orderBy(desc(weightEntries.at));
}
