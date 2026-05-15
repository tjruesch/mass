/**
 * Water log query + mutation surface.
 *
 * Storage is always in ml; the `kind` column captures water/tea/coffee so the
 * UI can render distinctly and the day's *counted* total can fold in partial
 * weights from `water_preferences.teaCountPct` / `coffeeCountPct`.
 */

import { and, desc, eq, gte, lt } from 'drizzle-orm';

import { db } from '@/src/db';
import {
  waterLogs,
  type NewWaterLog,
  type WaterKind,
  type WaterLog,
  type WaterSource,
} from '@/src/db/schema';
import { startOfDay, addDays } from '@/src/lib/time';

export async function addWaterLog(opts: {
  at?: Date;
  ml: number;
  kind?: WaterKind;
  source?: WaterSource;
}): Promise<WaterLog> {
  if (opts.ml <= 0) throw new Error('Amount must be positive.');
  const [row] = await db
    .insert(waterLogs)
    .values({
      at: opts.at ?? new Date(),
      ml: opts.ml,
      kind: opts.kind ?? 'water',
      source: opts.source ?? 'manual',
    })
    .returning();
  return row;
}

export async function updateWaterLog(
  id: number,
  patch: Partial<Pick<NewWaterLog, 'at' | 'ml' | 'kind'>>,
): Promise<WaterLog | null> {
  if (patch.ml !== undefined && patch.ml <= 0) {
    throw new Error('Amount must be positive.');
  }
  const [row] = await db.update(waterLogs).set(patch).where(eq(waterLogs.id, id)).returning();
  return row ?? null;
}

export async function deleteWaterLog(id: number): Promise<void> {
  await db.delete(waterLogs).where(eq(waterLogs.id, id));
}

export async function listTodaySips(now: Date = new Date()): Promise<WaterLog[]> {
  const start = startOfDay(now);
  const end = addDays(start, 1);
  return db
    .select()
    .from(waterLogs)
    .where(and(gte(waterLogs.at, start), lt(waterLogs.at, end)))
    .orderBy(desc(waterLogs.at));
}

/** `ymd` is a local 'YYYY-MM-DD' — matches the calendar-key convention. */
export async function listSipsForDay(ymd: string): Promise<WaterLog[]> {
  const [y, m, d] = ymd.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = addDays(start, 1);
  return db
    .select()
    .from(waterLogs)
    .where(and(gte(waterLogs.at, start), lt(waterLogs.at, end)))
    .orderBy(desc(waterLogs.at));
}

export async function listAllSips(): Promise<WaterLog[]> {
  return db.select().from(waterLogs).orderBy(desc(waterLogs.at));
}
