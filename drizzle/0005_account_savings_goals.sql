CREATE TABLE IF NOT EXISTS `account_goals` (
	`account_id` integer PRIMARY KEY NOT NULL,
	`owner_email` text NOT NULL,
	`amount` real NOT NULL
);
