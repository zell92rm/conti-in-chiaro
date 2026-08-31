CREATE TABLE `user_open_banking_config` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`provider` text NOT NULL,
	`application_id` text NOT NULL,
	`encrypted_private_key` text NOT NULL,
	`private_key_iv` text NOT NULL,
	`status` text DEFAULT 'NOT_CONFIGURED' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_open_banking_config_user_provider_unique` ON `user_open_banking_config` (`user_id`,`provider`);
