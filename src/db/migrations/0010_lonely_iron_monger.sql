CREATE TABLE `workout_type_steps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type_id` integer NOT NULL,
	`position` integer NOT NULL,
	`duration_min` integer NOT NULL,
	`hk_activity_key` text NOT NULL,
	`hk_candidate_keys` text NOT NULL,
	FOREIGN KEY (`type_id`) REFERENCES `workout_types`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_type_steps_type_pos_unique` ON `workout_type_steps` (`type_id`,`position`);--> statement-breakpoint
CREATE TABLE `workout_types` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`tone` text DEFAULT 'ink' NOT NULL,
	`icon` text DEFAULT 'lift' NOT NULL,
	`is_builtin` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_types_key_unique` ON `workout_types` (`key`);--> statement-breakpoint
ALTER TABLE `workout_preferences` DROP COLUMN `mon_duration_min`;--> statement-breakpoint
ALTER TABLE `workout_preferences` DROP COLUMN `tue_duration_min`;--> statement-breakpoint
ALTER TABLE `workout_preferences` DROP COLUMN `wed_duration_min`;--> statement-breakpoint
ALTER TABLE `workout_preferences` DROP COLUMN `thu_duration_min`;--> statement-breakpoint
ALTER TABLE `workout_preferences` DROP COLUMN `fri_duration_min`;--> statement-breakpoint
ALTER TABLE `workout_preferences` DROP COLUMN `sat_duration_min`;--> statement-breakpoint
ALTER TABLE `workout_preferences` DROP COLUMN `sun_duration_min`;