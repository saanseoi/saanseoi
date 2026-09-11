ALTER TABLE `datasets` RENAME COLUMN `subType` TO `kind`;--> statement-breakpoint
ALTER TABLE `stats` RENAME COLUMN `type` TO `kind`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_stats` (
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`releaseId` text,
	`apiReleaseSetId` text,
	`dimension` text NOT NULL,
	`metric` text NOT NULL,
	`metricUnit` text NOT NULL,
	`value` real NOT NULL,
	`groupBy` text,
	`groupValue` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_stats_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`),
	CONSTRAINT `fk_stats_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT "stats_owner_chk" CHECK("releaseId" IS NOT NULL OR "apiReleaseSetId" IS NOT NULL)
);
--> statement-breakpoint
INSERT INTO `__new_stats`(`id`, `kind`, `releaseId`, `apiReleaseSetId`, `dimension`, `metric`, `metricUnit`, `value`, `groupBy`, `groupValue`, `createdAt`, `updatedAt`) SELECT `id`, `kind`, `releaseId`, `apiReleaseSetId`, `dimension`, `metric`, `metricUnit`, `value`, `groupBy`, `groupValue`, `createdAt`, `updatedAt` FROM `stats`;--> statement-breakpoint
DROP TABLE `stats`;--> statement-breakpoint
ALTER TABLE `__new_stats` RENAME TO `stats`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `stats_snapshotId_idx`;--> statement-breakpoint
CREATE INDEX `stats_releaseId_idx` ON `stats` (`releaseId`);--> statement-breakpoint
CREATE INDEX `stats_apiReleaseSetId_idx` ON `stats` (`apiReleaseSetId`);--> statement-breakpoint
CREATE INDEX `stats_dimension_idx` ON `stats` (`kind`,`dimension`,`metric`,`groupBy`,`groupValue`);