/**
 * Combined streak across fasting / water / workouts (#98).
 *
 * A day "hits" each goal when:
 *   - Fasting:  a `fasting_sessions` row ENDED that day with elapsed
 *               hours ≥ `fasting_preferences.defaultTargetHours`.
 *   - Water:    sum of `water_logs.ml` whose `at` falls on that day
 *               ≥ `water_preferences.targetMl`.
 *   - Workouts: at least one `workout_entries` row whose `startedAt`
 *               falls on that day.
 *
 * Returns:
 *   - `hitsPerDay` (oldest → newest, last entry = today).
 *   - `currentStreak`: consecutive 3/3 days ending today.
 *   - `bestStreak`: longest 3/3 run inside the lookback window.
 *   - `since`: start date of the current streak (null when 0).
 *
 * Lookback is 90 days by default — plenty for v1 trends; can grow
 * once a history aggregation slice lands.
 */

import { and, gte, isNotNull, lte } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/src/db';
import {
  fastingPreferences,
  fastingSessions,
  waterLogs,
  waterPreferences,
  workoutEntries,
} from '@/src/db/schema';
import { addDays, startOfDay } from '@/src/lib/time';
import { useNow } from '@/src/lib/use-now';

const LOOKBACK_DAYS = 90;
const DEFAULT_FASTING_TARGET = 16;
const DEFAULT_WATER_TARGET_ML = 3000;

export type CombinedStreakState = {
  /** 0-3 ints per day, oldest first; last entry = today. */
  readonly hitsPerDay: ReadonlyArray<number>;
  readonly currentStreak: number;
  readonly bestStreak: number;
  readonly since: Date | null;
};

export function useCombinedStreak(
  windowDays: number = LOOKBACK_DAYS,
): CombinedStreakState {
  const now = useNow(60_000);
  const todayStart = startOfDay(now);
  const lookbackStart = addDays(todayStart, -(windowDays - 1));
  const lookbackEnd = addDays(todayStart, 1);

  // Fasting sessions ENDED inside the window. Active sessions have
  // null endedAt and don't count toward "completed" yet.
  const { data: fastingRows } = useLiveQuery(
    db
      .select()
      .from(fastingSessions)
      .where(
        and(
          isNotNull(fastingSessions.endedAt),
          gte(fastingSessions.endedAt, lookbackStart),
          lte(fastingSessions.endedAt, lookbackEnd),
        ),
      ),
  );

  // Water logs inside the window — summed by day.
  const { data: waterRows } = useLiveQuery(
    db
      .select()
      .from(waterLogs)
      .where(
        and(
          gte(waterLogs.at, lookbackStart),
          lte(waterLogs.at, lookbackEnd),
        ),
      ),
  );

  // Workout entries STARTED inside the window. Even an open-ended
  // workout (still recording on the watch) ought to be rare here —
  // sync drops finished rows.
  const { data: workoutRows } = useLiveQuery(
    db
      .select()
      .from(workoutEntries)
      .where(
        and(
          gte(workoutEntries.startedAt, lookbackStart),
          lte(workoutEntries.startedAt, lookbackEnd),
        ),
      ),
  );

  const { data: fastingPrefRows } = useLiveQuery(
    db.select().from(fastingPreferences).limit(1),
  );
  const { data: waterPrefRows } = useLiveQuery(
    db.select().from(waterPreferences).limit(1),
  );

  const todayKey = todayStart.getTime();
  return useMemo<CombinedStreakState>(() => {
    const fastingTarget =
      fastingPrefRows?.[0]?.defaultTargetHours ?? DEFAULT_FASTING_TARGET;
    const waterTarget =
      waterPrefRows?.[0]?.targetMl ?? DEFAULT_WATER_TARGET_ML;

    // Build day-indexed sets. Keys are calendar-day start timestamps
    // so DST-correct addDays() round-trips cleanly.
    const fastingHitDays = new Set<number>();
    for (const row of fastingRows ?? []) {
      if (!row.endedAt) continue;
      const elapsedH =
        (row.endedAt.getTime() - row.startedAt.getTime()) / 3_600_000;
      if (elapsedH < fastingTarget) continue;
      fastingHitDays.add(startOfDay(row.endedAt).getTime());
    }

    const waterByDay = new Map<number, number>();
    for (const row of waterRows ?? []) {
      const k = startOfDay(row.at).getTime();
      waterByDay.set(k, (waterByDay.get(k) ?? 0) + row.ml);
    }

    const workoutDays = new Set<number>();
    for (const row of workoutRows ?? []) {
      workoutDays.add(startOfDay(row.startedAt).getTime());
    }

    // Walk the window oldest → newest and score each day 0-3.
    const hitsPerDay: number[] = new Array(windowDays);
    for (let i = 0; i < windowDays; i++) {
      const dayStart = addDays(lookbackStart, i).getTime();
      let hits = 0;
      if (fastingHitDays.has(dayStart)) hits++;
      if ((waterByDay.get(dayStart) ?? 0) >= waterTarget) hits++;
      if (workoutDays.has(dayStart)) hits++;
      hitsPerDay[i] = hits;
    }

    // Current streak: consecutive 3/3 days ending at the last index.
    let currentStreak = 0;
    for (let i = hitsPerDay.length - 1; i >= 0; i--) {
      if (hitsPerDay[i] === 3) currentStreak++;
      else break;
    }
    // Best streak: longest 3/3 run inside the window.
    let bestStreak = 0;
    let run = 0;
    for (const v of hitsPerDay) {
      if (v === 3) {
        run++;
        if (run > bestStreak) bestStreak = run;
      } else {
        run = 0;
      }
    }

    const since =
      currentStreak > 0
        ? new Date(todayKey - (currentStreak - 1) * 86_400_000)
        : null;

    return { hitsPerDay, currentStreak, bestStreak, since };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    fastingRows,
    waterRows,
    workoutRows,
    fastingPrefRows,
    waterPrefRows,
    todayKey,
    windowDays,
  ]);
}
