/**
 * Today's exercise-minutes readout from HealthKit.
 *
 * Drives the home-screen "move" ring + legend. Unlike weight + workouts,
 * we don't mirror exercise samples locally — the move ring only needs
 * the cumulative daily sum, which HK returns directly via
 * `queryStatisticsForQuantity` in O(1) call time.
 *
 * Read-only — there's no write surface for exercise time (it's derived
 * by iOS from heart-rate + motion data on the watch + phone).
 */

import {
  queryStatisticsForQuantity,
} from '@kingstinct/react-native-healthkit';

import { startOfDay } from '@/src/lib/time';

import { getHkAuthState, type HkPermissionRequest } from './auth';

const EXERCISE_TIME_IDENTIFIER = 'HKQuantityTypeIdentifierAppleExerciseTime' as const;

/**
 * Permission set for reading Apple Exercise Time. Stable module-level
 * reference so `useHkAuthState` keys off it without re-subscribing.
 */
export const EXERCISE_PERMISSIONS: HkPermissionRequest = {
  toRead: [EXERCISE_TIME_IDENTIFIER],
};

/**
 * Apple's default daily move-time goal is 30m for new users but most
 * folks bump it up. iOS doesn't expose the goal via HealthKit, so we
 * hardcode the design's 100m for now. Can become a per-user preference
 * down the line.
 */
export const MOVE_TARGET_MIN = 100;

/**
 * Read today's exercise minutes from HealthKit. Returns null when HK
 * isn't authorized (or unavailable) — callers should render the ring
 * at 0 in that case and let the connect-flow surfaces handle prompting.
 *
 * Today's window is [local midnight, now). `cumulativeSum` returns the
 * total in minutes for AppleExerciseTime (the canonical HK unit for
 * that identifier).
 */
export async function getTodayExerciseMinutes(): Promise<number | null> {
  const auth = await getHkAuthState(EXERCISE_PERMISSIONS);
  if (auth !== 'granted') return null;

  const start = startOfDay(new Date());
  try {
    const res = await queryStatisticsForQuantity(
      EXERCISE_TIME_IDENTIFIER,
      ['cumulativeSum'],
      { filter: { date: { startDate: start } } },
    );
    return res.sumQuantity?.quantity ?? 0;
  } catch (err) {
    console.warn('Failed to read AppleExerciseTime from HealthKit:', err);
    return null;
  }
}
