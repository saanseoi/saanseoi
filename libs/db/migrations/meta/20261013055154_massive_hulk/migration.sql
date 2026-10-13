PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_resourceReleases` (
	`id` text PRIMARY KEY,
	`sourceReleaseId` text NOT NULL,
	`code` text NOT NULL UNIQUE,
	`resourceType` text NOT NULL,
	`geometryStatus` text,
	`status` text NOT NULL,
	`processingRules` text,
	`ingestedAt` text,
	`revokedAt` text,
	`revocationReason` text,
	`supersededByResourceReleaseId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_resourceReleases_sourceReleaseId_sourceReleases_id_fk` FOREIGN KEY (`sourceReleaseId`) REFERENCES `sourceReleases`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `resourceReleases_supersededByResourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`supersededByResourceReleaseId`) REFERENCES `resourceReleases`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
INSERT INTO `__new_resourceReleases`(`id`, `sourceReleaseId`, `code`, `resourceType`, `geometryStatus`, `status`, `processingRules`, `ingestedAt`, `revokedAt`, `revocationReason`, `supersededByResourceReleaseId`, `createdAt`, `updatedAt`) SELECT `id`, `sourceReleaseId`, `code`, `resourceType`, `geometryStatus`, `status`, `processingRules`, `ingestedAt`, `revokedAt`, `revocationReason`, `supersededByResourceReleaseId`, `createdAt`, `updatedAt` FROM `resourceReleases`;--> statement-breakpoint
DROP TABLE `resourceReleases`;--> statement-breakpoint
ALTER TABLE `__new_resourceReleases` RENAME TO `resourceReleases`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_snapshotResourceReleases` (
	`snapshotId` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`role` text NOT NULL,
	`selectedByRule` text,
	`selectionMode` text,
	`anchorReleaseId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `snapshotResourceReleases_pk` PRIMARY KEY(`snapshotId`, `resourceReleaseId`),
	CONSTRAINT `fk_snapshotResourceReleases_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotResourceReleases_resourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`resourceReleaseId`) REFERENCES `resourceReleases`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_snapshotResourceReleases`(`snapshotId`, `resourceReleaseId`, `role`, `selectedByRule`, `selectionMode`, `anchorReleaseId`, `createdAt`) SELECT `snapshotId`, `resourceReleaseId`, `role`, `selectedByRule`, `selectionMode`, `anchorReleaseId`, `createdAt` FROM `snapshotResourceReleases`;--> statement-breakpoint
DROP TABLE `snapshotResourceReleases`;--> statement-breakpoint
ALTER TABLE `__new_snapshotResourceReleases` RENAME TO `snapshotResourceReleases`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `resourceReleases_id_datasetId_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `sourceReleases_id_datasetId_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshotResourceReleases_datasetId_idx`;--> statement-breakpoint
CREATE INDEX `resourceReleases_sourceReleaseId_idx` ON `resourceReleases` (`sourceReleaseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `resourceReleases_sourceReleaseId_resourceType_unique_idx` ON `resourceReleases` (`sourceReleaseId`,`resourceType`);--> statement-breakpoint
CREATE INDEX `resourceReleases_status_idx` ON `resourceReleases` (`status`);--> statement-breakpoint
CREATE INDEX `resourceReleases_supersededByResourceReleaseId_idx` ON `resourceReleases` (`supersededByResourceReleaseId`);--> statement-breakpoint
CREATE INDEX `snapshotResourceReleases_resourceReleaseId_idx` ON `snapshotResourceReleases` (`resourceReleaseId`);--> statement-breakpoint
CREATE VIEW `resourceReleaseDetails` AS select "resourceReleases"."id", "resourceReleases"."sourceReleaseId", "resourceReleases"."code", "resourceReleases"."resourceType", "resourceReleases"."geometryStatus", "resourceReleases"."status", "resourceReleases"."processingRules", "resourceReleases"."ingestedAt", "resourceReleases"."revokedAt", "resourceReleases"."revocationReason", "resourceReleases"."supersededByResourceReleaseId", "resourceReleases"."createdAt", "resourceReleases"."updatedAt", "sourceReleases"."datasetId", "sourceReleases"."sourceVersion", "sourceReleases"."sourceSchemaVersion", "sourceReleases"."publicationDate", "sourceReleases"."cohortKey", "sourceReleases"."releaseNotesUrl" from "resourceReleases" inner join "sourceReleases" on "resourceReleases"."sourceReleaseId" = "sourceReleases"."id";--> statement-breakpoint
CREATE VIEW `snapshotResourceReleaseDetails` AS select "snapshotResourceReleases"."snapshotId", "snapshotResourceReleases"."resourceReleaseId", "snapshotResourceReleases"."role", "snapshotResourceReleases"."selectedByRule", "snapshotResourceReleases"."selectionMode", "snapshotResourceReleases"."anchorReleaseId", "snapshotResourceReleases"."createdAt", "resourceReleaseDetails"."datasetId" from "snapshotResourceReleases" inner join "resourceReleaseDetails" on "snapshotResourceReleases"."resourceReleaseId" = "resourceReleaseDetails"."id";