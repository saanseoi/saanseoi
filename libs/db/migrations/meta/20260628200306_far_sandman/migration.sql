ALTER TABLE `apiReleaseSets` RENAME COLUMN `canonicalSchemaVersion` TO `schemaVersion`;--> statement-breakpoint
ALTER TABLE `apiReleaseSets` RENAME COLUMN `canonicalLogicVersion` TO `rulesetVersion`;--> statement-breakpoint
ALTER TABLE `snapshots` RENAME COLUMN `family` TO `resourceType`;--> statement-breakpoint
ALTER TABLE `dataShards` RENAME COLUMN `kind` TO `shardType`;--> statement-breakpoint
ALTER TABLE `publishers` ADD `versionHash` text NOT NULL;--> statement-breakpoint
ALTER TABLE `licenses` ADD `versionHash` text NOT NULL;--> statement-breakpoint
ALTER TABLE `datasets` ADD `versionHash` text NOT NULL;--> statement-breakpoint
ALTER TABLE `apiEndpoints` ADD `versionHash` text NOT NULL;--> statement-breakpoint
ALTER TABLE `apiFieldProvenance` ADD `versionHash` text NOT NULL;--> statement-breakpoint
ALTER TABLE `apiReleaseSets` ADD `versionHash` text NOT NULL;--> statement-breakpoint
ALTER TABLE `apiVersions` ADD `familyType` text NOT NULL;--> statement-breakpoint
ALTER TABLE `apiVersions` ADD `version` text NOT NULL;--> statement-breakpoint
ALTER TABLE `apiVersions` ADD `publishedAt` integer;--> statement-breakpoint
ALTER TABLE `apiVersions` ADD `deprecatedAt` integer;--> statement-breakpoint
ALTER TABLE `apiVersions` ADD `retiredAt` integer;--> statement-breakpoint
ALTER TABLE `apiVersions` ADD `versionHash` text NOT NULL;--> statement-breakpoint
ALTER TABLE `dataShards` ADD `versionHash` text NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_apiReleaseSetSnapshots` (
	`apiReleaseSetId` text NOT NULL,
	`snapshotId` text NOT NULL,
	CONSTRAINT `apiReleaseSetSnapshots_pk` PRIMARY KEY(`apiReleaseSetId`, `snapshotId`),
	CONSTRAINT `fk_apiReleaseSetSnapshots_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apiReleaseSetSnapshots_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_apiReleaseSetSnapshots`(`apiReleaseSetId`, `snapshotId`) SELECT `apiReleaseSetId`, `snapshotId` FROM `apiReleaseSetSnapshots`;--> statement-breakpoint
DROP TABLE `apiReleaseSetSnapshots`;--> statement-breakpoint
ALTER TABLE `__new_apiReleaseSetSnapshots` RENAME TO `apiReleaseSetSnapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshots_family_code_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshots_id_family_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshots_family_status_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `dataShards_kind_region_year_env_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `dataShards_kind_env_unscoped_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `dataShards_kind_region_env_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `dataShards_kind_year_env_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `dataShards_kind_region_year_env_scoped_unique_idx`;--> statement-breakpoint
CREATE INDEX `apiReleaseSetSnapshots_snapshotId_idx` ON `apiReleaseSetSnapshots` (`snapshotId`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_resourceType_code_unique_idx` ON `snapshots` (`resourceType`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_id_resourceType_unique_idx` ON `snapshots` (`id`,`resourceType`);--> statement-breakpoint
CREATE INDEX `snapshots_resourceType_status_idx` ON `snapshots` (`resourceType`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_shardType_region_year_env_unique_idx` ON `dataShards` (`shardType`,`regionCode`,`year`,`environment`);--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_shardType_env_unscoped_unique_idx` ON `dataShards` (`shardType`,`environment`) WHERE "dataShards"."regionCode" is null and "dataShards"."year" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_shardType_region_env_unique_idx` ON `dataShards` (`shardType`,`regionCode`,`environment`) WHERE "dataShards"."regionCode" is not null and "dataShards"."year" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_shardType_year_env_unique_idx` ON `dataShards` (`shardType`,`year`,`environment`) WHERE "dataShards"."regionCode" is null and "dataShards"."year" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_shardType_region_year_env_scoped_unique_idx` ON `dataShards` (`shardType`,`regionCode`,`year`,`environment`) WHERE "dataShards"."regionCode" is not null and "dataShards"."year" is not null;--> statement-breakpoint
DROP TABLE `apiEndpointDatasets`;--> statement-breakpoint
ALTER TABLE `apiEndpoints` DROP COLUMN `resourceType`;--> statement-breakpoint
ALTER TABLE `releaseSetShardAssignments` DROP COLUMN `createdAt`;--> statement-breakpoint
ALTER TABLE `releaseShardAssignments` DROP COLUMN `createdAt`;