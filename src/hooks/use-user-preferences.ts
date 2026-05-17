/**
 * Reactive user-preferences singleton (#13). Mirrors the other
 * preference hooks (fasting/water/weight/meal/workout). Returns the
 * full row + the trimmed display name for convenience.
 */

import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/src/db';
import { userPreferences, type UserPreferences } from '@/src/db/schema';

export type UserPreferencesState = {
  readonly prefs: UserPreferences | null;
  /** Trimmed `displayName` or null when empty/missing. */
  readonly displayName: string | null;
};

export function useUserPreferences(): UserPreferencesState {
  const { data } = useLiveQuery(
    db.select().from(userPreferences).limit(1),
  );
  const prefs = data?.[0] ?? null;
  const raw = prefs?.displayName ?? null;
  const trimmed = raw === null ? null : raw.trim();
  return {
    prefs,
    displayName: trimmed === '' ? null : trimmed,
  };
}
