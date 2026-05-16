/**
 * Live readout of today's Move-ring data from HealthKit (active kcal).
 *
 * Refreshes on three triggers:
 *   1. Mount
 *   2. App foreground (the watch records calories passively while the
 *      app is in the background)
 *   3. A coarse minute tick so the value drifts upward naturally if
 *      the user keeps the app open during activity
 *
 * Returns `kcal: null` when HK is unauthorized — the home screen
 * renders an empty ring + a '—' legend in that case and leaves
 * prompting to the workouts connect-flow surfaces.
 */

import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  MOVE_PERMISSIONS,
  MOVE_TARGET_KCAL,
  getTodayMoveKcal,
} from '@/src/lib/healthkit/move';
import { useHkAuthState } from '@/src/lib/healthkit/auth';
import { useWorkoutPreferences } from '@/src/hooks/use-workout-preferences';

const REFRESH_INTERVAL_MS = 60_000;

export type TodayMove = {
  /** Active calories burned today, or null when HK auth isn't granted. */
  readonly kcal: number | null;
  /** Move goal in kcal — currently constant; preference later. */
  readonly target: number;
  /** Convenience: clamped 0..1 progress used to drive the ring fill. */
  readonly pct: number;
};

export function useTodayMove(): TodayMove {
  const auth = useHkAuthState(MOVE_PERMISSIONS);
  const prefs = useWorkoutPreferences();
  const [kcal, setKcal] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      getTodayMoveKcal()
        .then((v) => {
          if (!cancelled) setKcal(v);
        })
        .catch(() => {
          if (!cancelled) setKcal(null);
        });
    };

    // Skip polling entirely when HK isn't granted — the lib helper
    // would short-circuit too, but avoiding the call saves a HK
    // round-trip per minute on first-run installs.
    if (auth !== 'granted') {
      setKcal(null);
      return () => {
        cancelled = true;
      };
    }

    tick();
    const interval = setInterval(tick, REFRESH_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') tick();
    });
    return () => {
      cancelled = true;
      clearInterval(interval);
      sub.remove();
    };
  }, [auth]);

  // Fall back to the library constant when prefs haven't seeded yet
  // (one frame on cold boot). Once the singleton row exists this reads
  // the user's chosen target from workout_preferences.move_target_kcal.
  const target = prefs?.moveTargetKcal ?? MOVE_TARGET_KCAL;
  const pct = kcal === null || target <= 0
    ? 0
    : Math.max(0, Math.min(1, kcal / target));

  return { kcal, target, pct };
}
