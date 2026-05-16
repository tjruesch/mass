/**
 * Reactive workout state.
 *
 *   useRecentWorkouts(limit)    — live desc list (~8 by default), used by
 *                                  the recent-sessions section.
 *   useWorkoutsThisWeek()       — entries within Monday→Sunday of the
 *                                  current local week, used by the
 *                                  week-at-a-glance grid.
 *
 * Linking entries to planned weekday slots happens in a separate hook
 * built on top of these in issue #69.
 */

import { and, desc, gte, lt } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/src/db';
import { workoutEntries, type WorkoutEntry } from '@/src/db/schema';
import { useWorkoutPreferences } from '@/src/hooks/use-workout-preferences';
import { linkWorkoutToSlot } from '@/src/lib/workouts/link';
import type { WorkoutTypeId } from '@/src/lib/workouts/types';
import { addDays, dowMondayFirst, startOfDay } from '@/src/lib/time';

export function useRecentWorkouts(limit: number = 8): ReadonlyArray<WorkoutEntry> {
  const { data } = useLiveQuery(
    db
      .select()
      .from(workoutEntries)
      .orderBy(desc(workoutEntries.startedAt))
      .limit(limit),
  );
  return data ?? [];
}

/**
 * Recent workouts joined with the planned-slot linking algorithm. Each
 * row gains a `linkedTypeId` field — non-null when the algorithm
 * matched a planned weekly slot. Display code uses it to decide
 * between the library label ("push") and the raw HK fallback.
 */
export type LinkedWorkout = {
  readonly entry: WorkoutEntry;
  readonly linkedTypeId: WorkoutTypeId | null;
};

export function useLinkedWorkouts(limit: number = 8): ReadonlyArray<LinkedWorkout> {
  const prefs = useWorkoutPreferences();
  const entries = useRecentWorkouts(limit);
  return useMemo<ReadonlyArray<LinkedWorkout>>(() => {
    if (!prefs) return entries.map((entry) => ({ entry, linkedTypeId: null }));
    return entries.map((entry) => ({
      entry,
      linkedTypeId: linkWorkoutToSlot(entry, prefs),
    }));
  }, [entries, prefs]);
}

/**
 * Current calendar week (Mon → next Mon, local). Returned desc so the
 * caller can render newest-first.
 */
export function useWorkoutsThisWeek(): ReadonlyArray<WorkoutEntry> {
  const today = startOfDay(new Date());
  const monday = addDays(today, -dowMondayFirst(today));
  const nextMonday = addDays(monday, 7);
  const { data } = useLiveQuery(
    db
      .select()
      .from(workoutEntries)
      .where(
        and(
          gte(workoutEntries.startedAt, monday),
          lt(workoutEntries.startedAt, nextMonday),
        ),
      )
      .orderBy(desc(workoutEntries.startedAt)),
  );
  return data ?? [];
}
