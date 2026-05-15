CREATE TABLE `water_preferences` (
	`id` integer PRIMARY KEY NOT NULL,
	`target_ml` integer DEFAULT 3000 NOT NULL,
	`unit` text DEFAULT 'L' NOT NULL,
	`quick_add_1_ml` integer DEFAULT 250 NOT NULL,
	`quick_add_1_label` text DEFAULT 'glass' NOT NULL,
	`quick_add_2_ml` integer DEFAULT 350 NOT NULL,
	`quick_add_2_label` text DEFAULT 'cup' NOT NULL,
	`quick_add_3_ml` integer DEFAULT 500 NOT NULL,
	`quick_add_3_label` text DEFAULT 'bottle' NOT NULL,
	`quick_add_4_ml` integer DEFAULT 750 NOT NULL,
	`quick_add_4_label` text DEFAULT 'mug' NOT NULL,
	`tea_count_pct` integer DEFAULT 50 NOT NULL,
	`coffee_count_pct` integer DEFAULT 50 NOT NULL,
	`weekday_bitmask` integer DEFAULT 127 NOT NULL,
	`activity_scaling_ml` integer DEFAULT 350 NOT NULL,
	`activity_scaling_enabled` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE `water_logs` ADD `kind` text DEFAULT 'water' NOT NULL;