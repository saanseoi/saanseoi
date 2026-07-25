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
ALTER TABLE `streets` ADD `version` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `streets` ADD `status` text NOT NULL;--> statement-breakpoint
ALTER TABLE `streets` ADD `deletedAt` text;--> statement-breakpoint
ALTER TABLE `streetsI18n` ADD `description` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
INSERT INTO `__new_streets`(`snapshotId`, `id`, `districtIds`, `landsdPublicationDate`, `yearBuilt`, `references`, `sourceKeys`, `createdAt`, `updatedAt`) SELECT `snapshotId`, `id`, `districtIds`, `landsdPublicationDate`, `yearBuilt`, `references`, `sourceKeys`, `createdAt`, `updatedAt` FROM `streets`;--> statement-breakpoint
DROP TABLE `streets`;--> statement-breakpoint
ALTER TABLE `__new_streets` RENAME TO `streets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `streetNameChangeStreets_streetId_idx` ON `streetNameChangeStreets` (`snapshotId`,`streetId`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_sourceEventId_idx` ON `streetNameChanges` (`sourceEventId`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_status_idx` ON `streetNameChanges` (`status`);--> statement-breakpoint
ALTER TABLE `streetsI18n` DROP COLUMN `governmentNoticeUrl`;--> statement-breakpoint
ALTER TABLE `streetsI18n` DROP COLUMN `gazettePlanUrls`;