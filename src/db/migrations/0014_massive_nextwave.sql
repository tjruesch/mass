ALTER TABLE `pantry_items` ADD `category` text DEFAULT 'pantry' NOT NULL;--> statement-breakpoint
ALTER TABLE `pantry_items` ADD `current_qty` real;--> statement-breakpoint
ALTER TABLE `pantry_items` ADD `stock_unit` text;--> statement-breakpoint
ALTER TABLE `pantry_items` ADD `low_threshold` real;--> statement-breakpoint
ALTER TABLE `pantry_items` ADD `restocked_at` integer;