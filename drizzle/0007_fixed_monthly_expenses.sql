CREATE TABLE IF NOT EXISTS `fixed_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`account_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`amount` real NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_fixed_expenses_owner_account` ON `fixed_expenses` (`owner_email`,`account_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `fixed_expense_payments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`fixed_expense_id` integer NOT NULL,
	`transaction_id` integer NOT NULL,
	`month` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `fixed_expense_payments_expense_month_unique` ON `fixed_expense_payments` (`fixed_expense_id`,`month`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `fixed_expense_payments_transaction_unique` ON `fixed_expense_payments` (`transaction_id`);
