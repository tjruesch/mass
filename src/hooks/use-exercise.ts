/**
 * Live readout of today's exercise minutes from HealthKit.
 *
 * Refreshes on three triggers:
 *   1. Mount
 *   2. App foreground (the user may have moved while the app was
 *      backgrounded; the watch records exercise time passively)
 *   3. A coarse minute tick so the value drifts upward naturally if
 *      the user keeps the app open during a walk
 *
 * Returns `minutes: null` when HK is unauthorized — the home screen
 * renders 0 on the ring in that case and leaves prompting to the
 * connect-flow surfaces.
 */

import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import {
  EXERCISE_PERMISSIONS,
  MOVE_TARGET_MIN,
  getTodayExerciseMinutes,
} from '@/src/lib/healthkit/exercise';
import { useHkAuthState } from '@/src/lib/healthkit/auth';

const REFRESH_INTERVAL_MS = 60_000;

export type TodayExercise = {
  /** Minutes accumulated today, or null when HK auth isn't granted. */
  readonly minutes: number | null;
  /** Move-time goal in minutes — currently constant; preference later. */
  readonly target: number;
  /** Convenience: clamped 0..1 progress used to drive the ring fill. */
  readonly pct: number;
};

export function useTodayExerciseMinutes(): TodayExercise {
  const auth = useHkAuthState(EXERCISE_PERMISSIONS);
  const [minutes, setMinutes] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      getTodayExerciseMinutes()
        .then((m) => {
          if (!cancelled) setMinutes(m);
        })
        .catch(() => {
          if (!cancelled) setMinutes(null);
        });
    };

    // Don't bother polling if HK isn't granted — `getHkAuthState` inside
    // the lib helper would short-circuit anyway, but skipping saves a
    // round-trip every minute on first-run installs.
    if (auth !== 'granted') {
      setMinutes(null);
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

  const target = MOVE_TARGET_MIN;
  const pct =
    minutes === null ? 0 : Math.max(0, Math.min(1, minutes / target));

  return { minutes, target, pct };
}
