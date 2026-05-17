/**
 * SQLite schema for Maß — single-device, single-user.
 *
 * Conventions
 * ─────────────
 * • Timestamps are stored as integer ms ('timestamp_ms') so Drizzle hands us
 *   real `Date` objects in TS.
 * • Booleans are 0/1 integers — we type them with `mode: 'boolean'`.
 * • Source-of-truth split (from the architecture decision):
 *     – HealthKit owns: steps, HR, active energy.
 *     – HealthKit + local mirror: weight_entries, workout_entries.
 *       `healthkit_uuid` is the dedupe key on re-pulls.
 *     – Local-only: everything else.
 * • Foreign keys use ON DELETE CASCADE where the child has no meaning
 *   without its parent (e.g. meal_items without a meal).
 */

import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

const id = () => integer('id').primaryKey({ autoIncrement: true });
const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`);

// ─── Fasting ──────────────────────────────────────────────────────────────────
export const fastingSessions = sqliteTable('fasting_sessions', {
  id: id(),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  /** Null while the session is active. */
  endedAt: integer('ended_at', { mode: 'timestamp_ms' }),
  /** Target duration when the session began (e.g. 16 for a 16:8 fast). */
  targetHours: integer('target_hours').notNull(),
  notes: text('notes'),
  createdAt: createdAt(),
});

// ─── Hydration ────────────────────────────────────────────────────────────────
export const waterLogs = sqliteTable('water_logs', {
  id: id(),
  at: integer('at', { mode: 'timestamp_ms' }).notNull(),
  ml: integer('ml').notNull(),
  /** What was sipped. tea/coffee count partially toward goal — see water_preferences. */
  kind: text('kind', { enum: ['water', 'tea', 'coffee'] })
    .notNull()
    .default('water'),
  source: text('source', { enum: ['manual', 'voice', 'healthkit'] })
    .notNull()
    .default('manual'),
  createdAt: createdAt(),
});

// ─── Water preferences (singleton, always id=1) ───────────────────────────────
export const waterPreferences = sqliteTable('water_preferences', {
  /** Always 1. Same singleton convention as fasting_preferences. */
  id: integer('id').primaryKey(),
  /** Daily goal in milliliters. Default 3000 (3 L) — matches design. */
  targetMl: integer('target_ml').notNull().default(3000),
  /** Display unit. Storage is always ml; this only controls formatting. */
  unit: text('unit', { enum: ['L', 'ml', 'cups'] })
    .notNull()
    .default('L'),
  /** Quick-add tiles on the detail page. Four slots; ml + free-form label. */
  quickAdd1Ml: integer('quick_add_1_ml').notNull().default(250),
  quickAdd1Label: text('quick_add_1_label').notNull().default('glass'),
  quickAdd2Ml: integer('quick_add_2_ml').notNull().default(350),
  quickAdd2Label: text('quick_add_2_label').notNull().default('cup'),
  quickAdd3Ml: integer('quick_add_3_ml').notNull().default(500),
  quickAdd3Label: text('quick_add_3_label').notNull().default('bottle'),
  quickAdd4Ml: integer('quick_add_4_ml').notNull().default(750),
  quickAdd4Label: text('quick_add_4_label').notNull().default('mug'),
  /** Weekday bitmask. Bit 0 = Monday … bit 6 = Sunday. 127 = every day on. */
  weekdayBitmask: integer('weekday_bitmask').notNull().default(127),
  /** When activity scaling is on, add this many ml to the day's goal per lift session. */
  activityScalingMl: integer('activity_scaling_ml').notNull().default(350),
  activityScalingEnabled: integer('activity_scaling_enabled', { mode: 'boolean' })
    .notNull()
    .default(false),
});

// ─── Pantry (food library) ────────────────────────────────────────────────────
/**
 * Pantry categories used for grouping on the stock screen. Free-form
 * text on the column itself so future categories don't need migrations,
 * but this is the closed set the UI knows how to render. Anything else
 * falls back to `pantry` (the dry-goods catch-all).
 */
export type PantryCategory = 'fresh' | 'protein' | 'dairy' | 'pantry';

export const pantryItems = sqliteTable('pantry_items', {
  id: id(),
  name: text('name').notNull(),
  brand: text('brand'),
  defaultServingQty: real('default_serving_qty').notNull().default(1),
  /** Free-form for now: 'g', 'oz', 'serving', etc. */
  defaultServingUnit: text('default_serving_unit').notNull().default('serving'),
  kcalPerServing: real('kcal_per_serving').notNull(),
  proteinG: real('protein_g').notNull().default(0),
  carbsG: real('carbs_g').notNull().default(0),
  fatG: real('fat_g').notNull().default(0),
  /** One of `PantryCategory`. Defaults to `pantry` for back-compat with
   *  pre-stock rows; the UI groups by this. */
  category: text('category').notNull().default('pantry').$type<PantryCategory>(),
  /** Stock on hand, in `stockUnit`. Null = stock tracking not enabled
   *  for this item — falls back to legacy "no stock" rendering. */
  currentQty: real('current_qty'),
  /** Unit for `currentQty` and `lowThreshold`. Independent of
   *  `defaultServingUnit` (an item can be served in 'g' but stocked in
   *  'ea' for "tuna cans"). Falls back to defaultServingUnit at the UI
   *  layer when null. */
  stockUnit: text('stock_unit'),
  /** Below this `currentQty` the item reads as `low`. Null = no
   *  threshold set, so an item only flips to `out` at qty=0. */
  lowThreshold: real('low_threshold'),
  /** When the user last marked the item restocked. Drives the "last
   *  restocked Xd ago" affordance on the editor. */
  restockedAt: integer('restocked_at', { mode: 'timestamp_ms' }),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
});

// ─── Meals ────────────────────────────────────────────────────────────────────
export const meals = sqliteTable('meals', {
  id: id(),
  /**
   * When the meal was eaten. Null for *library* entries — reusable
   * templates created via the new-meal composer (#87) that haven't
   * been logged yet. Setting eatenAt converts the row into a logged
   * meal (or, more commonly, the composer + log-drawer save separate
   * rows: composer writes eatenAt=null, drawer writes a new row with
   * eatenAt set and items copied).
   */
  eatenAt: integer('eaten_at', { mode: 'timestamp_ms' }),
  /** Free-form label like "Breakfast" or "Leftover thai". */
  name: text('name'),
  /** Roll-ups — kept here so trend queries don't have to sum line items. */
  kcal: real('kcal'),
  proteinG: real('protein_g'),
  carbsG: real('carbs_g'),
  fatG: real('fat_g'),
  notes: text('notes'),
  createdAt: createdAt(),
});

// ─── Meal plan (#95) ──────────────────────────────────────────────────────────
/**
 * One row per (date, slot) the user has planned a library meal for.
 * `dateKey` is a local-calendar `YYYY-MM-DD` string so day-keyed queries
 * stay timezone-stable (we never want yesterday's plan showing up
 * today because the user crossed midnight in a different zone).
 *
 * `mealId` always references a library meal (eatenAt IS NULL). When
 * the user logs a meal, we DO NOT delete the plan entry — the slot
 * keeps its plan + adds a logged meal alongside; /meals decides which
 * to render based on what exists for the slot.
 */
export const mealPlan = sqliteTable(
  'meal_plan',
  {
    id: id(),
    /** Local-calendar 'YYYY-MM-DD'. Matches what `ymd()` in lib/time emits. */
    dateKey: text('date_key').notNull(),
    /** 'breakfast' | 'lunch' | 'dinner' | 'snack' — closed at the app
     *  layer (MEAL_SLOTS). Free text on the column to skip a migration
     *  if we ever add new slot ids. */
    slot: text('slot').notNull(),
    /** Library meal id (meals.eatenAt IS NULL). On delete of the
     *  library meal, the plan entry follows. */
    mealId: integer('meal_id')
      .notNull()
      .references(() => meals.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => ({
    /** One plan per (day, slot). Replacing the plan UPSERTs against this. */
    uniqDaySlot: uniqueIndex('meal_plan_day_slot_unique').on(
      t.dateKey,
      t.slot,
    ),
  }),
);

export const mealItems = sqliteTable('meal_items', {
  id: id(),
  mealId: integer('meal_id')
    .notNull()
    .references(() => meals.id, { onDelete: 'cascade' }),
  /** Optional link into the pantry; null means a one-off entry. */
  pantryItemId: integer('pantry_item_id').references(() => pantryItems.id, {
    onDelete: 'set null',
  }),
  /** Used when there's no pantry link — e.g. "16oz water", "leftover thai". */
  freeText: text('free_text'),
  quantity: real('quantity').notNull().default(1),
  unit: text('unit').notNull().default('serving'),
  /** Per-item nutrition copy at the moment of logging (decouples from pantry changes). */
  kcal: real('kcal'),
  proteinG: real('protein_g'),
  carbsG: real('carbs_g'),
  fatG: real('fat_g'),
  createdAt: createdAt(),
});

// ─── Body — weight (HealthKit mirror) ─────────────────────────────────────────
export const weightEntries = sqliteTable(
  'weight_entries',
  {
    id: id(),
    at: integer('at', { mode: 'timestamp_ms' }).notNull(),
    kg: real('kg').notNull(),
    /** HealthKit sample UUID — non-null when this row mirrors an HK sample. */
    healthkitUuid: text('healthkit_uuid'),
    createdAt: createdAt(),
  },
  (t) => ({
    /** Dedupe re-pulled HK samples; multiple manual entries at the same UUID-null are fine. */
    uniqHkUuid: uniqueIndex('weight_entries_hk_uuid_unique').on(t.healthkitUuid),
  }),
);

// ─── Workout types (library) ──────────────────────────────────────────────────
/**
 * Composite workout types. A "type" is an ordered list of steps; each step
 * is its own HK activity with its own duration. The 5 built-in types
 * (push/pull/legs/tennis/cardio) are seeded as single-step composites for
 * backward compatibility; user-defined types come from #72.
 */
export const workoutTypes = sqliteTable('workout_types', {
  id: id(),
  /** Stable identifier referenced by workout_preferences.*Type. */
  key: text('key').notNull().unique(),
  label: text('label').notNull(),
  /** Display tone — drives icon + label color. */
  tone: text('tone', { enum: ['ink', 'cool', 'accent', 'mute'] })
    .notNull()
    .default('ink'),
  /** Maps to WorkoutGlyph names — extend the glyph set when new icons land. */
  icon: text('icon', { enum: ['lift', 'tennis', 'walk', 'rest'] })
    .notNull()
    .default('lift'),
  /** True for the 5 seeded types; false for user-defined. */
  isBuiltin: integer('is_builtin', { mode: 'boolean' }).notNull().default(false),
  createdAt: createdAt(),
});

export const workoutTypeSteps = sqliteTable(
  'workout_type_steps',
  {
    id: id(),
    typeId: integer('type_id')
      .notNull()
      .references(() => workoutTypes.id, { onDelete: 'cascade' }),
    /** 0-based position within the parent type. */
    position: integer('position').notNull(),
    durationMin: integer('duration_min').notNull(),
    /** Canonical HK activity key for HK writes (must exist in WorkoutActivityKey). */
    hkActivityKey: text('hk_activity_key').notNull(),
    /**
     * JSON-encoded string array of HK activity keys treated as interchangeable
     * matches for this step (e.g. ['functionalStrengthTraining',
     * 'traditionalStrengthTraining']). Always includes hkActivityKey.
     */
    hkCandidateKeys: text('hk_candidate_keys').notNull(),
  },
  (t) => ({
    uniqStepPos: uniqueIndex('workout_type_steps_type_pos_unique').on(t.typeId, t.position),
  }),
);

// ─── Workouts (HealthKit mirror) ──────────────────────────────────────────────
export const workoutEntries = sqliteTable(
  'workout_entries',
  {
    id: id(),
    startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
    endedAt: integer('ended_at', { mode: 'timestamp_ms' }).notNull(),
    /**
     * Stores the raw HKWorkoutActivityType enum NAME (e.g.
     * 'functionalStrengthTraining', 'tennis', 'walking'). Higher-level
     * type IDs from our library (push/pull/legs/etc.) are derived at
     * display time via the planned-slot linking algorithm.
     */
    type: text('type').notNull(),
    kcal: real('kcal'),
    distanceM: real('distance_m'),
    notes: text('notes'),
    /** HealthKit sample UUID — non-null when this row mirrors an HK workout. */
    healthkitUuid: text('healthkit_uuid'),
    createdAt: createdAt(),
  },
  (t) => ({
    uniqHkUuid: uniqueIndex('workout_entries_hk_uuid_unique').on(t.healthkitUuid),
  }),
);

// ─── Workout preferences (singleton, always id=1) ─────────────────────────────
export const workoutPreferences = sqliteTable('workout_preferences', {
  id: integer('id').primaryKey(),
  // Weekly template — each weekday's planned type id (push / pull / legs /
  // tennis / cardio) or null for rest. Stored as 7 columns rather than a
  // child table so reads + writes are single-row, matching the singleton
  // pattern we use across the app.
  monType: text('mon_type'),
  tueType: text('tue_type'),
  wedType: text('wed_type'),
  thuType: text('thu_type'),
  friType: text('fri_type'),
  satType: text('sat_type'),
  sunType: text('sun_type'),
  // Optional planned time per weekday — minutes since midnight (0..1439).
  // Null = no specific time set; linking logic falls back to matching by
  // day + type only.
  monTimeMin: integer('mon_time_min'),
  tueTimeMin: integer('tue_time_min'),
  wedTimeMin: integer('wed_time_min'),
  thuTimeMin: integer('thu_time_min'),
  friTimeMin: integer('fri_time_min'),
  satTimeMin: integer('sat_time_min'),
  sunTimeMin: integer('sun_time_min'),
  /** Pull HK workouts on app foreground when granted. */
  autoImportHealthKit: integer('auto_import_healthkit', { mode: 'boolean' })
    .notNull()
    .default(true),
  /**
   * Daily Move-ring target in kcal — drives the home-screen move ring
   * fill. HK doesn't expose the user's actual Apple Watch move goal
   * programmatically, so we store our own and let the user adjust it
   * in /workouts-settings. Default 500 — Apple's typical baseline.
   */
  moveTargetKcal: integer('move_target_kcal').notNull().default(500),
});

// ─── Meal preferences (singleton, always id=1) ────────────────────────────────
/**
 * Mode the daily kcal budget is computed in. `deficit` derives the
 * budget from TDEE minus a target deficit (driven by the weight-rate
 * preset). `budget` is a flat manual value the user types in.
 */
export type MealGoalMode = 'deficit' | 'budget';

/**
 * Weight-rate preset for the deficit goal mode. Maps to a per-day kcal
 * deficit (negative numbers cut, positive numbers gain). Approximation:
 * 7700 kcal ≈ 1 kg of body fat, so −500 kcal/day ≈ −0.5 kg/week.
 */
export type WeightRate =
  | 'gentle'
  | 'steady'
  | 'aggressive'
  | 'maintain'
  | 'gain';

/** Mifflin-St Jeor TDEE activity multiplier. */
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active';

/** Three preset macro splits the design exposes. `custom` covers anything
 *  the user has tweaked away from a preset. */
export type MacroPreset = 'balanced' | 'protein' | 'endurance' | 'custom';

export const mealPreferences = sqliteTable('meal_preferences', {
  id: integer('id').primaryKey(),
  /** `deficit` vs `budget`. Drives which branch the daily budget query reads. */
  goalMode: text('goal_mode', { enum: ['deficit', 'budget'] })
    .notNull()
    .default('deficit')
    .$type<MealGoalMode>(),
  /** Manual budget for `goal_mode === 'budget'`. Ignored otherwise. */
  manualBudgetKcal: integer('manual_budget_kcal').notNull().default(1820),
  /** Weight-rate preset for `goal_mode === 'deficit'`. */
  weightRate: text('weight_rate', {
    enum: ['gentle', 'steady', 'aggressive', 'maintain', 'gain'],
  })
    .notNull()
    .default('steady')
    .$type<WeightRate>(),
  /** Mifflin-St Jeor activity multiplier picker. */
  activityLevel: text('activity_level', {
    enum: ['sedentary', 'light', 'moderate', 'active'],
  })
    .notNull()
    .default('moderate')
    .$type<ActivityLevel>(),
  /**
   * Stored TDEE in kcal. Recomputed when weight/activity changes; the
   * stored value buffers against weight churn (we don't want today's
   * budget swinging because last night's weigh-in was post-water).
   * Defaults to a sensible adult-male estimate; the user fixes this on
   * first use of the settings screen.
   */
  tdeeKcal: integer('tdee_kcal').notNull().default(2400),
  /** Macro split percentages. Must sum to 100; UI enforces. */
  macroPctProtein: integer('macro_pct_protein').notNull().default(30),
  macroPctCarbs: integer('macro_pct_carbs').notNull().default(45),
  macroPctFat: integer('macro_pct_fat').notNull().default(25),
  macroPreset: text('macro_preset', {
    enum: ['balanced', 'protein', 'endurance', 'custom'],
  })
    .notNull()
    .default('balanced')
    .$type<MacroPreset>(),
  /** Per-slot share of the day's kcal budget, in percent. Must sum
   *  to 100 — the UI enforces. Defaults to a flat 25 / 25 / 25 / 25. */
  slotPctBreakfast: integer('slot_pct_breakfast').notNull().default(25),
  slotPctLunch: integer('slot_pct_lunch').notNull().default(25),
  slotPctDinner: integer('slot_pct_dinner').notNull().default(25),
  slotPctSnack: integer('slot_pct_snack').notNull().default(25),
  /** Reminder toggles (notification scheduling lands in a follow-up). */
  remOverBudget: integer('rem_over_budget', { mode: 'boolean' })
    .notNull()
    .default(true),
  remEveningSummary: integer('rem_evening_summary', { mode: 'boolean' })
    .notNull()
    .default(true),
  remLowProtein: integer('rem_low_protein', { mode: 'boolean' })
    .notNull()
    .default(true),
});

// ─── User preferences (singleton, always id=1) ───────────────────────────────
/**
 * Per-user profile bits the rest of the app reads from. Right now
 * just `displayName` for the home greeting (#13); future fields
 * (height/age/sex for real Mifflin-St Jeor TDEE, etc.) land here.
 */
export const userPreferences = sqliteTable('user_preferences', {
  id: integer('id').primaryKey(),
  /** Greeting name. Null until set; UI shows a placeholder when missing. */
  displayName: text('display_name'),
});

// ─── Fasting preferences (singleton, always id=1) ─────────────────────────────
export const fastingPreferences = sqliteTable('fasting_preferences', {
  /** Always 1. Enforced via INSERT OR IGNORE / upsert at app startup. */
  id: integer('id').primaryKey(),
  protocol: text('protocol', { enum: ['16:8', '18:6', '20:4', 'OMAD', 'custom'] })
    .notNull()
    .default('16:8'),
  /** Default target when starting a new session — derived from protocol on chip tap. */
  defaultTargetHours: integer('default_target_hours').notNull().default(16),
  /** Eating window — minutes since midnight (e.g. 690 = 11:30). */
  eatingWindowStartMin: integer('eating_window_start_min').notNull().default(690),
  eatingWindowEndMin: integer('eating_window_end_min').notNull().default(1170),
  /** Weekday bitmask. Bit 0 = Monday, bit 6 = Sunday. 31 = Mon-Fri. */
  weekdayBitmask: integer('weekday_bitmask').notNull().default(31),
  reminderBeforeFastStart: integer('reminder_before_fast_start', { mode: 'boolean' })
    .notNull()
    .default(true),
  reminderEatingWindowOpens: integer('reminder_eating_window_opens', { mode: 'boolean' })
    .notNull()
    .default(true),
  reminderWeeklySummary: integer('reminder_weekly_summary', { mode: 'boolean' })
    .notNull()
    .default(false),
  reminderStreakCheckIn: integer('reminder_streak_check_in', { mode: 'boolean' })
    .notNull()
    .default(true),
  streakTarget: integer('streak_target').notNull().default(30),
  weeklyAdherenceTarget: integer('weekly_adherence_target').notNull().default(5),
});

// ─── Weight preferences (singleton, always id=1) ─────────────────────────────
export const weightPreferences = sqliteTable('weight_preferences', {
  id: integer('id').primaryKey(),
  /**
   * Anchor for the trajectory math — typically the user's weight when they
   * set a goal. Defaults to null; if null at chart time, we use the first
   * entry's weight as the implicit start.
   */
  startKg: real('start_kg'),
  /**
   * The date the user committed to this goal. Drives the optimal-trajectory
   * anchor — distinct from the first-weigh-in date because the user may
   * have been logging long before setting a goal. Null when no goal exists;
   * stamped to today when the user first sets a target.
   */
  startDate: integer('start_date', { mode: 'timestamp_ms' }),
  /** Target weight. Null = no active goal (display falls back to maintain). */
  targetKg: real('target_kg'),
  /** Goal date (timestamp). Null = no active goal. */
  targetDate: integer('target_date', { mode: 'timestamp_ms' }),
  /** Display unit. Storage stays in kg; this controls formatting. */
  unit: text('unit', { enum: ['kg', 'lb', 'st'] })
    .notNull()
    .default('kg'),
  /** Chart toggle: render the start→goal optimal trajectory line. */
  showOptimal: integer('show_optimal', { mode: 'boolean' }).notNull().default(true),
  /** Chart toggle: render the 7-day moving average path. */
  showMovingAvg: integer('show_moving_avg', { mode: 'boolean' }).notNull().default(true),
  /** Chart toggle: extrapolate the MA to project an ETA dashed line. */
  showProjected: integer('show_projected', { mode: 'boolean' }).notNull().default(true),
  /** Chart toggle: clamp y-axis to ±5kg around current rather than full range. */
  snapToGoalRange: integer('snap_to_goal_range', { mode: 'boolean' }).notNull().default(false),
  /** Weekday bitmask. Bit 0 = Monday … bit 6 = Sunday. 127 = every day on. */
  weekdayBitmask: integer('weekday_bitmask').notNull().default(127),
  /** When true: pulled from HK on app foreground + manual entries pushed to HK. */
  autoImportHealthKit: integer('auto_import_healthkit', { mode: 'boolean' })
    .notNull()
    .default(true),
});

// ─── HealthKit sync state — one row per HK type we mirror ─────────────────────
export const hkSyncCursor = sqliteTable('hk_sync_cursor', {
  /** HKQuantityTypeIdentifier / 'workouts' / etc. */
  type: text('type').primaryKey(),
  /** Opaque anchor string from queryQuantitySamplesWithAnchor; null on first pull. */
  lastAnchor: text('last_anchor'),
  lastSyncedAt: integer('last_synced_at', { mode: 'timestamp_ms' }).notNull(),
});

// ─── Inferred types — use these everywhere in the app ─────────────────────────
export type FastingSession = typeof fastingSessions.$inferSelect;
export type NewFastingSession = typeof fastingSessions.$inferInsert;

export type WaterLog = typeof waterLogs.$inferSelect;
export type NewWaterLog = typeof waterLogs.$inferInsert;

export type PantryItem = typeof pantryItems.$inferSelect;
export type NewPantryItem = typeof pantryItems.$inferInsert;

export type Meal = typeof meals.$inferSelect;
export type NewMeal = typeof meals.$inferInsert;

export type MealItem = typeof mealItems.$inferSelect;
export type NewMealItem = typeof mealItems.$inferInsert;

export type WeightEntry = typeof weightEntries.$inferSelect;
export type NewWeightEntry = typeof weightEntries.$inferInsert;

export type WorkoutEntry = typeof workoutEntries.$inferSelect;
export type NewWorkoutEntry = typeof workoutEntries.$inferInsert;

export type WorkoutTypeRow = typeof workoutTypes.$inferSelect;
export type NewWorkoutTypeRow = typeof workoutTypes.$inferInsert;
export type WorkoutTypeStepRow = typeof workoutTypeSteps.$inferSelect;
export type NewWorkoutTypeStepRow = typeof workoutTypeSteps.$inferInsert;

export type HkSyncCursor = typeof hkSyncCursor.$inferSelect;
export type NewHkSyncCursor = typeof hkSyncCursor.$inferInsert;

export type FastingPreferences = typeof fastingPreferences.$inferSelect;
export type NewFastingPreferences = typeof fastingPreferences.$inferInsert;

export type MealPreferences = typeof mealPreferences.$inferSelect;
export type NewMealPreferences = typeof mealPreferences.$inferInsert;

export type MealPlanEntry = typeof mealPlan.$inferSelect;
export type NewMealPlanEntry = typeof mealPlan.$inferInsert;

export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;

export type WaterPreferences = typeof waterPreferences.$inferSelect;
export type NewWaterPreferences = typeof waterPreferences.$inferInsert;

export type WeightPreferences = typeof weightPreferences.$inferSelect;
export type NewWeightPreferences = typeof weightPreferences.$inferInsert;

export type WeightUnit = NonNullable<NewWeightPreferences['unit']>;

export type WorkoutPreferences = typeof workoutPreferences.$inferSelect;
export type NewWorkoutPreferences = typeof workoutPreferences.$inferInsert;

export type WaterKind = NonNullable<NewWaterLog['kind']>;
export type WaterSource = NonNullable<NewWaterLog['source']>;
