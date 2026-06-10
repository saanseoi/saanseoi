ALTER TABLE `user` ADD COLUMN `substack` text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `newsletterSubscription` (
	`email` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`subscribed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `newsletterSubscription_status_idx` ON `newsletterSubscription` (`status`);
