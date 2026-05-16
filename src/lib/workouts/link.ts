/**
 * Maps an actual workout to a planned weekly slot.
 *
 * For each workout the algorithm picks the planned slot that sits on the
 * workout's local weekday. The slot is a match when:
 *   1. There IS a planned type that day (non-rest).
 *   2. The planned type's HK candidate list includes the workout's HK
 *      activity key.
 *   3. If a planned time is set, the workout's start is within
 *      `prefs.linkWindowMinutes` of it (in minutes-of-day, with simple
 *      midnight-wrap tolerance).
 *
 * Returns the planned type id when those line up, else null — the caller
 * uses null to render the workout under its raw HK activity label.
 */

import type { WorkoutEntry, WorkoutPreferences } from '@/src/db/schema';
import {
  workoutTypeById,
  type WorkoutTypeId,
} from '@/src/lib/workouts/types';
import { dowMondayFirst, startOfDay } from '@/src/lib/time';

const DAY_MINUTES = 24 * 60;

const WEEKDAY_FIELDS: ReadonlyArray<{
  typeField: keyof WorkoutPreferences;
  timeField: keyof WorkoutPreferences;
}> = [
  { typeField: 'monType', timeField: 'monTimeMin' },
  { typeField: 'tueType', timeField: 'tueTimeMin' },
  { typeField: 'wedType', timeField: 'wedTimeMin' },
  { typeField: 'thuType', timeField: 'thuTimeMin' },
  { typeField: 'friType', timeField: 'friTimeMin' },
  { typeField: 'satType', timeField: 'satTimeMin' },
  { typeField: 'sunType', timeField: 'sunTimeMin' },
];

export function linkWorkoutToSlot(
  workout: WorkoutEntry,
  prefs: WorkoutPreferences,
): WorkoutTypeId | null {
  const dow = dowMondayFirst(startOfDay(workout.startedAt));
  const slot = WEEKDAY_FIELDS[dow];
  const plannedTypeId = prefs[slot.typeField] as WorkoutTypeId | null;
  if (plannedTypeId === null) return null;

  // Verify the planned type-id is still a valid library key. The schema
  // stores a free-form text, so a stale (renamed) type from a future
  // migration could slip through — fail closed.
  let typeDef;
  try {
    typeDef = workoutTypeById(plannedTypeId);
  } catch {
    return null;
  }

  if (!(typeDef.hkCandidateKeys as readonly string[]).includes(workout.type)) {
    return null;
  }

  const plannedTimeMin = prefs[slot.timeField] as number | null;
  if (plannedTimeMin !== null) {
    const workoutMin =
      workout.startedAt.getHours() * 60 + workout.startedAt.getMinutes();
    // Smallest signed delta on a 24h dial — a workout at 23:50 still
    // links to a slot at 00:10 with a 30min window. Useful for late-
    // night sessions across midnight.
    let delta = Math.abs(workoutMin - plannedTimeMin);
    if (delta > DAY_MINUTES / 2) delta = DAY_MINUTES - delta;
    if (delta > prefs.linkWindowMinutes) return null;
  }

  return plannedTypeId;
}
