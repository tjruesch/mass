/**
 * Search the bundled food DB (#91). Substring match against name +
 * aliases, case-insensitive. Returns up to `limit` results, ranked
 * by:
 *   1. Exact name match (case-insensitive)
 *   2. Name starts-with the query
 *   3. Alias starts-with the query
 *   4. Substring anywhere in name/alias
 *
 * The DB is small (~120 entries) so a linear scan is fine; we don't
 * need an index or pre-tokenisation.
 */

import { FOOD_DB, type FoodEntry } from '@/src/data/food-db';

/** Minimum chars before we bother running a search. Below this the
 *  result list is so long the UI is more noise than help. */
export const FOOD_DB_MIN_QUERY = 2;

export function searchFoodDb(
  query: string,
  limit: number = 8,
): ReadonlyArray<FoodEntry> {
  const q = query.trim().toLowerCase();
  if (q.length < FOOD_DB_MIN_QUERY) return [];

  type Scored = { entry: FoodEntry; score: number };
  const scored: Scored[] = [];

  for (const entry of FOOD_DB) {
    const name = entry.name.toLowerCase();
    const aliases = entry.aliases.map((a) => a.toLowerCase());

    let score: number | null = null;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 1;
    else if (aliases.some((a) => a === q)) score = 1;
    else if (aliases.some((a) => a.startsWith(q))) score = 2;
    else if (name.includes(q)) score = 3;
    else if (aliases.some((a) => a.includes(q))) score = 4;

    if (score !== null) scored.push({ entry, score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.entry.name.localeCompare(b.entry.name);
  });
  return scored.slice(0, limit).map((s) => s.entry);
}

export type { FoodEntry } from '@/src/data/food-db';
