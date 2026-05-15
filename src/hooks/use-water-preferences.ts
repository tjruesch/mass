import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/src/db';
import { waterPreferences, type WaterPreferences } from '@/src/db/schema';

/**
 * Live singleton row. Returns `null` for the very first frame before the seed
 * (driven from app/_layout.tsx) lands — callers should handle that.
 */
export function useWaterPreferences(): WaterPreferences | null {
  const { data } = useLiveQuery(db.select().from(waterPreferences).limit(1));
  return data?.[0] ?? null;
}
