PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_resourceReleases` (
	`id` text PRIMARY KEY,
	`sourceReleaseId` text NOT NULL,
	`datasetId` text NOT NULL,
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
	CONSTRAINT `fk_resourceReleases_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `resourceReleases_sourceReleaseId_datasetId_sourceReleases_fk` FOREIGN KEY (`sourceReleaseId`,`datasetId`) REFERENCES `sourceReleases`(`id`,`datasetId`) ON DELETE RESTRICT,
	CONSTRAINT `resourceReleases_supersededByResourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`supersededByResourceReleaseId`) REFERENCES `resourceReleases`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
INSERT INTO `__new_resourceReleases`(`id`, `sourceReleaseId`, `datasetId`, `code`, `resourceType`, `geometryStatus`, `status`, `processingRules`, `ingestedAt`, `revokedAt`, `revocationReason`, `supersededByResourceReleaseId`, `createdAt`, `updatedAt`) SELECT `id`, `sourceReleaseId`, `datasetId`, `code`, `resourceType`, `geometryStatus`, `status`, `processingRules`, `ingestedAt`, `revokedAt`, `revocationReason`, `supersededByResourceReleaseId`, `createdAt`, `updatedAt` FROM `resourceReleases`;--> statement-breakpoint
DROP TABLE `resourceReleases`;--> statement-breakpoint
ALTER TABLE `__new_resourceReleases` RENAME TO `resourceReleases`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `resourceReleases_datasetId_resourceType_sourceVersion_unique_idx`;--> statement-breakpoint
CREATE INDEX `resourceReleases_sourceReleaseId_idx` ON `resourceReleases` (`sourceReleaseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `resourceReleases_sourceReleaseId_resourceType_unique_idx` ON `resourceReleases` (`sourceReleaseId`,`resourceType`);--> statement-breakpoint
CREATE UNIQUE INDEX `resourceReleases_id_datasetId_unique_idx` ON `resourceReleases` (`id`,`datasetId`);--> statement-breakpoint
CREATE INDEX `resourceReleases_status_idx` ON `resourceReleases` (`status`);--> statement-breakpoint
CREATE INDEX `resourceReleases_supersededByResourceReleaseId_idx` ON `resourceReleases` (`supersededByResourceReleaseId`);--> statement-breakpoint
CREATE VIEW `resourceReleaseDetails` AS select "resourceReleases"."id", "resourceReleases"."sourceReleaseId", "resourceReleases"."datasetId", "resourceReleases"."code", "resourceReleases"."resourceType", "resourceReleases"."geometryStatus", "resourceReleases"."status", "resourceReleases"."processingRules", "resourceReleases"."ingestedAt", "resourceReleases"."revokedAt", "resourceReleases"."revocationReason", "resourceReleases"."supersededByResourceReleaseId", "resourceReleases"."createdAt", "resourceReleases"."updatedAt", "sourceReleases"."sourceVersion", "sourceReleases"."sourceSchemaVersion", "sourceReleases"."publicationDate", "sourceReleases"."cohortKey", "sourceReleases"."releaseNotesUrl" from "resourceReleases" inner join "sourceReleases" on "resourceReleases"."sourceReleaseId" = "sourceReleases"."id";