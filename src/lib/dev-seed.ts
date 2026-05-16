/**
 * Dev-only data seeders. These exist for two reasons:
 *   1. iOS Simulator can't talk to HealthKit, so the only way to populate
 *      the weight slice with realistic data is to fake it locally.
 *   2. Lets us inspect chart/layout edge cases without grinding through
 *      14 manual weigh-ins on the phone.
 *
 * Never call from production code paths. The seed entry points are guarded
 * by `__DEV__` at the call site.
 */

import { db } from '@/src/db';
import { weightEntries } from '@/src/db/schema';
import { addWeightEntry } from '@/src/db/queries/weight';
import { updatePreferences as updateWeightPreferences } from '@/src/db/queries/weight-preferences';
import { addDays, startOfDay } from '@/src/lib/time';

/**
 * Synthesize ~14 days of weight entries trending from `start` toward
 * `goal`, with two skipped days for realism. Wipes existing entries
 * first so repeated taps are idempotent.
 *
 * Mirrors the WEIGHTS fixture from designs/screen-weight.jsx so the
 * chart shape matches what the design preview shows.
 */
export async function seedWeightDataDev(): Promise<{ inserted: number }> {
  // Deterministic PRNG so the seed produces the same numbers every run —
  // makes visual review consistent.
  let s = 7919;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const today = startOfDay(new Date());
  const START_KG = 81.0;
  const GOAL_KG = 77.0;
  // 14-day visible history feeding into a 28-day target window.
  const DAYS_BACK = 14;
  const TARGET_WINDOW_DAYS = 28;

  // Clear anything that's there. Bypasses any future ON DELETE hooks —
  // fine for dev seeding.
  await db.delete(weightEntries);

  const inserts: Array<{ at: Date; kg: number }> = [];
  for (let i = 0; i <= DAYS_BACK; i++) {
    if (i === 4 || i === 9) continue; // two missed days
    const trajectory = START_KG + ((GOAL_KG - START_KG) * i) / TARGET_WINDOW_DAYS;
    const noise = (rnd() - 0.5) * 0.6;
    const kg = Math.round((trajectory + noise) * 10) / 10;
    const at = addDays(today, -(DAYS_BACK - i));
    inserts.push({ at, kg });
  }
  // Pin "today" to a clean round number so the hero readout looks intentional.
  inserts[inserts.length - 1] = { at: today, kg: 79.0 };

  for (const e of inserts) {
    await addWeightEntry({ at: e.at, kg: e.kg });
  }

  // Set the goal so the optimal trajectory + goal line + projected dashed
  // all have something to draw against.
  await updateWeightPreferences({
    startKg: START_KG,
    targetKg: GOAL_KG,
    targetDate: addDays(today, TARGET_WINDOW_DAYS - DAYS_BACK),
  });

  return { inserted: inserts.length };
}
