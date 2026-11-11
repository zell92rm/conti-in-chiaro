ALTER TABLE `fixed_expenses` ADD `supply` text;--> statement-breakpoint
CREATE TABLE `energy_mail_configs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`account_id` integer NOT NULL,
	`provider` text NOT NULL,
	`imap_user` text NOT NULL,
	`encrypted_password` text NOT NULL,
	`password_iv` text NOT NULL,
	`times` text DEFAULT '["12:00","23:30"]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` text,
	`last_success_at` text,
	`run_requested_at` text,
	`running_since` text,
	`last_status` text,
	`last_error` text,
	`last_summary` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `energy_mail_configs_account_unique` ON `energy_mail_configs` (`account_id`);--> statement-breakpoint
CREATE TABLE `energy_bills` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_email` text NOT NULL,
	`account_id` integer NOT NULL,
	`provider` text NOT NULL,
	`email_id` text NOT NULL,
	`received_at` text NOT NULL,
	`supply` text NOT NULL,
	`consumption` real,
	`consumption_unit` text,
	`total` real,
	`due_date` text,
	`period_label` text,
	`subject` text NOT NULL,
	`applied_at` text,
	`applied_expense_id` integer,
	`applied_month` text,
	`note` text,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `energy_bills_owner_email_id_unique` ON `energy_bills` (`owner_email`,`email_id`);--> statement-breakpoint
CREATE INDEX `idx_energy_bills_account_supply` ON `energy_bills` (`account_id`,`supply`);
