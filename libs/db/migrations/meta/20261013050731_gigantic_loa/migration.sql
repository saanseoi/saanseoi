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
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_snapshotRecipeInputs` (
	`snapshotRecipeId` text NOT NULL,
	`datasetId` text NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`maxLagDays` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`selectionPolicyJson` text NOT NULL,
	CONSTRAINT `snapshotRecipeInputs_pk` PRIMARY KEY(`snapshotRecipeId`, `datasetId`, `role`),
	CONSTRAINT `fk_snapshotRecipeInputs_snapshotRecipeId_snapshotRecipes_id_fk` FOREIGN KEY (`snapshotRecipeId`) REFERENCES `snapshotRecipes`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotRecipeInputs_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_snapshotRecipeInputs`(`snapshotRecipeId`, `datasetId`, `role`, `isRequired`, `maxLagDays`, `priority`, `selectionPolicyJson`) SELECT `snapshotRecipeId`, `datasetId`, `role`, `isRequired`, `maxLagDays`, `priority`, `selectionPolicyJson` FROM `snapshotRecipeInputs`;--> statement-breakpoint
DROP TABLE `snapshotRecipeInputs`;--> statement-breakpoint
ALTER TABLE `__new_snapshotRecipeInputs` RENAME TO `snapshotRecipeInputs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_snapshots` (
	`id` text PRIMARY KEY,
	`snapshotLineageId` text NOT NULL,
	`parentSnapshotId` text,
	`code` text NOT NULL,
	`cohortKey` text NOT NULL,
	`geometryStatus` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`publishedAt` text,
	`validFrom` text,
	`validTo` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_snapshots_snapshotLineageId_snapshotLineages_id_fk` FOREIGN KEY (`snapshotLineageId`) REFERENCES `snapshotLineages`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_snapshots`(`id`, `snapshotLineageId`, `parentSnapshotId`, `code`, `cohortKey`, `geometryStatus`, `revision`, `status`, `publishedAt`, `validFrom`, `validTo`, `createdAt`, `updatedAt`) SELECT `id`, `snapshotLineageId`, `parentSnapshotId`, `code`, `cohortKey`, `geometryStatus`, `revision`, `status`, `publishedAt`, `validFrom`, `validTo`, `createdAt`, `updatedAt` FROM `snapshots`;--> statement-breakpoint
DROP TABLE `snapshots`;--> statement-breakpoint
ALTER TABLE `__new_snapshots` RENAME TO `snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `resourceReleases_datasetId_resourceType_sourceVersion_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshots_resourceType_code_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshots_id_resourceType_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshots_resourceType_status_idx`;--> statement-breakpoint
CREATE INDEX `resourceReleases_sourceReleaseId_idx` ON `resourceReleases` (`sourceReleaseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `resourceReleases_sourceReleaseId_resourceType_unique_idx` ON `resourceReleases` (`sourceReleaseId`,`resourceType`);--> statement-breakpoint
CREATE UNIQUE INDEX `resourceReleases_id_datasetId_unique_idx` ON `resourceReleases` (`id`,`datasetId`);--> statement-breakpoint
CREATE INDEX `resourceReleases_status_idx` ON `resourceReleases` (`status`);--> statement-breakpoint
CREATE INDEX `resourceReleases_supersededByResourceReleaseId_idx` ON `resourceReleases` (`supersededByResourceReleaseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_code_unique_idx` ON `snapshots` (`code`);--> statement-breakpoint
CREATE INDEX `snapshots_status_idx` ON `snapshots` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_lineage_cohort_revision_unique_idx` ON `snapshots` (`snapshotLineageId`,`cohortKey`,`revision`);--> statement-breakpoint
CREATE INDEX `snapshots_parentSnapshotId_idx` ON `snapshots` (`parentSnapshotId`);--> statement-breakpoint
DROP TABLE `releaseProvenance`;--> statement-breakpoint
ALTER TABLE `snapshotAssemblies` DROP COLUMN `anchorCohortKey`;--> statement-breakpoint
CREATE VIEW `resourceReleaseDetails` AS select "resourceReleases"."id", "resourceReleases"."sourceReleaseId", "resourceReleases"."datasetId", "resourceReleases"."code", "resourceReleases"."resourceType", "resourceReleases"."geometryStatus", "resourceReleases"."status", "resourceReleases"."processingRules", "resourceReleases"."ingestedAt", "resourceReleases"."revokedAt", "resourceReleases"."revocationReason", "resourceReleases"."supersededByResourceReleaseId", "resourceReleases"."createdAt", "resourceReleases"."updatedAt", "sourceReleases"."sourceVersion", "sourceReleases"."sourceSchemaVersion", "sourceReleases"."publicationDate", "sourceReleases"."cohortKey", "sourceReleases"."releaseNotesUrl" from "resourceReleases" inner join "sourceReleases" on "resourceReleases"."sourceReleaseId" = "sourceReleases"."id";