CREATE TABLE `open_banking_authorizations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`account_id` integer NOT NULL,
	`state_hash` text NOT NULL,
	`bank_name` text NOT NULL,
	`bank_country` text NOT NULL,
	`psu_type` text NOT NULL,
	`authorization_id` text,
	`session_id` text,
	`authorized_accounts` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `open_banking_authorizations_state_hash_unique` ON `open_banking_authorizations` (`state_hash`);
--> statement-breakpoint
CREATE INDEX `idx_open_banking_authorizations_user_account` ON `open_banking_authorizations` (`user_id`,`account_id`);
--> statement-breakpoint
CREATE TABLE `account_open_banking_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`account_id` integer NOT NULL,
	`provider` text DEFAULT 'ENABLE_BANKING' NOT NULL,
	`session_id` text NOT NULL,
	`account_uid` text NOT NULL,
	`bank_name` text NOT NULL,
	`bank_country` text NOT NULL,
	`status` text DEFAULT 'ENABLED' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_open_banking_links_account_provider_unique` ON `account_open_banking_links` (`account_id`,`provider`);
--> statement-breakpoint
CREATE INDEX `idx_account_open_banking_links_user` ON `account_open_banking_links` (`user_id`);
