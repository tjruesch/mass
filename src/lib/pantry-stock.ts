/**
 * Pantry stock status helpers. Combines a row's `currentQty` +
 * `lowThreshold` with the week's required quantity (from meal_plan)
 * to produce a five-state status:
 *
 *   - `untracked`: stock tracking off (currentQty IS NULL).
 *   - `out`:        currentQty <= 0.
 *   - `short`:      have some, but not enough for the week's planned
 *                   demand. Triggers when required > 0 AND
 *                   currentQty < required.
 *   - `low`:        either currentQty < lowThreshold (manual), or
 *                   within 30 % of required (auto, "running close").
 *   - `ok`:         enough on hand for the week + above threshold.
 */

import type { PantryCategory, PantryItem } from '@/src/db/schema';

export type StockStatus = 'out' | 'short' | 'low' | 'ok' | 'untracked';

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

/**
 * Compute a row's status. `required` is the qty the week's planned-
 * but-not-yet-logged meals will use; 0 when no plan demand exists.
 */
export function stockStatusFor(
  item: PantryItem,
  required: number = 0,
): StockStatus {
  // `null` qty = stock tracking not enabled for this item. UI
  // surfaces it inside its category section but without a status
  // pip, and excludes from summary counts.
  if (item.currentQty === null) return 'untracked';
  if (item.currentQty <= 0) return 'out';
  if (required > 0 && item.currentQty < required) return 'short';
  if (item.lowThreshold !== null && item.currentQty < item.lowThreshold) {
    return 'low';
  }
  // Auto-low when within 30 % of the planned demand — gives the user
  // a heads-up before the bucket flips to `short`.
  if (required > 0 && item.currentQty < required * 1.3) return 'low';
  return 'ok';
}

/** Sort key for category sections so problems surface first. */
const STATUS_ORDER: Record<StockStatus, number> = {
  out: 0,
  short: 1,
  low: 2,
  ok: 3,
  untracked: 4,
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
