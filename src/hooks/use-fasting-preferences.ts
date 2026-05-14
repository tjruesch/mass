import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/src/db';
import { fastingPreferences, type FastingPreferences } from '@/src/db/schema';

/**
 * Live singleton row. Returns `null` only on the very first frame before the
 * seed (driven from app/_layout.tsx) finishes — every screen that reads this
 * should handle the loading frame.
 */
export function useFastingPreferences(): FastingPreferences | null {
  const { data } = useLiveQuery(db.select().from(fastingPreferences).limit(1));
  return data?.[0] ?? null;
}
