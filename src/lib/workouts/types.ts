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

import { WorkoutActivityType } from '@kingstinct/react-native-healthkit';

/** Type-key alias. After #82 a key is any string (no compile-time enum). */
export type WorkoutTypeId = string;

export type WorkoutTypeTone = 'ink' | 'cool' | 'accent' | 'mute';

/**
 * Full HKWorkoutActivityType enum re-exported as a numeric map keyed by
 * the activity name. The kingstinct package generates this as a TS
 * numeric enum, so it already has bidirectional mappings — we just
 * read it directly instead of maintaining a hand-curated subset.
 */
export { WorkoutActivityType };

/**
 * All HK activity *string* keys we know about — the values in
 * WorkoutActivityType excluding the reverse-mapping number → name
 * entries. Used by the editor's activity picker.
 */
export const HK_ACTIVITY_KEYS: ReadonlyArray<string> = Object.keys(
  WorkoutActivityType,
).filter((k) => Number.isNaN(Number(k))).sort();

/** Convert a numeric HK activity value back to its string key. */
export function hkActivityKeyForValue(value: number): string | null {
  const k = (WorkoutActivityType as unknown as Record<number, string>)[value];
  return typeof k === 'string' ? k : null;
}

/** Convert a string key to its numeric value (for HK writes). */
export function hkActivityValueForKey(key: string): number | null {
  const v = (WorkoutActivityType as unknown as Record<string, number>)[key];
  return typeof v === 'number' ? v : null;
}

/**
 * HK activities where distance is a meaningful metric — walking, running,
 * cycling, swimming, etc. Used by the log drawer to conditionally show
 * the distance field and by the kcal/distance allocator to skip strength
 * steps when splitting distance across a composite type.
 *
 * Conservative list; rest of the catalog defaults to "no distance".
 * Extend if a real use case shows up.
 */
const DISTANCE_TRACKED_KEYS: ReadonlySet<string> = new Set([
  'walking',
  'running',
  'cycling',
  'hiking',
  'swimming',
  'rowing',
  'paddleSports',
  'crossCountrySkiing',
  'downhillSkiing',
  'wheelchairWalkPace',
  'wheelchairRunPace',
  'handCycling',
  'snowboarding',
  'surfingSports',
  'skatingSports',
]);

export function isDistanceTrackedActivity(hkActivityKey: string): boolean {
  return DISTANCE_TRACKED_KEYS.has(hkActivityKey);
}

/** Best-guess display label for an HK activity key. */
export function fallbackLabelForHkActivity(hkActivityKey: string): string {
  // Lowercase first letter, split camelCase to spaces, capitalize first.
  // e.g. functionalStrengthTraining → "Functional strength training"
  const spaced = hkActivityKey.replace(/([A-Z])/g, ' $1').toLowerCase().trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
