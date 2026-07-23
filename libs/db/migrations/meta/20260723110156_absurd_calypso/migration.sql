CREATE TABLE `datasetResourceTypes` (
	`datasetId` text NOT NULL,
	`resourceType` text NOT NULL,
	CONSTRAINT `datasetResourceTypes_pk` PRIMARY KEY(`datasetId`, `resourceType`),
	CONSTRAINT `fk_datasetResourceTypes_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
ALTER TABLE `datasets` ADD `sourceVariant` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `releases` ADD `resourceType` text NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `datasets_region_theme_type_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `releases_datasetId_sourceVersion_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshotLineages_primaryDataset_variant_unique_idx`;--> statement-breakpoint
CREATE INDEX `datasetResourceTypes_resourceType_idx` ON `datasetResourceTypes` (`resourceType`);--> statement-breakpoint
CREATE INDEX `datasets_region_theme_idx` ON `datasets` (`regionCode`,`theme`);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_datasetId_resourceType_sourceVersion_unique_idx` ON `releases` (`datasetId`,`resourceType`,`sourceVersion`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshotLineages_primaryDataset_resourceType_variant_unique_idx` ON `snapshotLineages` (`primaryDatasetId`,`resourceType`,`variant`);--> statement-breakpoint
ALTER TABLE `datasets` DROP COLUMN `type`;