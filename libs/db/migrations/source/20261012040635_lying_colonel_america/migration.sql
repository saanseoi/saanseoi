CREATE TABLE `hkgovCenstatdStatisticsGeometry` (
	`id` text PRIMARY KEY,
	`sourceGeometry` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDivisionAreaDerivatives` ADD `geometryId` text NOT NULL REFERENCES hkgovCenstatdStatisticsGeometry(id);--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDivisionAreaDerivatives` ADD `transformHash` text NOT NULL;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` ADD `geometryId` text NOT NULL REFERENCES hkgovCenstatdStatisticsGeometry(id);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovCenstatdStatistics` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`datasetCode` text NOT NULL,
	`geometryId` text NOT NULL,
	`sourceLocator` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovCenstatdStatistics_pk` PRIMARY KEY(`datasetCode`, `resourceReleaseId`, `sourceRecordId`, `versionHash`),
	CONSTRAINT `fk_hkgovCenstatdStatistics_geometryId_hkgovCenstatdStatisticsGeometry_id_fk` FOREIGN KEY (`geometryId`) REFERENCES `hkgovCenstatdStatisticsGeometry`(`id`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovCenstatdStatistics`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `datasetCode`, `sourceLocator`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `datasetCode`, `sourceLocator`, `createdAt`, `updatedAt` FROM `hkgovCenstatdStatistics`;--> statement-breakpoint
DROP TABLE `hkgovCenstatdStatistics`;--> statement-breakpoint
ALTER TABLE `__new_hkgovCenstatdStatistics` RENAME TO `hkgovCenstatdStatistics`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovCenstatdDivisionAreaDerivatives` (
	`geometryId` text NOT NULL,
	`transform` text NOT NULL,
	`transformHash` text NOT NULL,
	`versionHash` text NOT NULL,
	`derivation` text NOT NULL,
	`geometry` text,
	`bbox` text,
	CONSTRAINT `hkgovCenstatdDivisionAreaDerivatives_pk` PRIMARY KEY(`geometryId`, `transform`, `transformHash`),
	CONSTRAINT `fk_hkgovCenstatdDivisionAreaDerivatives_geometryId_hkgovCenstatdStatisticsGeometry_id_fk` FOREIGN KEY (`geometryId`) REFERENCES `hkgovCenstatdStatisticsGeometry`(`id`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovCenstatdDivisionAreaDerivatives`(`versionHash`, `transform`, `derivation`, `geometry`, `bbox`) SELECT `versionHash`, `transform`, `derivation`, `geometry`, `bbox` FROM `hkgovCenstatdDivisionAreaDerivatives`;--> statement-breakpoint
DROP TABLE `hkgovCenstatdDivisionAreaDerivatives`;--> statement-breakpoint
ALTER TABLE `__new_hkgovCenstatdDivisionAreaDerivatives` RENAME TO `hkgovCenstatdDivisionAreaDerivatives`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDivisionAreaDerivatives_resourceReleaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDivisionAreaDerivatives_open_records_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDivisionAreaDerivatives_release_validity_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdStatisticsReleaseMemberships_resourceReleaseId_idx`;--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_geometryId_idx` ON `hkgovCenstatdStatistics` (`geometryId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_resourceReleaseId_idx` ON `hkgovCenstatdStatistics` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_open_records_idx` ON `hkgovCenstatdStatistics` (`sourceRecordId`) WHERE "hkgovCenstatdStatistics"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_release_validity_idx` ON `hkgovCenstatdStatistics` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
DROP TABLE `hkgovCenstatdStatisticsReleaseMemberships`;