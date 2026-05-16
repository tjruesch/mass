/**
 * Workout type library — hardcoded for v1.
 *
 * Each entry maps a high-level activity concept (push / pull / legs /
 * tennis / cardio) to:
 *   - a display label + tone color
 *   - one or more HK activity types that should "count" as this entry
 *     when arriving from HealthKit's pull
 *   - the canonical HK activity type to write when the user logs this
 *     locally (pushed back via `saveWorkoutSample`)
 *
 * Push / pull / legs all share `functionalStrengthTraining` on HK, which
 * means an incoming HK workout can't be disambiguated by type alone —
 * the planned-slot linking algorithm (#69) bridges that gap.
 *
 * User-defined types is a deferred follow-up (#72).
 */

import type { WorkoutActivityType } from '@kingstinct/react-native-healthkit';

export type WorkoutTypeId = 'push' | 'pull' | 'legs' | 'tennis' | 'cardio';

export type WorkoutTypeTone = 'ink' | 'cool' | 'accent' | 'mute';

export type WorkoutTypeDef = {
  readonly id: WorkoutTypeId;
  readonly label: string;
  readonly tone: WorkoutTypeTone;
  /**
   * Canonical HK activity used when this type is pushed to HealthKit
   * via `saveWorkoutSample`. The string is the enum *key*; the HK call
   * accepts the numeric enum value, which we resolve at push time
   * (see `src/lib/healthkit/workouts.ts`).
   */
  readonly hkActivityKey: keyof typeof WorkoutActivityKey;
  /**
   * HK activity keys that should be considered candidates for linking
   * back to this type when an HK workout is pulled. Push / pull / legs
   * all list the same single value here, which is what forces the
   * planned-slot linking algorithm to do the actual disambiguation.
   */
  readonly hkCandidateKeys: ReadonlyArray<keyof typeof WorkoutActivityKey>;
};

/**
 * Subset of the HK enum keys we actually emit / accept. Keeping the
 * mapping table tiny means we don't have to import the whole HK enum
 * surface here.
 */
export const WorkoutActivityKey = {
  functionalStrengthTraining: 20,
  traditionalStrengthTraining: 50,
  tennis: 48,
  walking: 52,
  running: 37,
  cycling: 13,
} as const satisfies Record<string, WorkoutActivityType>;

export const WORKOUT_TYPES: ReadonlyArray<WorkoutTypeDef> = [
  {
    id: 'push',
    label: 'Push',
    tone: 'ink',
    hkActivityKey: 'functionalStrengthTraining',
    hkCandidateKeys: ['functionalStrengthTraining', 'traditionalStrengthTraining'],
  },
  {
    id: 'pull',
    label: 'Pull',
    tone: 'ink',
    hkActivityKey: 'functionalStrengthTraining',
    hkCandidateKeys: ['functionalStrengthTraining', 'traditionalStrengthTraining'],
  },
  {
    id: 'legs',
    label: 'Legs',
    tone: 'ink',
    hkActivityKey: 'functionalStrengthTraining',
    hkCandidateKeys: ['functionalStrengthTraining', 'traditionalStrengthTraining'],
  },
  {
    id: 'tennis',
    label: 'Tennis',
    tone: 'accent',
    hkActivityKey: 'tennis',
    hkCandidateKeys: ['tennis'],
  },
  {
    id: 'cardio',
    label: 'Cardio',
    tone: 'cool',
    hkActivityKey: 'walking',
    hkCandidateKeys: ['walking', 'running', 'cycling'],
  },
];

/** Lookup by id. Throws on unknown — call only with valid library ids. */
export function workoutTypeById(id: WorkoutTypeId): WorkoutTypeDef {
  const found = WORKOUT_TYPES.find((t) => t.id === id);
  if (!found) throw new Error(`Unknown workout type id: ${id}`);
  return found;
}

/** Best-guess display label for an HK activity that didn't link to a plan. */
export function fallbackLabelForHkActivity(hkActivityKey: string): string {
  // Lowercase first letter, split camelCase to spaces, capitalize first.
  // e.g. functionalStrengthTraining → "Functional strength training"
  const spaced = hkActivityKey.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
