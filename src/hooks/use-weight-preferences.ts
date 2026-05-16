import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/src/db';
import { weightPreferences, type WeightPreferences } from '@/src/db/schema';

/**
 * Live singleton row. Returns `null` for the very first frame before the
 * seed (driven from app/_layout.tsx) lands — callers should handle that.
 */
export function useWeightPreferences(): WeightPreferences | null {
  const { data } = useLiveQuery(db.select().from(weightPreferences).limit(1));
  return data?.[0] ?? null;
}
