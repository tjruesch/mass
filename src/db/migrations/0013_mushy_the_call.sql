PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_meals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`eaten_at` integer,
	`name` text,
	`kcal` real,
	`protein_g` real,
	`carbs_g` real,
	`fat_g` real,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_meals`("id", "eaten_at", "name", "kcal", "protein_g", "carbs_g", "fat_g", "notes", "created_at") SELECT "id", "eaten_at", "name", "kcal", "protein_g", "carbs_g", "fat_g", "notes", "created_at" FROM `meals`;--> statement-breakpoint
DROP TABLE `meals`;--> statement-breakpoint
ALTER TABLE `__new_meals` RENAME TO `meals`;--> statement-breakpoint
PRAGMA foreign_keys=ON;