CREATE TABLE `apiVersionReleaseSets` (
	`id` text PRIMARY KEY,
	`apiVersionId` text NOT NULL,
	`apiReleaseSetId` text NOT NULL,
	`apiCompositionId` text,
	`supersedesApiReleaseSetId` text,
	`status` text NOT NULL,
	`publishedAt` text,
	`validFrom` text,
	`validTo` text,
	`notes` text,
	`guide` text,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_apiVersionReleaseSets_apiVersionId_apiVersions_id_fk` FOREIGN KEY (`apiVersionId`) REFERENCES `apiVersions`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_apiVersionReleaseSets_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apiVersionReleaseSets_apiCompositionId_apiComposition_id_fk` FOREIGN KEY (`apiCompositionId`) REFERENCES `apiComposition`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_apiVersionReleaseSets_supersedesApiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`supersedesApiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `apiVersionReleaseSets` (`id`, `apiVersionId`, `apiReleaseSetId`, `apiCompositionId`, `supersedesApiReleaseSetId`, `status`, `publishedAt`, `validFrom`, `validTo`, `notes`, `guide`, `versionHash`, `createdAt`, `updatedAt`)
SELECT `id`, `apiVersionId`, `id`, `apiCompositionId`, `supersedesApiReleaseSetId`, `status`, `publishedAt`, `validFrom`, `validTo`, `notes`, `guide`, `versionHash`, `createdAt`, `updatedAt`
FROM `apiReleaseSets`;
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_apiCatalogRevisionReleaseSets` (
	`apiCatalogRevisionId` text NOT NULL,
	`apiVersionReleaseSetId` text NOT NULL,
	`domainCode` text NOT NULL,
	`cohortKey` text NOT NULL,
	`isDefault` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `apiCatalogRevisionReleaseSets_pk` PRIMARY KEY(`apiCatalogRevisionId`, `domainCode`, `cohortKey`),
	CONSTRAINT `fk_apiCatalogRevisionReleaseSets_apiCatalogRevisionId_apiCatalogRevisions_id_fk` FOREIGN KEY (`apiCatalogRevisionId`) REFERENCES `apiCatalogRevisions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apiCatalogRevisionReleaseSets_apiVersionReleaseSetId_apiVersionReleaseSets_id_fk` FOREIGN KEY (`apiVersionReleaseSetId`) REFERENCES `apiVersionReleaseSets`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_apiCatalogRevisionReleaseSets`(`apiCatalogRevisionId`, `apiVersionReleaseSetId`, `domainCode`, `cohortKey`, `isDefault`, `createdAt`)
SELECT `catalog`.`apiCatalogRevisionId`, `versionReleaseSet`.`id`, `catalog`.`domainCode`, `catalog`.`cohortKey`, `catalog`.`isDefault`, `catalog`.`createdAt`
FROM `apiCatalogRevisionReleaseSets` AS `catalog`
INNER JOIN `apiVersionReleaseSets` AS `versionReleaseSet` ON `versionReleaseSet`.`apiReleaseSetId` = `catalog`.`apiReleaseSetId`;
--> statement-breakpoint
DROP TABLE `apiCatalogRevisionReleaseSets`;--> statement-breakpoint
ALTER TABLE `__new_apiCatalogRevisionReleaseSets` RENAME TO `apiCatalogRevisionReleaseSets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__backup_apiVersionReleaseSets` AS SELECT * FROM `apiVersionReleaseSets`;--> statement-breakpoint
CREATE TABLE `__backup_apiCatalogRevisionReleaseSets` AS SELECT * FROM `apiCatalogRevisionReleaseSets`;--> statement-breakpoint
CREATE TABLE `__backup_apiReleaseSetSnapshots` AS SELECT * FROM `apiReleaseSetSnapshots`;--> statement-breakpoint
CREATE TABLE `__backup_apiFieldProvenance` AS SELECT * FROM `apiFieldProvenance`;--> statement-breakpoint
CREATE TABLE `__backup_stats` AS SELECT * FROM `stats` WHERE `apiReleaseSetId` IS NOT NULL;--> statement-breakpoint
CREATE TABLE `__backup_releaseSetLifecycleJournal` AS
SELECT `id`, `resourceReleaseId`, `relatedResourceReleaseId`, `snapshotId`, `apiReleaseSetId`, `action`, `statusFrom`, `statusTo`, `reason`, `metadataJson`, `createdAt`
FROM `releaseSetLifecycleJournal`;--> statement-breakpoint
UPDATE `apiVersionReleaseSets` SET `supersedesApiReleaseSetId` = NULL;--> statement-breakpoint
CREATE TABLE `__new_apiReleaseSets` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL,
	`regionCode` text,
	`domainCode` text DEFAULT 'default' NOT NULL,
	`cohortKey` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`effectiveFrom` text,
	`schemaVersion` text NOT NULL,
	`rulesetVersion` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_apiReleaseSets`(`id`, `code`, `regionCode`, `domainCode`, `cohortKey`, `revision`, `effectiveFrom`, `schemaVersion`, `rulesetVersion`, `versionHash`, `createdAt`, `updatedAt`) SELECT `id`, `code`, `regionCode`, `domainCode`, `cohortKey`, `revision`, `effectiveFrom`, `schemaVersion`, `rulesetVersion`, `versionHash`, `createdAt`, `updatedAt` FROM `apiReleaseSets`;--> statement-breakpoint
DROP TABLE `apiReleaseSets`;--> statement-breakpoint
ALTER TABLE `__new_apiReleaseSets` RENAME TO `apiReleaseSets`;--> statement-breakpoint
DELETE FROM `apiVersionReleaseSets`;--> statement-breakpoint
INSERT INTO `apiVersionReleaseSets` SELECT * FROM `__backup_apiVersionReleaseSets`;--> statement-breakpoint
DELETE FROM `apiCatalogRevisionReleaseSets`;--> statement-breakpoint
INSERT INTO `apiCatalogRevisionReleaseSets` SELECT * FROM `__backup_apiCatalogRevisionReleaseSets`;--> statement-breakpoint
DELETE FROM `apiReleaseSetSnapshots`;--> statement-breakpoint
INSERT INTO `apiReleaseSetSnapshots` SELECT * FROM `__backup_apiReleaseSetSnapshots`;--> statement-breakpoint
DELETE FROM `apiFieldProvenance`;--> statement-breakpoint
INSERT INTO `apiFieldProvenance` SELECT * FROM `__backup_apiFieldProvenance`;--> statement-breakpoint
DELETE FROM `stats` WHERE apiReleaseSetId IS NOT NULL;--> statement-breakpoint
INSERT INTO `stats` SELECT * FROM `__backup_stats`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_releaseSetLifecycleJournal` (
	`id` text PRIMARY KEY,
	`resourceReleaseId` text NOT NULL,
	`relatedResourceReleaseId` text,
	`snapshotId` text,
	`apiVersionReleaseSetId` text,
	`action` text NOT NULL,
	`statusFrom` text,
	`statusTo` text,
	`reason` text,
	`metadataJson` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_publishedDataJournal_resourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`resourceReleaseId`) REFERENCES `resourceReleases`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_publishedDataJournal_relatedResourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`relatedResourceReleaseId`) REFERENCES `resourceReleases`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_publishedDataJournal_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_releaseSetLifecycleJournal_apiVersionReleaseSetId_apiVersionReleaseSets_id_fk` FOREIGN KEY (`apiVersionReleaseSetId`) REFERENCES `apiVersionReleaseSets`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
INSERT INTO `__new_releaseSetLifecycleJournal`(`id`, `resourceReleaseId`, `relatedResourceReleaseId`, `snapshotId`, `apiVersionReleaseSetId`, `action`, `statusFrom`, `statusTo`, `reason`, `metadataJson`, `createdAt`)
SELECT `journal`.`id`, `journal`.`resourceReleaseId`, `journal`.`relatedResourceReleaseId`, `journal`.`snapshotId`, `versionReleaseSet`.`id`, `journal`.`action`, `journal`.`statusFrom`, `journal`.`statusTo`, `journal`.`reason`, `journal`.`metadataJson`, `journal`.`createdAt`
FROM `releaseSetLifecycleJournal` AS `journal`
LEFT JOIN `apiVersionReleaseSets` AS `versionReleaseSet` ON `versionReleaseSet`.`apiReleaseSetId` = `journal`.`apiReleaseSetId`;--> statement-breakpoint
DROP TABLE `releaseSetLifecycleJournal`;--> statement-breakpoint
ALTER TABLE `__new_releaseSetLifecycleJournal` RENAME TO `releaseSetLifecycleJournal`;--> statement-breakpoint
DELETE FROM `releaseSetLifecycleJournal`;--> statement-breakpoint
INSERT INTO `releaseSetLifecycleJournal` (`id`, `resourceReleaseId`, `relatedResourceReleaseId`, `snapshotId`, `apiVersionReleaseSetId`, `action`, `statusFrom`, `statusTo`, `reason`, `metadataJson`, `createdAt`)
SELECT `backup`.`id`, `backup`.`resourceReleaseId`, `backup`.`relatedResourceReleaseId`, `backup`.`snapshotId`, `versionReleaseSet`.`id`, `backup`.`action`, `backup`.`statusFrom`, `backup`.`statusTo`, `backup`.`reason`, `backup`.`metadataJson`, `backup`.`createdAt`
FROM `__backup_releaseSetLifecycleJournal` AS `backup`
LEFT JOIN `apiVersionReleaseSets` AS `versionReleaseSet` ON `versionReleaseSet`.`apiReleaseSetId` = `backup`.`apiReleaseSetId`;--> statement-breakpoint
DROP TABLE `__backup_apiVersionReleaseSets`;--> statement-breakpoint
DROP TABLE `__backup_apiCatalogRevisionReleaseSets`;--> statement-breakpoint
DROP TABLE `__backup_apiReleaseSetSnapshots`;--> statement-breakpoint
DROP TABLE `__backup_apiFieldProvenance`;--> statement-breakpoint
DROP TABLE `__backup_stats`;--> statement-breakpoint
DROP TABLE `__backup_releaseSetLifecycleJournal`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `apiReleaseSets_apiVersionId_code_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `apiReleaseSets_status_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `apiCatalogRevisionReleaseSets_release_unique_idx` ON `apiCatalogRevisionReleaseSets` (`apiCatalogRevisionId`,`apiVersionReleaseSetId`);--> statement-breakpoint
CREATE INDEX `apiCatalogRevisionReleaseSets_release_idx` ON `apiCatalogRevisionReleaseSets` (`apiVersionReleaseSetId`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiReleaseSets_code_schema_ruleset_unique_idx` ON `apiReleaseSets` (`code`,`schemaVersion`,`rulesetVersion`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiReleaseSets_domain_cohort_revision_unique_idx` ON `apiReleaseSets` (`regionCode`,`domainCode`,`cohortKey`,`revision`,`schemaVersion`,`rulesetVersion`);--> statement-breakpoint
CREATE INDEX `releaseSetLifecycleJournal_resourceReleaseId_idx` ON `releaseSetLifecycleJournal` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `releaseSetLifecycleJournal_relatedReleaseId_idx` ON `releaseSetLifecycleJournal` (`relatedResourceReleaseId`);--> statement-breakpoint
CREATE INDEX `releaseSetLifecycleJournal_action_idx` ON `releaseSetLifecycleJournal` (`action`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiVersionReleaseSets_version_release_unique_idx` ON `apiVersionReleaseSets` (`apiVersionId`,`apiReleaseSetId`);--> statement-breakpoint
CREATE INDEX `apiVersionReleaseSets_version_status_idx` ON `apiVersionReleaseSets` (`apiVersionId`,`status`);--> statement-breakpoint
CREATE INDEX `apiVersionReleaseSets_release_idx` ON `apiVersionReleaseSets` (`apiReleaseSetId`);
