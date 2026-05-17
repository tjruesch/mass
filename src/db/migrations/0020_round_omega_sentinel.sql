ALTER TABLE `user_preferences` ADD `time_format` text DEFAULT '24h' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD `week_starts_on` text DEFAULT 'monday' NOT NULL;