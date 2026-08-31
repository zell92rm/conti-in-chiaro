CREATE TABLE IF NOT EXISTS `category_keywords` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`category_id` integer NOT NULL,
	`keyword` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `category_keywords_owner_category_keyword_unique` ON `category_keywords` (`owner_email`,`category_id`,`keyword`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `app_flags` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL
);
