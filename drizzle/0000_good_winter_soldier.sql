CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#173f35' NOT NULL,
	`initial_balance` real DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `budgets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`month` text NOT NULL,
	`amount` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `budgets_owner_month_unique` ON `budgets` (`owner_email`,`month`);--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`account_id` integer NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount` real NOT NULL,
	`category` text DEFAULT 'Altro' NOT NULL,
	`source` text DEFAULT 'manuale' NOT NULL,
	`fingerprint` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_owner_fingerprint_unique` ON `transactions` (`owner_email`,`fingerprint`);