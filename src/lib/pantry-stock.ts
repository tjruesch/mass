/**
 * Pantry stock status helpers. Pantry rows carry a nullable
 * `currentQty` + nullable `lowThreshold`; combining them gives a
 * four-state status the UI uses for chips, dots, and grouping.
 *
 * The week-plan-driven `short` state ("enough on hand, but not enough
 * for upcoming meals") lands with #95 — it needs the meal_plan table
 * to compute weekly required quantities. Until then, items only flip
 * between `out / low / ok / untracked`.
 */

import type { PantryCategory, PantryItem } from '@/src/db/schema';

export type StockStatus = 'out' | 'low' | 'ok' | 'untracked';

export const PANTRY_CATEGORIES: ReadonlyArray<PantryCategory> = [
  'fresh',
  'protein',
  'dairy',
  'pantry',
];

export const PANTRY_CATEGORY_LABELS: Record<PantryCategory, string> = {
  fresh: 'fresh',
  protein: 'protein',
  dairy: 'dairy',
  pantry: 'pantry',
};

export function stockStatusFor(item: PantryItem): StockStatus {
  // `null` qty = stock tracking not enabled for this item. The legacy
  // back-fill before #90 lands every pantry row in this state. The UI
  // surfaces them inside their category section but without a status
  // pip, and excludes them from the summary counts.
  if (item.currentQty === null) return 'untracked';
  if (item.currentQty <= 0) return 'out';
  if (item.lowThreshold !== null && item.currentQty < item.lowThreshold) {
    return 'low';
  }
  return 'ok';
}

/** Sort key for category sections so `out` items surface first, then
 *  `low`, then `ok`, with `untracked` at the bottom. */
const STATUS_ORDER: Record<StockStatus, number> = {
  out: 0,
  low: 1,
  ok: 2,
  untracked: 3,
};
export function compareStockStatus(a: StockStatus, b: StockStatus): number {
  return STATUS_ORDER[a] - STATUS_ORDER[b];
}

/** Unit to display for current stock. Falls back to the default
 *  serving unit when the item doesn't have a stock-specific unit
 *  (e.g. user only tracks per-serving consumption). */
export function effectiveStockUnit(item: PantryItem): string {
  return item.stockUnit ?? item.defaultServingUnit;
}
