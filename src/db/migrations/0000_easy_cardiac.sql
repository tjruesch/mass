CREATE TABLE `daily_targets` (
	`date` text PRIMARY KEY NOT NULL,
	`kcal` integer NOT NULL,
	`h2o_ml` integer NOT NULL,
	`move_min` integer NOT NULL,
	`deficit` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fasting_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer,
	`target_hours` integer NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `goals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`target_kg` real,
	`started_at` integer NOT NULL,
	`ends_at` integer,
	`is_active` integer DEFAULT false NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `hk_sync_cursor` (
	`type` text PRIMARY KEY NOT NULL,
	`last_anchor` text,
	`last_synced_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `meal_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`meal_id` integer NOT NULL,
	`pantry_item_id` integer,
	`free_text` text,
	`quantity` real DEFAULT 1 NOT NULL,
	`unit` text DEFAULT 'serving' NOT NULL,
	`kcal` real,
	`protein_g` real,
	`carbs_g` real,
	`fat_g` real,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`meal_id`) REFERENCES `meals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pantry_item_id`) REFERENCES `pantry_items`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`eaten_at` integer NOT NULL,
	`name` text,
	`kcal` real,
	`protein_g` real,
	`carbs_g` real,
	`fat_g` real,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pantry_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`brand` text,
	`default_serving_qty` real DEFAULT 1 NOT NULL,
	`default_serving_unit` text DEFAULT 'serving' NOT NULL,
	`kcal_per_serving` real NOT NULL,
	`protein_g` real DEFAULT 0 NOT NULL,
	`carbs_g` real DEFAULT 0 NOT NULL,
	`fat_g` real DEFAULT 0 NOT NULL,
	`last_used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `water_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`ml` integer NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `weight_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`kg` real NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`healthkit_uuid` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weight_entries_hk_uuid_unique` ON `weight_entries` (`healthkit_uuid`);--> statement-breakpoint
CREATE TABLE `workout_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`ended_at` integer NOT NULL,
	`type` text NOT NULL,
	`kcal` real,
	`distance_m` real,
	`notes` text,
	`source` text DEFAULT 'manual' NOT NULL,
	`healthkit_uuid` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workout_entries_hk_uuid_unique` ON `workout_entries` (`healthkit_uuid`);