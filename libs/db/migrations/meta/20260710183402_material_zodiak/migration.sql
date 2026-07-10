CREATE TABLE `api_key` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`key_digest` text NOT NULL UNIQUE,
	`requests_per_minute` integer,
	`requests_per_day` integer,
	`requests_per_month` integer,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_api_key_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `user` ADD `role` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
CREATE INDEX `api_key_userId_idx` ON `api_key` (`user_id`);--> statement-breakpoint
CREATE INDEX `api_key_userId_revokedAt_idx` ON `api_key` (`user_id`,`revoked_at`);