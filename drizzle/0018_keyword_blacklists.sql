ALTER TABLE `category_keywords` ADD `source` text DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
CREATE TABLE `keyword_blacklists` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`scope` text NOT NULL,
	`keyword` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `keyword_blacklists_owner_scope_keyword_unique` ON `keyword_blacklists` (`owner_email`,`scope`,`keyword`);
--> statement-breakpoint
CREATE TABLE `fixed_expense_keyword_sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`fixed_expense_id` integer NOT NULL,
	`keyword` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fixed_expense_keyword_sources_owner_expense_keyword_unique` ON `fixed_expense_keyword_sources` (`owner_email`,`fixed_expense_id`,`keyword`);
