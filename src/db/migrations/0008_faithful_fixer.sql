CREATE TABLE `workout_preferences` (
	`id` integer PRIMARY KEY NOT NULL,
	`mon_type` text,
	`tue_type` text,
	`wed_type` text,
	`thu_type` text,
	`fri_type` text,
	`sat_type` text,
	`sun_type` text,
	`mon_time_min` integer,
	`tue_time_min` integer,
	`wed_time_min` integer,
	`thu_time_min` integer,
	`fri_time_min` integer,
	`sat_time_min` integer,
	`sun_time_min` integer,
	`auto_import_healthkit` integer DEFAULT true NOT NULL,
	`link_window_minutes` integer DEFAULT 120 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `workout_entries` DROP COLUMN `source`;