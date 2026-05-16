/**
 * Reactive active-goal lookup (Slice 6).
 *
 * Returns the single goal flagged `isActive`, plus derived progress
 * numbers the home greeting + trends both want:
 *
 *   - `dayCount` — days elapsed since `startedAt` (1-indexed: the
 *     goal's start day reads as `day 1`).
 *   - `totalDays` — number of days from `startedAt` to `endsAt`
 *     (inclusive). Null for open-ended goals.
 *   - `progressPct` — `dayCount / totalDays`, capped at 1. Null
 *     when totalDays is null.
 */

import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { eq } from 'drizzle-orm';
import { useMemo } from 'react';

import { db } from '@/src/db';
import { goals, type Goal } from '@/src/db/schema';
import { startOfDay } from '@/src/lib/time';
import { useNow } from '@/src/lib/use-now';

export type ActiveGoalState = {
  readonly goal: Goal | null;
  readonly dayCount: number | null;
  readonly totalDays: number | null;
  readonly progressPct: number | null;
};

export function useActiveGoal(): ActiveGoalState {
  // Once-a-minute tick so the day counter rolls past midnight without
  // a manual refresh — same cadence as the other home hooks.
  const now = useNow(60_000);
  const { data } = useLiveQuery(
    db.select().from(goals).where(eq(goals.isActive, true)).limit(1),
  );
  const goal = data?.[0] ?? null;

  const todayKey = startOfDay(now).getTime();
  return useMemo<ActiveGoalState>(() => {
    if (goal === null) {
      return {
        goal: null,
        dayCount: null,
        totalDays: null,
        progressPct: null,
      };
    }
    const startDay = startOfDay(goal.startedAt).getTime();
    const today = todayKey;
    const dayCount = Math.max(
      1,
      Math.round((today - startDay) / 86_400_000) + 1,
    );
    let totalDays: number | null = null;
    if (goal.endsAt !== null) {
      const endDay = startOfDay(goal.endsAt).getTime();
      totalDays = Math.max(
        1,
        Math.round((endDay - startDay) / 86_400_000) + 1,
      );
    }
    const progressPct =
      totalDays !== null ? Math.min(1, dayCount / totalDays) : null;
    return { goal, dayCount, totalDays, progressPct };
  }, [goal, todayKey]);
}
