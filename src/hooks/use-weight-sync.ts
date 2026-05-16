/**
 * Drives HealthKit body-mass pulls on app foreground and when auth flips
 * to granted. One call from `app/_layout.tsx` keeps the local mirror
 * fresh across the whole app — individual screens don't need to wire it.
 *
 * Sync is gated on the auth state from `useHkAuthState` and on
 * `weight_preferences.autoImportHealthKit` (checked inside the adapter).
 * Disabled until `enabled` flips true so the seed/migration order is
 * respected (queries hit tables; tables come from migrations).
 */

import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { db } from '@/src/db';
import { hkSyncCursor } from '@/src/db/schema';
import { useHkAuthState } from '@/src/lib/healthkit/auth';
import { BODY_MASS_PERMISSIONS, syncWeightFromHealthKit } from '@/src/lib/healthkit/weight';

const BODY_MASS_IDENTIFIER = 'HKQuantityTypeIdentifierBodyMass';

/**
 * Live last-sync time for body-mass. Drives the "last sync HH:MM"
 * subline on the quick-log row. Returns null when no sync has run yet.
 */
export function useLastWeightSyncAt(): Date | null {
  const { data } = useLiveQuery(
    db
      .select()
      .from(hkSyncCursor)
      .where(eq(hkSyncCursor.type, BODY_MASS_IDENTIFIER))
      .limit(1),
  );
  return data?.[0]?.lastSyncedAt ?? null;
}

export function useWeightAutoSync({ enabled }: { enabled: boolean }): void {
  const auth = useHkAuthState(BODY_MASS_PERMISSIONS);

  useEffect(() => {
    if (!enabled || auth !== 'granted') return;

    const run = () => {
      syncWeightFromHealthKit().catch((err) => {
        console.warn('Weight HK sync failed:', err);
      });
    };

    // Initial pull once auth lands.
    run();

    // Re-pull on every foreground transition while auth stays granted.
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') run();
    });
    return () => sub.remove();
  }, [enabled, auth]);
}
