ALTER TABLE `streets` ADD `noticeRefs` text;--> statement-breakpoint
ALTER TABLE `streets` ADD `evidenceAssets` text;--> statement-breakpoint
ALTER TABLE `streetChangelog` ADD `recordKey` text NOT NULL;--> statement-breakpoint
ALTER TABLE `streetChangelog` ADD `gazetteDate` text;--> statement-breakpoint
ALTER TABLE `streetChangelog` ADD `noticeRef` text;--> statement-breakpoint
ALTER TABLE `streetChangelog` ADD `evidenceAssets` text;--> statement-breakpoint
ALTER TABLE `streetNameChanges` ADD `noticeRef` text NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_streetChangelog` (
	`snapshotId` text NOT NULL,
	`recordKey` text NOT NULL,
	`streetId` text NOT NULL,
	`kind` text NOT NULL,
	`isPartialNameChange` integer NOT NULL,
	`gazetteDate` text,
	`effectiveDate` text,
	`sourceShardId` text,
	`sourceReleaseId` text,
	`noticeRef` text,
	`evidenceAssets` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetChangelog_pk` PRIMARY KEY(`snapshotId`, `recordKey`, `streetId`)
);
--> statement-breakpoint
INSERT INTO `__new_streetChangelog`(`snapshotId`, `streetId`, `kind`, `isPartialNameChange`, `effectiveDate`, `sourceShardId`, `sourceReleaseId`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `streetId`, `kind`, `isPartialNameChange`, `effectiveDate`, `sourceShardId`, `sourceReleaseId`, `createdAt`, `updatedAt` FROM `streetChangelog`;--> statement-breakpoint
DROP TABLE `streetChangelog`;--> statement-breakpoint
ALTER TABLE `__new_streetChangelog` RENAME TO `streetChangelog`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `streetChangelog_event_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `streetNameChanges_sourceEventId_idx`;--> statement-breakpoint
CREATE INDEX `streetChangelog_street_idx` ON `streetChangelog` (`snapshotId`,`streetId`);--> statement-breakpoint
CREATE INDEX `streetChangelog_recordKey_idx` ON `streetChangelog` (`recordKey`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_noticeRef_idx` ON `streetNameChanges` (`noticeRef`);--> statement-breakpoint
ALTER TABLE `streets` DROP COLUMN `references`;--> statement-breakpoint
ALTER TABLE `streetNameChanges` DROP COLUMN `sourceEventId`;--> statement-breakpoint
ALTER TABLE `streetNameChanges` DROP COLUMN `references`;--> statement-breakpoint
ALTER TABLE `streetsI18n` DROP COLUMN `assetLinks`;--> statement-breakpoint
ALTER TABLE `streetsI18n` DROP COLUMN `translationProvenance`;