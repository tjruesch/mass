CREATE TABLE `meal_preferences` (
	`id` integer PRIMARY KEY NOT NULL,
	`goal_mode` text DEFAULT 'deficit' NOT NULL,
	`manual_budget_kcal` integer DEFAULT 1820 NOT NULL,
	`weight_rate` text DEFAULT 'steady' NOT NULL,
	`activity_level` text DEFAULT 'moderate' NOT NULL,
	`tdee_kcal` integer DEFAULT 2400 NOT NULL,
	`macro_pct_protein` integer DEFAULT 30 NOT NULL,
	`macro_pct_carbs` integer DEFAULT 45 NOT NULL,
	`macro_pct_fat` integer DEFAULT 25 NOT NULL,
	`macro_preset` text DEFAULT 'balanced' NOT NULL,
	`rem_over_budget` integer DEFAULT true NOT NULL,
	`rem_evening_summary` integer DEFAULT true NOT NULL,
	`rem_low_protein` integer DEFAULT true NOT NULL
);
