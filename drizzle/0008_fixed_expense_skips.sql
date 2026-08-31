CREATE TABLE IF NOT EXISTS `fixed_expense_skips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`fixed_expense_id` integer NOT NULL,
	`month` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `fixed_expense_skips_expense_month_unique` ON `fixed_expense_skips` (`fixed_expense_id`,`month`);
