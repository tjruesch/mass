CREATE TABLE `fasting_preferences` (
	`id` integer PRIMARY KEY NOT NULL,
	`protocol` text DEFAULT '16:8' NOT NULL,
	`default_target_hours` integer DEFAULT 16 NOT NULL,
	`eating_window_start_min` integer DEFAULT 690 NOT NULL,
	`eating_window_end_min` integer DEFAULT 1170 NOT NULL,
	`weekday_bitmask` integer DEFAULT 31 NOT NULL,
	`reminder_before_fast_start` integer DEFAULT true NOT NULL,
	`reminder_eating_window_opens` integer DEFAULT true NOT NULL,
	`reminder_weekly_summary` integer DEFAULT false NOT NULL,
	`reminder_streak_check_in` integer DEFAULT true NOT NULL,
	`streak_target` integer DEFAULT 30 NOT NULL,
	`weekly_adherence_target` integer DEFAULT 5 NOT NULL
);
