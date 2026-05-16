/**
 * Bundled food database for pantry autofill (#91). Per-100g macros +
 * category for ~120 common pantry items. Hand-curated; lean toward
 * generic foods over brands (brand is a separate field on the pantry
 * row that the user fills in).
 *
 * Values are pulled from publicly-available nutrition tables (USDA
 * FoodData Central + Open Food Facts averages) and rounded to whole /
 * one-decimal values matching what's on European nutrition labels.
 * They're estimates — the user can edit after autofill.
 *
 * Naming convention: simple English noun form. Aliases include
 * common variants (e.g., "ground beef" + "minced beef"). Match is
 * case-insensitive substring against name OR any alias.
 */

import type { PantryCategory } from '@/src/db/schema';

export type FoodEntry = {
  readonly name: string;
  readonly category: PantryCategory;
  /** Per 100g unless noted. */
  readonly kcal: number;
  readonly proteinG: number;
  readonly carbsG: number;
  readonly fatG: number;
  /** Alternate names. Lower-case. Empty array if only the canonical
   *  name should match. */
  readonly aliases: ReadonlyArray<string>;
};

export const FOOD_DB: ReadonlyArray<FoodEntry> = [
  // ── Fresh — fruit ──────────────────────────────────────────────
  { name: 'Apple', category: 'fresh', kcal: 52, proteinG: 0.3, carbsG: 14, fatG: 0.2, aliases: [] },
  { name: 'Banana', category: 'fresh', kcal: 89, proteinG: 1.1, carbsG: 23, fatG: 0.3, aliases: [] },
  { name: 'Orange', category: 'fresh', kcal: 47, proteinG: 0.9, carbsG: 12, fatG: 0.1, aliases: [] },
  { name: 'Blueberries', category: 'fresh', kcal: 57, proteinG: 0.7, carbsG: 14, fatG: 0.3, aliases: ['blueberry'] },
  { name: 'Strawberries', category: 'fresh', kcal: 32, proteinG: 0.7, carbsG: 7.7, fatG: 0.3, aliases: ['strawberry'] },
  { name: 'Raspberries', category: 'fresh', kcal: 52, proteinG: 1.2, carbsG: 12, fatG: 0.7, aliases: ['raspberry'] },
  { name: 'Blackberries', category: 'fresh', kcal: 43, proteinG: 1.4, carbsG: 10, fatG: 0.5, aliases: ['blackberry'] },
  { name: 'Grapes', category: 'fresh', kcal: 69, proteinG: 0.7, carbsG: 18, fatG: 0.2, aliases: ['grape'] },
  { name: 'Lemon', category: 'fresh', kcal: 29, proteinG: 1.1, carbsG: 9, fatG: 0.3, aliases: [] },
  { name: 'Lime', category: 'fresh', kcal: 30, proteinG: 0.7, carbsG: 11, fatG: 0.2, aliases: [] },
  { name: 'Mango', category: 'fresh', kcal: 60, proteinG: 0.8, carbsG: 15, fatG: 0.4, aliases: [] },
  { name: 'Pineapple', category: 'fresh', kcal: 50, proteinG: 0.5, carbsG: 13, fatG: 0.1, aliases: [] },
  { name: 'Watermelon', category: 'fresh', kcal: 30, proteinG: 0.6, carbsG: 8, fatG: 0.2, aliases: [] },
  { name: 'Peach', category: 'fresh', kcal: 39, proteinG: 0.9, carbsG: 10, fatG: 0.3, aliases: [] },
  { name: 'Pear', category: 'fresh', kcal: 57, proteinG: 0.4, carbsG: 15, fatG: 0.1, aliases: [] },
  { name: 'Plum', category: 'fresh', kcal: 46, proteinG: 0.7, carbsG: 11, fatG: 0.3, aliases: [] },
  { name: 'Cherries', category: 'fresh', kcal: 50, proteinG: 1.0, carbsG: 12, fatG: 0.3, aliases: ['cherry'] },
  { name: 'Kiwi', category: 'fresh', kcal: 61, proteinG: 1.1, carbsG: 15, fatG: 0.5, aliases: [] },
  { name: 'Avocado', category: 'fresh', kcal: 160, proteinG: 2, carbsG: 9, fatG: 15, aliases: [] },

  // ── Fresh — vegetable ─────────────────────────────────────────
  { name: 'Tomato', category: 'fresh', kcal: 18, proteinG: 0.9, carbsG: 3.9, fatG: 0.2, aliases: [] },
  { name: 'Cucumber', category: 'fresh', kcal: 16, proteinG: 0.7, carbsG: 3.6, fatG: 0.1, aliases: [] },
  { name: 'Lettuce', category: 'fresh', kcal: 15, proteinG: 1.4, carbsG: 2.9, fatG: 0.2, aliases: [] },
  { name: 'Spinach', category: 'fresh', kcal: 23, proteinG: 2.9, carbsG: 3.6, fatG: 0.4, aliases: [] },
  { name: 'Kale', category: 'fresh', kcal: 35, proteinG: 2.9, carbsG: 4.4, fatG: 1.5, aliases: [] },
  { name: 'Broccoli', category: 'fresh', kcal: 34, proteinG: 2.8, carbsG: 7, fatG: 0.4, aliases: [] },
  { name: 'Cauliflower', category: 'fresh', kcal: 25, proteinG: 1.9, carbsG: 5, fatG: 0.3, aliases: [] },
  { name: 'Carrots', category: 'fresh', kcal: 41, proteinG: 0.9, carbsG: 10, fatG: 0.2, aliases: ['carrot'] },
  { name: 'Bell pepper', category: 'fresh', kcal: 31, proteinG: 1, carbsG: 6, fatG: 0.3, aliases: ['pepper', 'paprika'] },
  { name: 'Onion', category: 'fresh', kcal: 40, proteinG: 1.1, carbsG: 9.3, fatG: 0.1, aliases: [] },
  { name: 'Garlic', category: 'fresh', kcal: 149, proteinG: 6.4, carbsG: 33, fatG: 0.5, aliases: [] },
  { name: 'Mushrooms', category: 'fresh', kcal: 22, proteinG: 3.1, carbsG: 3.3, fatG: 0.3, aliases: ['mushroom'] },
  { name: 'Zucchini', category: 'fresh', kcal: 17, proteinG: 1.2, carbsG: 3.1, fatG: 0.3, aliases: ['courgette'] },
  { name: 'Asparagus', category: 'fresh', kcal: 20, proteinG: 2.2, carbsG: 3.9, fatG: 0.1, aliases: [] },
  { name: 'Brussels sprouts', category: 'fresh', kcal: 43, proteinG: 3.4, carbsG: 9, fatG: 0.3, aliases: [] },
  { name: 'Sweet potato', category: 'fresh', kcal: 86, proteinG: 1.6, carbsG: 20, fatG: 0.1, aliases: [] },
  { name: 'Potato', category: 'fresh', kcal: 77, proteinG: 2, carbsG: 17, fatG: 0.1, aliases: [] },
  { name: 'Corn', category: 'fresh', kcal: 86, proteinG: 3.3, carbsG: 19, fatG: 1.4, aliases: ['sweetcorn'] },
  { name: 'Green peas', category: 'fresh', kcal: 81, proteinG: 5.4, carbsG: 14, fatG: 0.4, aliases: ['peas'] },
  { name: 'Green beans', category: 'fresh', kcal: 31, proteinG: 1.8, carbsG: 7, fatG: 0.2, aliases: [] },
  { name: 'Mixed greens', category: 'fresh', kcal: 17, proteinG: 1.5, carbsG: 3, fatG: 0.2, aliases: ['salad mix', 'spring mix'] },

  // ── Protein ───────────────────────────────────────────────────
  { name: 'Chicken breast', category: 'protein', kcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6, aliases: ['chicken'] },
  { name: 'Chicken thigh', category: 'protein', kcal: 209, proteinG: 26, carbsG: 0, fatG: 11, aliases: [] },
  { name: 'Ground beef (85/15)', category: 'protein', kcal: 215, proteinG: 26, carbsG: 0, fatG: 12, aliases: ['minced beef', 'beef mince'] },
  { name: 'Ground turkey', category: 'protein', kcal: 148, proteinG: 21, carbsG: 0, fatG: 7, aliases: ['turkey mince'] },
  { name: 'Salmon', category: 'protein', kcal: 208, proteinG: 20, carbsG: 0, fatG: 13, aliases: [] },
  { name: 'Tuna (canned in water)', category: 'protein', kcal: 116, proteinG: 26, carbsG: 0, fatG: 1, aliases: ['tuna'] },
  { name: 'Shrimp', category: 'protein', kcal: 99, proteinG: 24, carbsG: 0.2, fatG: 0.3, aliases: ['prawns'] },
  { name: 'Eggs', category: 'protein', kcal: 155, proteinG: 13, carbsG: 1.1, fatG: 11, aliases: ['egg'] },
  { name: 'Egg whites', category: 'protein', kcal: 52, proteinG: 11, carbsG: 0.7, fatG: 0.2, aliases: [] },
  { name: 'Bacon', category: 'protein', kcal: 541, proteinG: 37, carbsG: 1.4, fatG: 42, aliases: [] },
  { name: 'Ham', category: 'protein', kcal: 145, proteinG: 21, carbsG: 1.5, fatG: 6, aliases: [] },
  { name: 'Tofu', category: 'protein', kcal: 76, proteinG: 8, carbsG: 1.9, fatG: 4.8, aliases: [] },
  { name: 'Tempeh', category: 'protein', kcal: 192, proteinG: 20, carbsG: 7.6, fatG: 11, aliases: [] },
  { name: 'Lentils (cooked)', category: 'protein', kcal: 116, proteinG: 9, carbsG: 20, fatG: 0.4, aliases: ['lentil'] },
  { name: 'Black beans', category: 'protein', kcal: 132, proteinG: 8.9, carbsG: 24, fatG: 0.5, aliases: [] },
  { name: 'Chickpeas', category: 'protein', kcal: 164, proteinG: 9, carbsG: 27, fatG: 2.6, aliases: ['garbanzo'] },
  { name: 'Kidney beans', category: 'protein', kcal: 127, proteinG: 8.7, carbsG: 23, fatG: 0.5, aliases: [] },
  { name: 'Salmon fillet', category: 'protein', kcal: 206, proteinG: 22, carbsG: 0, fatG: 13, aliases: [] },

  // ── Dairy ─────────────────────────────────────────────────────
  { name: 'Whole milk', category: 'dairy', kcal: 61, proteinG: 3.2, carbsG: 4.8, fatG: 3.3, aliases: ['milk'] },
  { name: 'Milk (2%)', category: 'dairy', kcal: 50, proteinG: 3.3, carbsG: 4.8, fatG: 2, aliases: ['semi-skim milk'] },
  { name: 'Skim milk', category: 'dairy', kcal: 34, proteinG: 3.4, carbsG: 5, fatG: 0.1, aliases: ['fat-free milk'] },
  { name: 'Greek yogurt', category: 'dairy', kcal: 59, proteinG: 10, carbsG: 3.6, fatG: 0.4, aliases: ['greek yoghurt'] },
  { name: 'Yogurt (plain)', category: 'dairy', kcal: 61, proteinG: 3.5, carbsG: 4.7, fatG: 3.3, aliases: ['yoghurt'] },
  { name: 'Cottage cheese', category: 'dairy', kcal: 98, proteinG: 11, carbsG: 3.4, fatG: 4.3, aliases: [] },
  { name: 'Cheddar cheese', category: 'dairy', kcal: 403, proteinG: 25, carbsG: 1.3, fatG: 33, aliases: ['cheddar'] },
  { name: 'Mozzarella', category: 'dairy', kcal: 280, proteinG: 28, carbsG: 3.1, fatG: 17, aliases: [] },
  { name: 'Feta', category: 'dairy', kcal: 264, proteinG: 14, carbsG: 4.1, fatG: 21, aliases: [] },
  { name: 'Parmesan', category: 'dairy', kcal: 431, proteinG: 38, carbsG: 4.1, fatG: 29, aliases: [] },
  { name: 'Butter', category: 'dairy', kcal: 717, proteinG: 0.9, carbsG: 0.1, fatG: 81, aliases: [] },
  { name: 'Cream cheese', category: 'dairy', kcal: 342, proteinG: 6.2, carbsG: 4.1, fatG: 34, aliases: [] },
  { name: 'Sour cream', category: 'dairy', kcal: 198, proteinG: 2.4, carbsG: 4.6, fatG: 19, aliases: [] },
  { name: 'Almond milk', category: 'dairy', kcal: 17, proteinG: 0.6, carbsG: 0.6, fatG: 1.5, aliases: [] },
  { name: 'Oat milk', category: 'dairy', kcal: 47, proteinG: 1, carbsG: 7.5, fatG: 1.5, aliases: [] },

  // ── Pantry — grains + carbs ──────────────────────────────────
  { name: 'White rice (cooked)', category: 'pantry', kcal: 130, proteinG: 2.7, carbsG: 28, fatG: 0.3, aliases: ['rice', 'jasmine rice', 'basmati rice'] },
  { name: 'Brown rice (cooked)', category: 'pantry', kcal: 123, proteinG: 2.7, carbsG: 26, fatG: 1, aliases: [] },
  { name: 'Rolled oats (dry)', category: 'pantry', kcal: 379, proteinG: 13, carbsG: 68, fatG: 6.5, aliases: ['oats', 'oatmeal'] },
  { name: 'Pasta (cooked)', category: 'pantry', kcal: 131, proteinG: 5, carbsG: 25, fatG: 1.1, aliases: ['spaghetti'] },
  { name: 'White bread', category: 'pantry', kcal: 265, proteinG: 9, carbsG: 49, fatG: 3.2, aliases: ['bread'] },
  { name: 'Whole grain bread', category: 'pantry', kcal: 247, proteinG: 13, carbsG: 41, fatG: 4.2, aliases: ['wholemeal bread'] },
  { name: 'Tortilla', category: 'pantry', kcal: 304, proteinG: 8, carbsG: 50, fatG: 7.5, aliases: [] },
  { name: 'Quinoa (cooked)', category: 'pantry', kcal: 120, proteinG: 4.4, carbsG: 21, fatG: 1.9, aliases: [] },
  { name: 'Couscous (cooked)', category: 'pantry', kcal: 112, proteinG: 3.8, carbsG: 23, fatG: 0.2, aliases: [] },
  { name: 'Granola', category: 'pantry', kcal: 489, proteinG: 12, carbsG: 64, fatG: 21, aliases: [] },
  { name: 'Corn flakes', category: 'pantry', kcal: 357, proteinG: 7, carbsG: 84, fatG: 0.4, aliases: ['cereal'] },
  { name: 'Bagel', category: 'pantry', kcal: 257, proteinG: 10, carbsG: 51, fatG: 1.5, aliases: [] },

  // ── Pantry — nuts + seeds + spreads ─────────────────────────
  { name: 'Peanut butter', category: 'pantry', kcal: 588, proteinG: 25, carbsG: 20, fatG: 50, aliases: [] },
  { name: 'Almond butter', category: 'pantry', kcal: 614, proteinG: 21, carbsG: 19, fatG: 56, aliases: [] },
  { name: 'Almonds', category: 'pantry', kcal: 579, proteinG: 21, carbsG: 22, fatG: 50, aliases: ['almond'] },
  { name: 'Walnuts', category: 'pantry', kcal: 654, proteinG: 15, carbsG: 14, fatG: 65, aliases: ['walnut'] },
  { name: 'Cashews', category: 'pantry', kcal: 553, proteinG: 18, carbsG: 30, fatG: 44, aliases: ['cashew'] },
  { name: 'Peanuts', category: 'pantry', kcal: 567, proteinG: 26, carbsG: 16, fatG: 49, aliases: ['peanut'] },
  { name: 'Sunflower seeds', category: 'pantry', kcal: 584, proteinG: 21, carbsG: 20, fatG: 51, aliases: [] },
  { name: 'Chia seeds', category: 'pantry', kcal: 486, proteinG: 17, carbsG: 42, fatG: 31, aliases: [] },
  { name: 'Flax seeds', category: 'pantry', kcal: 534, proteinG: 18, carbsG: 29, fatG: 42, aliases: ['linseed'] },
  { name: 'Hummus', category: 'pantry', kcal: 166, proteinG: 7.9, carbsG: 14, fatG: 9.6, aliases: [] },

  // ── Pantry — oils + sweeteners + extras ─────────────────────
  { name: 'Olive oil', category: 'pantry', kcal: 884, proteinG: 0, carbsG: 0, fatG: 100, aliases: [] },
  { name: 'Coconut oil', category: 'pantry', kcal: 862, proteinG: 0, carbsG: 0, fatG: 100, aliases: [] },
  { name: 'Honey', category: 'pantry', kcal: 304, proteinG: 0.3, carbsG: 82, fatG: 0, aliases: [] },
  { name: 'Maple syrup', category: 'pantry', kcal: 260, proteinG: 0, carbsG: 67, fatG: 0.2, aliases: [] },
  { name: 'Sugar', category: 'pantry', kcal: 387, proteinG: 0, carbsG: 100, fatG: 0, aliases: [] },
  { name: 'Jam', category: 'pantry', kcal: 278, proteinG: 0.4, carbsG: 69, fatG: 0.1, aliases: ['preserves'] },
  { name: 'Dark chocolate', category: 'pantry', kcal: 598, proteinG: 7.8, carbsG: 46, fatG: 43, aliases: [] },
  { name: 'Milk chocolate', category: 'pantry', kcal: 535, proteinG: 7.6, carbsG: 59, fatG: 30, aliases: [] },
  { name: 'Whey protein', category: 'pantry', kcal: 374, proteinG: 78, carbsG: 8, fatG: 4, aliases: ['whey', 'protein powder'] },
  { name: 'Protein bar', category: 'pantry', kcal: 380, proteinG: 30, carbsG: 35, fatG: 13, aliases: [] },
  { name: 'Soy sauce', category: 'pantry', kcal: 53, proteinG: 8, carbsG: 5, fatG: 0.6, aliases: [] },
  { name: 'Ketchup', category: 'pantry', kcal: 112, proteinG: 1.7, carbsG: 27, fatG: 0.4, aliases: [] },
  { name: 'Mayonnaise', category: 'pantry', kcal: 680, proteinG: 1, carbsG: 0.6, fatG: 75, aliases: ['mayo'] },
  { name: 'Mustard', category: 'pantry', kcal: 66, proteinG: 4.4, carbsG: 5.3, fatG: 4, aliases: [] },
  { name: 'Hot sauce', category: 'pantry', kcal: 11, proteinG: 0.6, carbsG: 1.8, fatG: 0.2, aliases: [] },
  { name: 'Vinegar', category: 'pantry', kcal: 21, proteinG: 0, carbsG: 0.9, fatG: 0, aliases: [] },
];
