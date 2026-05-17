/**
 * Reactive meal preferences singleton (#92). Mirrors
 * use-water-preferences / use-fasting-preferences.
 *
 * Returns the row plus the *derived* daily kcal budget so consumers
 * (home macros card, /meals hero, /meals-settings) don't each
 * re-implement the formula.
 */

import { useLiveQuery } from 'drizzle-orm/expo-sqlite';

import { db } from '@/src/db';
import { mealPreferences, type MealPreferences } from '@/src/db/schema';
import {
  computeBudget,
  computeMacroTargets,
  effectiveDeficit,
} from '@/src/lib/meal-budget';

export type MealPreferencesState = {
  /** Null while migrations are still running / the singleton hasn't
   *  been seeded yet. Consumers should fall back to a placeholder. */
  readonly prefs: MealPreferences | null;
  /** Derived daily kcal budget (deficit mode subtracts rate from TDEE;
   *  manual mode reads `manualBudgetKcal`). */
  readonly budgetKcal: number;
  /** Effective deficit (cut > 0, surplus < 0). */
  readonly deficitKcal: number;
  /** Macro targets in grams derived from budget × split. */
  readonly proteinTargetG: number;
  readonly carbsTargetG: number;
  readonly fatTargetG: number;
  /** Per-slot share of the budget as a 0..1 fraction. Sums to 1. */
  readonly slotShares: {
    readonly breakfast: number;
    readonly lunch: number;
    readonly dinner: number;
    readonly snack: number;
  };
};

const FALLBACK_BUDGET = 1820;
const FALLBACK_DEFICIT = 1000;
const FALLBACK_MACROS = { proteinG: 137, carbsG: 205, fatG: 51 };
const FALLBACK_SLOT_SHARES = {
  breakfast: 0.25,
  lunch: 0.25,
  dinner: 0.25,
  snack: 0.25,
};

export function useMealPreferences(): MealPreferencesState {
  const { data } = useLiveQuery(
    db.select().from(mealPreferences).limit(1),
  );
  const prefs = data?.[0] ?? null;
  if (prefs === null) {
    return {
      prefs: null,
      budgetKcal: FALLBACK_BUDGET,
      deficitKcal: FALLBACK_DEFICIT,
      proteinTargetG: FALLBACK_MACROS.proteinG,
      carbsTargetG: FALLBACK_MACROS.carbsG,
      fatTargetG: FALLBACK_MACROS.fatG,
      slotShares: FALLBACK_SLOT_SHARES,
    };
  }
  const budgetKcal = computeBudget(prefs);
  const deficitKcal = effectiveDeficit(prefs);
  const macros = computeMacroTargets(prefs, budgetKcal);
  // Slot pcts are integer percentages — convert to 0..1 fractions.
  // Defensive divisor in case the row holds 0/0/0/0 (would happen if
  // a partial migration left them null; doesn't happen via the
  // editor since the UI enforces sum=100, but keep the guard cheap).
  const slotSum =
    prefs.slotPctBreakfast +
    prefs.slotPctLunch +
    prefs.slotPctDinner +
    prefs.slotPctSnack;
  const slotShares =
    slotSum > 0
      ? {
          breakfast: prefs.slotPctBreakfast / slotSum,
          lunch: prefs.slotPctLunch / slotSum,
          dinner: prefs.slotPctDinner / slotSum,
          snack: prefs.slotPctSnack / slotSum,
        }
      : FALLBACK_SLOT_SHARES;
  return {
    prefs,
    budgetKcal,
    deficitKcal,
    proteinTargetG: macros.proteinG,
    carbsTargetG: macros.carbsG,
    fatTargetG: macros.fatG,
    slotShares,
  };
}
