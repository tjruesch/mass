CREATE TABLE `weight_preferences` (
	`id` integer PRIMARY KEY NOT NULL,
	`start_kg` real,
	`target_kg` real,
	`target_date` integer,
	`rate_preset_kg_per_week` real DEFAULT -0.5 NOT NULL,
	`unit` text DEFAULT 'kg' NOT NULL,
	`show_optimal` integer DEFAULT true NOT NULL,
	`show_moving_avg` integer DEFAULT true NOT NULL,
	`show_projected` integer DEFAULT true NOT NULL,
	`snap_to_goal_range` integer DEFAULT false NOT NULL,
	`weekday_bitmask` integer DEFAULT 127 NOT NULL,
	`auto_import_healthkit` integer DEFAULT true NOT NULL
);
