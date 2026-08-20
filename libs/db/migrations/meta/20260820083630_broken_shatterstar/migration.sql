DROP TABLE IF EXISTS `account_new`;--> statement-breakpoint
CREATE TABLE `account_new` (
	`id` text PRIMARY KEY,
	`issuer` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_account_new_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);--> statement-breakpoint
INSERT INTO `account_new` (
	`id`,
	`issuer`,
	`account_id`,
	`provider_id`,
	`user_id`,
	`access_token`,
	`refresh_token`,
	`id_token`,
	`access_token_expires_at`,
	`refresh_token_expires_at`,
	`scope`,
	`password`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	CASE `provider_id`
		WHEN 'credential' THEN 'local:credential'
		WHEN 'google' THEN 'local:oauth:google'
		WHEN 'facebook' THEN 'local:oauth:facebook'
		WHEN 'github' THEN 'local:oauth:github'
	END,
	CASE WHEN `provider_id` = 'credential' THEN `user_id` ELSE `account_id` END,
	`provider_id`,
	`user_id`,
	`access_token`,
	`refresh_token`,
	`id_token`,
	`access_token_expires_at`,
	`refresh_token_expires_at`,
	`scope`,
	`password`,
	`created_at`,
	`updated_at`
FROM `account`;--> statement-breakpoint
CREATE UNIQUE INDEX `account_issuer_accountId_uidx` ON `account_new` (`issuer`,`account_id`);--> statement-breakpoint
DROP TABLE `account`;--> statement-breakpoint
ALTER TABLE `account_new` RENAME TO `account`;--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);
