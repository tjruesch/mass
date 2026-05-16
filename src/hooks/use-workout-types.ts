/**
 * Live workout-types library — joined `workout_types` + `workout_type_steps`.
 *
 * Built on top of `useLiveQuery` so any insert/update/delete on either
 * table re-renders subscribers. Returns the composed `WorkoutTypeDef`
 * shape callers expect (steps already sorted by position, hkCandidateKeys
 * parsed from JSON).
 */

import { asc } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';

import { db } from '@/src/db';
import {
  composeTypes,
  type WorkoutTypeDef,
} from '@/src/db/queries/workout-types';
import { workoutTypeSteps, workoutTypes } from '@/src/db/schema';

export function useWorkoutTypes(): ReadonlyArray<WorkoutTypeDef> {
  const typesQ = useLiveQuery(
    db.select().from(workoutTypes).orderBy(asc(workoutTypes.id)),
  );
  const stepsQ = useLiveQuery(
    db
      .select()
      .from(workoutTypeSteps)
      .orderBy(asc(workoutTypeSteps.typeId), asc(workoutTypeSteps.position)),
  );
  return useMemo(() => {
    const types = typesQ.data ?? [];
    const steps = stepsQ.data ?? [];
    return composeTypes(types, steps);
  }, [typesQ.data, stepsQ.data]);
}
