CREATE TABLE `streetNameChangeStreets` (
	`nameChangeId` text NOT NULL,
	`streetId` text NOT NULL,
	`role` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetNameChangeStreets_pk` PRIMARY KEY(`nameChangeId`, `versionHash`, `streetId`, `role`)
);
--> statement-breakpoint
CREATE TABLE `streetNameChanges` (
	`id` text NOT NULL,
	`sourceEventId` text NOT NULL,
	`intentionNotificationDate` text,
	`nameChangeDate` text,
	`isPartialNameChange` integer NOT NULL,
	`status` text NOT NULL,
	`references` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetNameChanges_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
ALTER TABLE `streets` ADD `version` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `streets` ADD `status` text NOT NULL;--> statement-breakpoint
ALTER TABLE `streets` ADD `deletedAt` text;--> statement-breakpoint
ALTER TABLE `streetsI18n` ADD `description` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_streets` (
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`deletedAt` text,
	`districtIds` text,
	`landsdPublicationDate` text,
	`yearBuilt` text,
	`references` text,
	`sourceKeys` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streets_pk` PRIMARY KEY(`id`, `versionHash`),
	CONSTRAINT "history_streets_version_positive" CHECK("version" > 0)
);
--> statement-breakpoint
INSERT INTO `__new_streets`(`id`, `districtIds`, `landsdPublicationDate`, `yearBuilt`, `references`, `sourceKeys`, `versionHash`, `sourceReleaseId`, `snapshotId`, `isCurrent`, `createdAt`, `updatedAt`) SELECT `id`, `districtIds`, `landsdPublicationDate`, `yearBuilt`, `references`, `sourceKeys`, `versionHash`, `sourceReleaseId`, `snapshotId`, `isCurrent`, `createdAt`, `updatedAt` FROM `streets`;--> statement-breakpoint
DROP TABLE `streets`;--> statement-breakpoint
ALTER TABLE `__new_streets` RENAME TO `streets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `streets_id_version_idx` ON `streets` (`id`,`version`);--> statement-breakpoint
CREATE INDEX `streets_current_lookup_idx` ON `streets` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streets_sourceReleaseId_idx` ON `streets` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `streets_snapshotId_idx` ON `streets` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetNameChangeStreets_streetId_idx` ON `streetNameChangeStreets` (`streetId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetNameChangeStreets_snapshotId_idx` ON `streetNameChangeStreets` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_current_lookup_idx` ON `streetNameChanges` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_sourceEventId_idx` ON `streetNameChanges` (`sourceEventId`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_snapshotId_idx` ON `streetNameChanges` (`snapshotId`);--> statement-breakpoint
ALTER TABLE `streetsI18n` DROP COLUMN `governmentNoticeUrl`;--> statement-breakpoint
ALTER TABLE `streetsI18n` DROP COLUMN `gazettePlanUrls`;