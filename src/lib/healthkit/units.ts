/**
 * Quantity unit conversion for HK reads.
 *
 * iOS reports each `Quantity` (`{ unit, quantity }`) in the locale the
 * user picked in the Health app, not in canonical units. A workout's
 * `totalDistance.quantity` might be 5 with `unit = 'mi'`, not the
 * canonical 8046.72 meters. Slice 4 originally assumed kcal + m and
 * silently stored the wrong number for non-US-locale users (#74).
 *
 * The two converters below normalise to our canonical storage units:
 *   - energy → kcal
 *   - distance → meters
 *
 * Unknown unit strings return null + log a warning so a future locale
 * surprise surfaces visibly instead of corrupting data.
 */

import type { Quantity } from '@kingstinct/react-native-healthkit';

/**
 * Multiplier table — multiply `quantity` by the value to get kcal.
 * Includes the casing variants HealthKit emits across iOS versions.
 */
const ENERGY_TO_KCAL: Record<string, number> = {
  kcal: 1,
  Cal: 1, // dietary "Calorie", aka kilocalorie
  cal: 1 / 1000, // small calorie
  kJ: 1 / 4.184,
  J: 1 / 4184,
};

const DISTANCE_TO_M: Record<string, number> = {
  m: 1,
  km: 1000,
  cm: 0.01,
  mm: 0.001,
  mi: 1609.344,
  yd: 0.9144,
  ft: 0.3048,
  in: 0.0254,
};

/**
 * Convert an HK energy Quantity to canonical kcal. Returns null when
 * the unit is unknown so callers can store null + skip the field.
 */
export function quantityToKcal(q: Quantity | null | undefined): number | null {
  if (!q) return null;
  if (!Number.isFinite(q.quantity)) return null;
  const factor = ENERGY_TO_KCAL[q.unit];
  if (factor === undefined) {
    console.warn(`Unknown HK energy unit: "${q.unit}" (qty ${q.quantity}). Skipping.`);
    return null;
  }
  return q.quantity * factor;
}

/**
 * Convert an HK distance Quantity to canonical meters. Returns null when
 * the unit is unknown so callers can store null + skip the field.
 */
export function quantityToMeters(q: Quantity | null | undefined): number | null {
  if (!q) return null;
  if (!Number.isFinite(q.quantity)) return null;
  const factor = DISTANCE_TO_M[q.unit];
  if (factor === undefined) {
    console.warn(`Unknown HK distance unit: "${q.unit}" (qty ${q.quantity}). Skipping.`);
    return null;
  }
  return q.quantity * factor;
}
