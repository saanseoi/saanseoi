CREATE TABLE `streetNameChangeStreets` (
	`snapshotId` text NOT NULL,
	`nameChangeId` text NOT NULL,
	`streetId` text NOT NULL,
	`role` text NOT NULL,
	CONSTRAINT `streetNameChangeStreets_pk` PRIMARY KEY(`snapshotId`, `nameChangeId`, `streetId`, `role`),
	CONSTRAINT `streetNameChangeStreets_change_fk` FOREIGN KEY (`snapshotId`,`nameChangeId`) REFERENCES `streetNameChanges`(`snapshotId`,`id`) ON DELETE CASCADE,
	CONSTRAINT `streetNameChangeStreets_street_fk` FOREIGN KEY (`snapshotId`,`streetId`) REFERENCES `streets`(`snapshotId`,`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `streetNameChanges` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`sourceEventId` text NOT NULL,
	`intentionNotificationDate` text,
	`nameChangeDate` text,
	`isPartialNameChange` integer NOT NULL,
	`status` text NOT NULL,
	`references` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetNameChanges_pk` PRIMARY KEY(`snapshotId`, `id`)
);
--> statement-breakpoint
-- Existing materialised streets predate lifecycle versioning. They are the
-- baseline materialisation, so retain them as active version 1 while the
-- table is rebuilt below.
ALTER TABLE `streets` ADD `version` integer NOT NULL DEFAULT 1;--> statement-breakpoint
ALTER TABLE `streets` ADD `status` text NOT NULL DEFAULT 'active';--> statement-breakpoint
ALTER TABLE `streets` ADD `deletedAt` text;--> statement-breakpoint
ALTER TABLE `streetsI18n` ADD `description` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
-- Cloudflare D1 does not honour the PRAGMA above during a table rebuild.
-- Preserve cascading dependants explicitly before dropping `streets`, then
-- restore them after the rebuilt table is in place. On SQLite, where the
-- PRAGMA does work, the DELETE statements make the restore idempotent.
CREATE TABLE `__streetsI18n_backup` AS SELECT * FROM `streetsI18n`;--> statement-breakpoint
CREATE TABLE `__streetsAddress_backup` AS SELECT * FROM `streetsAddress`;--> statement-breakpoint
CREATE TABLE `__new_streets` (
	`snapshotId` text NOT NULL,
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`deletedAt` text,
	`districtIds` text,
	`landsdPublicationDate` text,
	`yearBuilt` text,
	`references` text,
	`sourceKeys` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streets_pk` PRIMARY KEY(`snapshotId`, `id`),
	CONSTRAINT "streets_version_positive" CHECK("version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_streets`(`snapshotId`, `id`, `version`, `status`, `districtIds`, `landsdPublicationDate`, `yearBuilt`, `references`, `sourceKeys`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `id`, `version`, `status`, `districtIds`, `landsdPublicationDate`, `yearBuilt`, `references`, `sourceKeys`, `createdAt`, `updatedAt` FROM `streets`;--> statement-breakpoint
DROP TABLE `streets`;--> statement-breakpoint
ALTER TABLE `__new_streets` RENAME TO `streets`;--> statement-breakpoint
DELETE FROM `streetsI18n`;--> statement-breakpoint
INSERT INTO `streetsI18n` SELECT * FROM `__streetsI18n_backup`;--> statement-breakpoint
DELETE FROM `streetsAddress`;--> statement-breakpoint
INSERT INTO `streetsAddress` SELECT * FROM `__streetsAddress_backup`;--> statement-breakpoint
DROP TABLE `__streetsI18n_backup`;--> statement-breakpoint
DROP TABLE `__streetsAddress_backup`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `streetNameChangeStreets_streetId_idx` ON `streetNameChangeStreets` (`snapshotId`,`streetId`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_sourceEventId_idx` ON `streetNameChanges` (`sourceEventId`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_status_idx` ON `streetNameChanges` (`status`);--> statement-breakpoint
ALTER TABLE `streetsI18n` DROP COLUMN `governmentNoticeUrl`;--> statement-breakpoint
ALTER TABLE `streetsI18n` DROP COLUMN `gazettePlanUrls`;
