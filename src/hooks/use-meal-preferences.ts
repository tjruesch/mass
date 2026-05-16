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
};

const FALLBACK_BUDGET = 1820;
const FALLBACK_DEFICIT = 1000;
const FALLBACK_MACROS = { proteinG: 137, carbsG: 205, fatG: 51 };

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
    };
  }
  const budgetKcal = computeBudget(prefs);
  const deficitKcal = effectiveDeficit(prefs);
  const macros = computeMacroTargets(prefs, budgetKcal);
  return {
    prefs,
    budgetKcal,
    deficitKcal,
    proteinTargetG: macros.proteinG,
    carbsTargetG: macros.carbsG,
    fatTargetG: macros.fatG,
  };
}
