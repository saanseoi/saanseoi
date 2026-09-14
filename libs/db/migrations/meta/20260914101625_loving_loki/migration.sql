PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_releases` (
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
	`supersededByReleaseId` text,
	`processingRules` text,
	`ingestedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_releases_sourceReleaseId_sourceReleases_id_fk` FOREIGN KEY (`sourceReleaseId`) REFERENCES `sourceReleases`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_releases_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `releases_supersededByReleaseId_releases_id_fk` FOREIGN KEY (`supersededByReleaseId`) REFERENCES `releases`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
INSERT INTO `__new_releases`(`id`, `sourceReleaseId`, `datasetId`, `code`, `resourceType`, `sourceVersion`, `sourceSchemaVersion`, `publicationDate`, `cohortKey`, `geometryStatus`, `rawObjectKey`, `originalFileName`, `releaseNotesUrl`, `notes`, `status`, `revokedAt`, `revocationReason`, `supersededByReleaseId`, `processingRules`, `ingestedAt`, `createdAt`, `updatedAt`) SELECT `id`, `sourceReleaseId`, `datasetId`, `code`, `resourceType`, `sourceVersion`, `sourceSchemaVersion`, `publicationDate`, `cohortKey`, CASE WHEN `resourceType` IN ('divisionArea', 'divisionBoundary') THEN `geometryStatus` ELSE NULL END, `rawObjectKey`, `originalFileName`, `releaseNotesUrl`, `notes`, `status`, `revokedAt`, `revocationReason`, `supersededByReleaseId`, `processingRules`, `ingestedAt`, `createdAt`, `updatedAt` FROM `releases`;--> statement-breakpoint
DROP TABLE `releases`;--> statement-breakpoint
ALTER TABLE `__new_releases` RENAME TO `releases`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_snapshots` (
	`id` text PRIMARY KEY,
	`snapshotLineageId` text,
	`parentSnapshotId` text,
	`resourceType` text NOT NULL,
	`code` text NOT NULL,
	`cohortKey` text NOT NULL,
	`geometryStatus` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`publishedAt` text,
	`validFrom` text,
	`validTo` text,
	`notes` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_snapshots_snapshotLineageId_snapshotLineages_id_fk` FOREIGN KEY (`snapshotLineageId`) REFERENCES `snapshotLineages`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_snapshots`(`id`, `snapshotLineageId`, `parentSnapshotId`, `resourceType`, `code`, `cohortKey`, `geometryStatus`, `revision`, `status`, `publishedAt`, `validFrom`, `validTo`, `notes`, `createdAt`, `updatedAt`) SELECT `id`, `snapshotLineageId`, `parentSnapshotId`, `resourceType`, `code`, `cohortKey`, CASE WHEN `resourceType` IN ('divisionArea', 'divisionBoundary') THEN `geometryStatus` ELSE NULL END, `revision`, `status`, `publishedAt`, `validFrom`, `validTo`, `notes`, `createdAt`, `updatedAt` FROM `snapshots`;--> statement-breakpoint
DROP TABLE `snapshots`;--> statement-breakpoint
ALTER TABLE `__new_snapshots` RENAME TO `snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `releases_sourceReleaseId_idx` ON `releases` (`sourceReleaseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_datasetId_resourceType_sourceVersion_unique_idx` ON `releases` (`datasetId`,`resourceType`,`sourceVersion`);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_id_datasetId_unique_idx` ON `releases` (`id`,`datasetId`);--> statement-breakpoint
CREATE INDEX `releases_status_idx` ON `releases` (`status`);--> statement-breakpoint
CREATE INDEX `releases_supersededByReleaseId_idx` ON `releases` (`supersededByReleaseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_resourceType_code_unique_idx` ON `snapshots` (`resourceType`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_id_resourceType_unique_idx` ON `snapshots` (`id`,`resourceType`);--> statement-breakpoint
CREATE INDEX `snapshots_resourceType_status_idx` ON `snapshots` (`resourceType`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_lineage_cohort_revision_unique_idx` ON `snapshots` (`snapshotLineageId`,`cohortKey`,`revision`);--> statement-breakpoint
CREATE INDEX `snapshots_parentSnapshotId_idx` ON `snapshots` (`parentSnapshotId`);--> statement-breakpoint
ALTER TABLE `sourceReleases` DROP COLUMN `geometryStatus`;
