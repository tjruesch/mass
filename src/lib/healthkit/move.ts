/**
 * Today's active calories from HealthKit — the data behind Apple's
 * red "Move" ring. Drives the home-screen move ring + legend.
 *
 * Unlike weight + workouts, we don't mirror samples locally — the move
 * ring only needs today's cumulative kcal, returned in O(1) from
 * `queryStatisticsForQuantity`.
 *
 * Read-only — we don't write to ActiveEnergyBurned; iOS derives it from
 * heart-rate + motion data on the watch + phone.
 */

import { queryStatisticsForQuantity } from '@kingstinct/react-native-healthkit';

import { startOfDay } from '@/src/lib/time';

import { getHkAuthState, type HkPermissionRequest } from './auth';
import { quantityToKcal } from './units';

const ACTIVE_ENERGY_IDENTIFIER = 'HKQuantityTypeIdentifierActiveEnergyBurned' as const;

/**
 * Permission set for reading active energy. Stable module-level reference
 * so `useHkAuthState` keys off it without re-subscribing each render.
 */
export const MOVE_PERMISSIONS: HkPermissionRequest = {
  toRead: [ACTIVE_ENERGY_IDENTIFIER],
};

/**
 * Default Move ring target — kcal/day. Apple's default for a new Watch
 * user lands somewhere around 400–500 kcal depending on age/sex/weight;
 * we ship 500 as a sensible baseline. HK doesn't expose the user's
 * actual Move goal programmatically, so this stays hardcoded until a
 * per-user preference exists (Slice 6 goals + daily targets).
 */
export const MOVE_TARGET_KCAL = 500;

/**
 * Read today's active kcal from HealthKit. Returns null when HK isn't
 * authorized (or unavailable) — callers should render an empty ring
 * in that case and let the connect-flow surfaces handle prompting.
 *
 * Today's window is [local midnight, now). The query returns the sum
 * in the user's locale unit; `quantityToKcal` normalises to canonical
 * kcal (same converter the workout-totals path uses, #74).
 */
export async function getTodayMoveKcal(): Promise<number | null> {
  const auth = await getHkAuthState(MOVE_PERMISSIONS);
  if (auth !== 'granted') return null;

  const start = startOfDay(new Date());
  try {
    const res = await queryStatisticsForQuantity(
      ACTIVE_ENERGY_IDENTIFIER,
      ['cumulativeSum'],
      { filter: { date: { startDate: start } } },
    );
    return quantityToKcal(res.sumQuantity) ?? 0;
  } catch (err) {
    console.warn('Failed to read ActiveEnergyBurned from HealthKit:', err);
    return null;
  }
}
