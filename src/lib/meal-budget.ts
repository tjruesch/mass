/**
 * Daily kcal budget math (#92). Centralises the formula so the home
 * macros card, the /meals hero, and the settings screen all derive
 * the same budget from one place.
 *
 * Pipeline:
 *   weight_kg + activityLevel → tdeeKcal
 *   tdeeKcal − rateDeficit(weightRate) → budget   (deficit mode)
 *   manualBudgetKcal                  → budget   (manual mode)
 *
 * TDEE uses Mifflin-St Jeor as a base × activity multiplier. Without
 * height/age/sex on `user_profile` (a follow-up), we use a simplified
 * `BMR ≈ 22 × weight_kg` adult-male approximation. Good enough for v1;
 * the user can hand-tune via the activity preset or override manual
 * budget.
 */

import type {
  ActivityLevel,
  MacroPreset,
  MealPreferences,
  WeightRate,
} from '@/src/db/schema';

/** kcal/day deficit (positive = cut, negative = surplus) per weight-rate preset. */
export const WEIGHT_RATE_DEFICIT: Record<WeightRate, number> = {
  gentle: 250, // ≈ −0.25 kg/wk
  steady: 500, // ≈ −0.5  kg/wk
  aggressive: 1000, // ≈ −1.0  kg/wk
  maintain: 0,
  gain: -500, // ≈ +0.5  kg/wk surplus
};

/** Display labels (matching the design source). */
export const WEIGHT_RATE_LABELS: Record<
  WeightRate,
  { value: string; label: string }
> = {
  gentle: { value: '−0.25', label: 'gentle' },
  steady: { value: '−0.5', label: 'steady' },
  aggressive: { value: '−1.0', label: 'aggressive' },
  maintain: { value: '0', label: 'maintain' },
  gain: { value: '+0.5', label: 'gain' },
};

/** Mifflin-St Jeor activity multiplier. */
export const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.4,
  moderate: 1.55,
  active: 1.7,
};

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'desk',
  light: 'light',
  moderate: 'moderate',
  active: 'active',
};

/** v1 BMR approximation. Adult-male, in kcal/day. Use `weight_kg × 22`
 *  as a Mifflin-St Jeor stand-in until `user_profile` (h/age/sex) lands. */
const BMR_PER_KG = 22;

export type MacroSplit = {
  protein: number;
  carbs: number;
  fat: number;
};

/** Three preset macro splits the design surfaces. */
export const MACRO_PRESETS: Record<
  Exclude<MacroPreset, 'custom'>,
  MacroSplit
> = {
  balanced: { protein: 30, carbs: 45, fat: 25 },
  protein: { protein: 40, carbs: 30, fat: 30 },
  endurance: { protein: 20, carbs: 50, fat: 30 },
};

/** Compute TDEE from latest weight + activity. Falls back to 75 kg
 *  (rough adult median) when no weigh-in is recorded yet. */
export function computeTdee(
  weightKg: number | null,
  activity: ActivityLevel,
): number {
  const wk = weightKg ?? 75;
  const bmr = wk * BMR_PER_KG;
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activity]);
}

/** Daily kcal budget given current preferences. */
export function computeBudget(prefs: MealPreferences): number {
  if (prefs.goalMode === 'budget') return prefs.manualBudgetKcal;
  // Deficit mode: subtract the weight-rate deficit from stored TDEE.
  // `gain` flips sign because the deficit is negative.
  const deficit = WEIGHT_RATE_DEFICIT[prefs.weightRate];
  return Math.max(800, prefs.tdeeKcal - deficit); // floor at 800 to avoid pathologies
}

/** Effective deficit (cut, +; surplus, −) given current preferences. */
export function effectiveDeficit(prefs: MealPreferences): number {
  if (prefs.goalMode === 'budget') return prefs.tdeeKcal - prefs.manualBudgetKcal;
  return WEIGHT_RATE_DEFICIT[prefs.weightRate];
}

/** Target macros in grams, derived from the budget + macro split. */
export function computeMacroTargets(
  prefs: MealPreferences,
  budgetKcal: number,
): { proteinG: number; carbsG: number; fatG: number } {
  const pKcal = budgetKcal * (prefs.macroPctProtein / 100);
  const cKcal = budgetKcal * (prefs.macroPctCarbs / 100);
  const fKcal = budgetKcal * (prefs.macroPctFat / 100);
  return {
    proteinG: Math.round(pKcal / 4),
    carbsG: Math.round(cKcal / 4),
    fatG: Math.round(fKcal / 9),
  };
}

/**
 * "On pace" heuristic. Compares actual consumption pct vs the
 * fraction of the day elapsed within a 06:00–22:00 awake window.
 * Returns:
 *   'on-pace' — within ±10pp of expected
 *   'behind'  — consumption pct trails expected by > 10pp (i.e. user
 *               is eating slowly; may struggle to hit budget)
 *   'over'    — consumption is over budget already
 */
export type PaceState = 'on-pace' | 'behind' | 'over';
export function pace(consumed: number, budget: number, now: Date = new Date()): PaceState {
  if (budget <= 0) return 'on-pace';
  if (consumed > budget) return 'over';
  const hour = now.getHours() + now.getMinutes() / 60;
  // Window 06..22 = 16h awake. Outside that, peg to 0 / 1.
  const awakeStart = 6;
  const awakeEnd = 22;
  let expected: number;
  if (hour <= awakeStart) expected = 0;
  else if (hour >= awakeEnd) expected = 1;
  else expected = (hour - awakeStart) / (awakeEnd - awakeStart);
  const consumedPct = consumed / budget;
  if (consumedPct < expected - 0.1) return 'behind';
  return 'on-pace';
}
