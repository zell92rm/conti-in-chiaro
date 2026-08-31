CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#4e8d7c' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_owner_name_unique` ON `categories` (`owner_email`,`name`);