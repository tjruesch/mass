/**
 * Drives HealthKit workout pulls on app foreground and when auth flips
 * to granted. Mirrors `use-weight-sync.ts` — one call from `_layout.tsx`
 * keeps the workout mirror fresh app-wide.
 */

import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { db } from '@/src/db';
import { hkSyncCursor } from '@/src/db/schema';
import { useHkAuthState } from '@/src/lib/healthkit/auth';
import { WORKOUTS_CURSOR_KEY } from '@/src/lib/healthkit/sync';
import {
  WORKOUT_PERMISSIONS,
  syncWorkoutsFromHealthKit,
} from '@/src/lib/healthkit/workouts';

/** Live last-sync time for HKWorkouts. Drives the "last sync HH:MM" subline. */
export function useLastWorkoutSyncAt(): Date | null {
  const { data } = useLiveQuery(
    db
      .select()
      .from(hkSyncCursor)
      .where(eq(hkSyncCursor.type, WORKOUTS_CURSOR_KEY))
      .limit(1),
  );
  return data?.[0]?.lastSyncedAt ?? null;
}

export function useWorkoutAutoSync({ enabled }: { enabled: boolean }): void {
  const auth = useHkAuthState(WORKOUT_PERMISSIONS);

  useEffect(() => {
    if (!enabled || auth !== 'granted') return;

    const run = () => {
      syncWorkoutsFromHealthKit().catch((err) => {
        console.warn('Workout HK sync failed:', err);
      });
    };

    run();

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') run();
    });
    return () => sub.remove();
  }, [enabled, auth]);
}
