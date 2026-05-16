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
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
});

// ─── Meals ────────────────────────────────────────────────────────────────────
export const meals = sqliteTable('meals', {
  id: id(),
  eatenAt: integer('eaten_at', { mode: 'timestamp_ms' }).notNull(),
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
});

// ─── Goals (programs / phases like "cut-04 · day 14/28") ──────────────────────
export const goals = sqliteTable('goals', {
  id: id(),
  kind: text('kind', { enum: ['cut', 'maintain', 'bulk'] }).notNull(),
  targetKg: real('target_kg'),
  startedAt: integer('started_at', { mode: 'timestamp_ms' }).notNull(),
  /** Null for open-ended programs. */
  endsAt: integer('ends_at', { mode: 'timestamp_ms' }),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  notes: text('notes'),
  createdAt: createdAt(),
});

// ─── Daily targets (per-day kcal / h2o / move / deficit) ──────────────────────
export const dailyTargets = sqliteTable('daily_targets', {
  /** App-local calendar date — 'YYYY-MM-DD'. PK so there's at most one row per day. */
  date: text('date').primaryKey(),
  kcal: integer('kcal').notNull(),
  h2oMl: integer('h2o_ml').notNull(),
  moveMin: integer('move_min').notNull(),
  /** Negative for a cut, 0 for maintenance, positive for a surplus. */
  deficit: integer('deficit').notNull().default(0),
  createdAt: createdAt(),
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

export type Goal = typeof goals.$inferSelect;
export type NewGoal = typeof goals.$inferInsert;

export type DailyTarget = typeof dailyTargets.$inferSelect;
export type NewDailyTarget = typeof dailyTargets.$inferInsert;

export type HkSyncCursor = typeof hkSyncCursor.$inferSelect;
export type NewHkSyncCursor = typeof hkSyncCursor.$inferInsert;

export type FastingPreferences = typeof fastingPreferences.$inferSelect;
export type NewFastingPreferences = typeof fastingPreferences.$inferInsert;

export type WaterPreferences = typeof waterPreferences.$inferSelect;
export type NewWaterPreferences = typeof waterPreferences.$inferInsert;

export type WeightPreferences = typeof weightPreferences.$inferSelect;
export type NewWeightPreferences = typeof weightPreferences.$inferInsert;

export type WeightUnit = NonNullable<NewWeightPreferences['unit']>;

export type WorkoutPreferences = typeof workoutPreferences.$inferSelect;
export type NewWorkoutPreferences = typeof workoutPreferences.$inferInsert;

export type WaterKind = NonNullable<NewWaterLog['kind']>;
export type WaterSource = NonNullable<NewWaterLog['source']>;
