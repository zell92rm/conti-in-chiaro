ALTER TABLE `fixed_expenses` ADD `variable` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `fixed_expenses` ADD `only_month` text;--> statement-breakpoint
CREATE TABLE `fixed_expense_month_amounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`fixed_expense_id` integer NOT NULL,
	`month` text NOT NULL,
	`amount` real NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `fixed_expense_month_amounts_unique` ON `fixed_expense_month_amounts` (`fixed_expense_id`,`month`);
