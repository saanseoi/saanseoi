ALTER TABLE `releases` ADD `geometryStatus` text DEFAULT 'authoritative' NOT NULL;--> statement-breakpoint
ALTER TABLE `sourceReleases` ADD `geometryStatus` text DEFAULT 'authoritative' NOT NULL;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `geometryStatus` text DEFAULT 'authoritative' NOT NULL;