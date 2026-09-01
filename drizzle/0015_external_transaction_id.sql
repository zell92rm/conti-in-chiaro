ALTER TABLE `transactions` ADD `external_transaction_id` text;
CREATE UNIQUE INDEX `transactions_external_id_unique` ON `transactions` (`owner_email`,`account_id`,`source`,`external_transaction_id`);
