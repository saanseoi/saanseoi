ALTER TABLE `releases` RENAME TO `resourceReleases`;--> statement-breakpoint
ALTER TABLE `resourceReleases` RENAME COLUMN `supersededByReleaseId` TO `supersededByResourceReleaseId`;--> statement-breakpoint
ALTER TABLE `publishedDataJournal` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `publishedDataJournal` RENAME COLUMN `relatedReleaseId` TO `relatedResourceReleaseId`;--> statement-breakpoint
ALTER TABLE `releaseShardAssignments` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `ingestRuns` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `releaseProcessingActionChunks` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `releaseProcessingActions` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `stats` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `assets` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `releaseProvenance` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_resourceReleases` (
	`id` text PRIMARY KEY,
	`sourceReleaseId` text NOT NULL,
	`datasetId` text NOT NULL,
	`code` text NOT NULL UNIQUE,
	`resourceType` text NOT NULL,
	`sourceVersion` text NOT NULL,
	`sourceSchemaVersion` text,
	`publicationDate` text,
	`cohortKey` text,
	`geometryStatus` text,
	`rawObjectKey` text,
	`originalFileName` text,
	`releaseNotesUrl` text,
	`notes` text,
	`status` text NOT NULL,
	`revokedAt` text,
	`revocationReason` text,
	`supersededByResourceReleaseId` text,
	`processingRules` text,
	`ingestedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_releases_sourceReleaseId_sourceReleases_id_fk` FOREIGN KEY (`sourceReleaseId`) REFERENCES `sourceReleases`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_releases_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `resourceReleases_supersededByResourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`supersededByResourceReleaseId`) REFERENCES `resourceReleases`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
INSERT INTO `__new_resourceReleases`(`id`, `sourceReleaseId`, `datasetId`, `code`, `resourceType`, `sourceVersion`, `sourceSchemaVersion`, `publicationDate`, `cohortKey`, `geometryStatus`, `rawObjectKey`, `originalFileName`, `releaseNotesUrl`, `notes`, `status`, `revokedAt`, `revocationReason`, `supersededByResourceReleaseId`, `processingRules`, `ingestedAt`, `createdAt`, `updatedAt`) SELECT `id`, `sourceReleaseId`, `datasetId`, `code`, `resourceType`, `sourceVersion`, `sourceSchemaVersion`, `publicationDate`, `cohortKey`, `geometryStatus`, `rawObjectKey`, `originalFileName`, `releaseNotesUrl`, `notes`, `status`, `revokedAt`, `revocationReason`, `supersededByResourceReleaseId`, `processingRules`, `ingestedAt`, `createdAt`, `updatedAt` FROM `resourceReleases`;--> statement-breakpoint
DROP TABLE `resourceReleases`;--> statement-breakpoint
ALTER TABLE `__new_resourceReleases` RENAME TO `resourceReleases`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_snapshotSourceReleases` (
	`snapshotId` text NOT NULL,
	`datasetId` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`role` text NOT NULL,
	`selectedByRule` text,
	`selectionMode` text,
	`anchorReleaseId` text,
	`sourceCohortKey` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `snapshotSources_pk` PRIMARY KEY(`snapshotId`, `resourceReleaseId`),
	CONSTRAINT `fk_snapshotSources_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotSources_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `snapshotSourceReleases_resourceReleaseId_datasetId_resourceReleases_id_datasetId_fk` FOREIGN KEY (`resourceReleaseId`,`datasetId`) REFERENCES `resourceReleases`(`id`,`datasetId`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_snapshotSourceReleases`(`snapshotId`, `datasetId`, `resourceReleaseId`, `role`, `selectedByRule`, `selectionMode`, `anchorReleaseId`, `sourceCohortKey`, `createdAt`) SELECT `snapshotId`, `datasetId`, `resourceReleaseId`, `role`, `selectedByRule`, `selectionMode`, `anchorReleaseId`, `sourceCohortKey`, `createdAt` FROM `snapshotSourceReleases`;--> statement-breakpoint
DROP TABLE `snapshotSourceReleases`;--> statement-breakpoint
ALTER TABLE `__new_snapshotSourceReleases` RENAME TO `snapshotSourceReleases`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_stats` (
	`id` text PRIMARY KEY,
	`resourceReleaseId` text,
	`apiReleaseSetId` text,
	`dimension` text NOT NULL,
	`metric` text NOT NULL,
	`metricUnit` text NOT NULL,
	`value` real NOT NULL,
	`groupBy` text,
	`groupValue` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_stats_releaseId_releases_id_fk` FOREIGN KEY (`resourceReleaseId`) REFERENCES `resourceReleases`(`id`),
	CONSTRAINT `fk_stats_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT "stats_owner_chk" CHECK(("resourceReleaseId" IS NOT NULL) != ("apiReleaseSetId" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_stats`(`id`, `resourceReleaseId`, `apiReleaseSetId`, `dimension`, `metric`, `metricUnit`, `value`, `groupBy`, `groupValue`, `createdAt`, `updatedAt`) SELECT `id`, `resourceReleaseId`, `apiReleaseSetId`, `dimension`, `metric`, `metricUnit`, `value`, `groupBy`, `groupValue`, `createdAt`, `updatedAt` FROM `stats`;--> statement-breakpoint
DROP TABLE `stats`;--> statement-breakpoint
ALTER TABLE `__new_stats` RENAME TO `stats`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `releases_sourceReleaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `releases_datasetId_resourceType_sourceVersion_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `releases_id_datasetId_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `releases_status_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `releases_supersededByReleaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `publishedDataJournal_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `releaseProcessingActions_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `stats_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `assets_releaseId_idx`;--> statement-breakpoint
CREATE INDEX `resourceReleases_sourceReleaseId_idx` ON `resourceReleases` (`sourceReleaseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `resourceReleases_datasetId_resourceType_sourceVersion_unique_idx` ON `resourceReleases` (`datasetId`,`resourceType`,`sourceVersion`);--> statement-breakpoint
CREATE UNIQUE INDEX `resourceReleases_id_datasetId_unique_idx` ON `resourceReleases` (`id`,`datasetId`);--> statement-breakpoint
CREATE INDEX `resourceReleases_status_idx` ON `resourceReleases` (`status`);--> statement-breakpoint
CREATE INDEX `resourceReleases_supersededByResourceReleaseId_idx` ON `resourceReleases` (`supersededByResourceReleaseId`);--> statement-breakpoint
CREATE INDEX `snapshotSourceReleases_datasetId_idx` ON `snapshotSourceReleases` (`datasetId`);--> statement-breakpoint
CREATE INDEX `snapshotSourceReleases_resourceReleaseId_idx` ON `snapshotSourceReleases` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `stats_resourceReleaseId_idx` ON `stats` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `stats_apiReleaseSetId_idx` ON `stats` (`apiReleaseSetId`);--> statement-breakpoint
CREATE INDEX `stats_dimension_idx` ON `stats` (`dimension`,`metric`,`groupBy`,`groupValue`);--> statement-breakpoint
CREATE INDEX `publishedDataJournal_resourceReleaseId_idx` ON `publishedDataJournal` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `releaseProcessingActions_resourceReleaseId_idx` ON `releaseProcessingActions` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `assets_resourceReleaseId_idx` ON `assets` (`resourceReleaseId`);