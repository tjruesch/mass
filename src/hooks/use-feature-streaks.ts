/**
 * Per-feature streak stats for the /trends per-feature row (#99).
 *
 * Pulls the same 28-day window for fasting / water / workouts and
 * exposes:
 *   - `current`   — consecutive days ending today where the feature
 *                   hit its goal (same definitions as the combined
 *                   streak in #98).
 *   - `mean`      — μ stat over the window:
 *                     * fasting:  average completed-fast elapsed hours.
 *                     * water:    average daily total over days with
 *                                 any logs (active days mean).
 *                     * workouts: average sessions per 7-day week
 *                                 (total / 4).
 *   - `weekDots`  — 7-day mini intensity row, oldest first. 0 = no
 *                   activity, 1 = some but below goal, 2 = at goal,
 *                   3 = clearly exceeded goal (≥ 1.25 ×).
 *
 * All values live-update via useLiveQuery so a fresh log on /water
 * or a HK workout drop reshapes the row immediately.
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

const DEFAULT_FASTING_TARGET = 16;
const DEFAULT_WATER_TARGET_ML = 3000;
const DOT_DAYS = 7;

export type FeatureStreakStat = {
  readonly current: number;
  readonly mean: number;
  /** Length always = DOT_DAYS. Oldest first; last = today. */
  readonly weekDots: ReadonlyArray<number>;
};

export type FeatureStreaks = {
  readonly fasting: FeatureStreakStat;
  readonly water: FeatureStreakStat;
  readonly workouts: FeatureStreakStat;
};

export function useFeatureStreaks(windowDays: number = 28): FeatureStreaks {
  const now = useNow(60_000);
  const todayStart = startOfDay(now);
  const lookbackStart = addDays(todayStart, -(windowDays - 1));
  const lookbackEnd = addDays(todayStart, 1);

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
  return useMemo<FeatureStreaks>(() => {
    const fastingTarget =
      fastingPrefRows?.[0]?.defaultTargetHours ?? DEFAULT_FASTING_TARGET;
    const waterTargetMl =
      waterPrefRows?.[0]?.targetMl ?? DEFAULT_WATER_TARGET_ML;

    // ── Per-day fasting elapsed hours ────────────────────────────────
    // Multiple completed sessions in a day get summed — rare but means
    // a noon coffee-break "fast" + an evening one both count.
    const fastingHoursByDay = new Map<number, number>();
    let completedTotalHours = 0;
    let completedCount = 0;
    for (const row of fastingRows ?? []) {
      if (!row.endedAt) continue;
      const elapsedH =
        (row.endedAt.getTime() - row.startedAt.getTime()) / 3_600_000;
      const k = startOfDay(row.endedAt).getTime();
      fastingHoursByDay.set(k, (fastingHoursByDay.get(k) ?? 0) + elapsedH);
      completedTotalHours += elapsedH;
      completedCount++;
    }

    // ── Per-day water totals ────────────────────────────────────────
    const waterMlByDay = new Map<number, number>();
    for (const row of waterRows ?? []) {
      const k = startOfDay(row.at).getTime();
      waterMlByDay.set(k, (waterMlByDay.get(k) ?? 0) + row.ml);
    }

    // ── Per-day workout counts ──────────────────────────────────────
    const workoutsByDay = new Map<number, number>();
    for (const row of workoutRows ?? []) {
      const k = startOfDay(row.startedAt).getTime();
      workoutsByDay.set(k, (workoutsByDay.get(k) ?? 0) + 1);
    }

    // ── Helpers ──────────────────────────────────────────────────────
    const walkBackStreak = (hit: (dayKey: number) => boolean): number => {
      let streak = 0;
      for (let i = 0; i < windowDays; i++) {
        const k = addDays(todayStart, -i).getTime();
        if (hit(k)) streak++;
        else break;
      }
      return streak;
    };
    const buildWeekDots = (
      score: (dayKey: number) => number,
    ): number[] => {
      const out: number[] = [];
      for (let i = DOT_DAYS - 1; i >= 0; i--) {
        out.push(score(addDays(todayStart, -i).getTime()));
      }
      return out;
    };

    // ── Fasting stat ─────────────────────────────────────────────────
    const fasting: FeatureStreakStat = {
      current: walkBackStreak(
        (k) => (fastingHoursByDay.get(k) ?? 0) >= fastingTarget,
      ),
      mean:
        completedCount > 0 ? completedTotalHours / completedCount : 0,
      weekDots: buildWeekDots((k) => {
        const h = fastingHoursByDay.get(k) ?? 0;
        if (h <= 0) return 0;
        if (h < fastingTarget) return 1;
        if (h < fastingTarget * 1.25) return 2;
        return 3;
      }),
    };

    // ── Water stat ───────────────────────────────────────────────────
    // Active-days mean — averaging over the whole window dilutes the
    // number for users who skip a few days, which felt wrong.
    let waterTotalMl = 0;
    let waterActiveDays = 0;
    for (const ml of waterMlByDay.values()) {
      if (ml > 0) {
        waterTotalMl += ml;
        waterActiveDays++;
      }
    }
    const water: FeatureStreakStat = {
      current: walkBackStreak(
        (k) => (waterMlByDay.get(k) ?? 0) >= waterTargetMl,
      ),
      mean: waterActiveDays > 0 ? waterTotalMl / waterActiveDays / 1000 : 0,
      weekDots: buildWeekDots((k) => {
        const ml = waterMlByDay.get(k) ?? 0;
        if (ml <= 0) return 0;
        if (ml < waterTargetMl) return 1;
        if (ml < waterTargetMl * 1.25) return 2;
        return 3;
      }),
    };

    // ── Workouts stat ────────────────────────────────────────────────
    // Per-week mean = total sessions ÷ (windowDays / 7) so the unit
    // stays " / wk" even when windowDays isn't 28.
    let workoutTotal = 0;
    for (const c of workoutsByDay.values()) workoutTotal += c;
    const workouts: FeatureStreakStat = {
      current: walkBackStreak((k) => (workoutsByDay.get(k) ?? 0) > 0),
      mean: workoutTotal / (windowDays / 7),
      weekDots: buildWeekDots((k) => {
        const c = workoutsByDay.get(k) ?? 0;
        if (c === 0) return 0;
        if (c === 1) return 2;
        return 3;
      }),
    };

    return { fasting, water, workouts };
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
