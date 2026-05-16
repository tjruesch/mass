/**
 * Workout type primitives — HK activity enum map + tone alias.
 *
 * The composite types library (rows + steps) lives in
 * `src/db/queries/workout-types.ts` (DB-backed since #82). Anything that
 * needs to enumerate or look up types should read through there or the
 * `useWorkoutTypes` hook — never re-introduce a hardcoded array here.
 *
 * What stays here:
 *   - `WorkoutActivityKey` — the HK enum string→numeric map used when
 *     pushing manual workouts to HK via `saveWorkoutSample`.
 *   - `WorkoutTypeId` — alias for a type's `key` (now any non-empty
 *     string, since custom types are user-defined).
 *   - `WorkoutTypeTone` — display tone alias.
 *   - `fallbackLabelForHkActivity` — humanises an HK enum key for the
 *     "unlinked / raw" rendering path.
 */

import type { WorkoutActivityType } from '@kingstinct/react-native-healthkit';

/** Type-key alias. After #82 a key is any string (no compile-time enum). */
export type WorkoutTypeId = string;

export type WorkoutTypeTone = 'ink' | 'cool' | 'accent' | 'mute';

/**
 * Subset of the HK enum keys we read / write. Extend as new step
 * activities arrive in the seeded library or user-defined types.
 */
export const WorkoutActivityKey = {
  functionalStrengthTraining: 20,
  traditionalStrengthTraining: 50,
  tennis: 48,
  walking: 52,
  running: 37,
  cycling: 13,
} as const satisfies Record<string, WorkoutActivityType>;

export type WorkoutActivityKeyName = keyof typeof WorkoutActivityKey;

/** Best-guess display label for an HK activity that didn't link to a type. */
export function fallbackLabelForHkActivity(hkActivityKey: string): string {
  // Lowercase first letter, split camelCase to spaces, capitalize first.
  // e.g. functionalStrengthTraining → "Functional strength training"
  const spaced = hkActivityKey.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
