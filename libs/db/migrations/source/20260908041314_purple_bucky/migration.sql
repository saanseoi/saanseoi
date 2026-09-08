PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_overtureDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `overtureDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_overtureDivisionAreas`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt` FROM `overtureDivisionAreas`;--> statement-breakpoint
DROP TABLE `overtureDivisionAreas`;--> statement-breakpoint
ALTER TABLE `__new_overtureDivisionAreas` RENAME TO `overtureDivisionAreas`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_overtureDivisionBoundaries` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `overtureDivisionBoundaries_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_overtureDivisionBoundaries`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt` FROM `overtureDivisionBoundaries`;--> statement-breakpoint
DROP TABLE `overtureDivisionBoundaries`;--> statement-breakpoint
ALTER TABLE `__new_overtureDivisionBoundaries` RENAME TO `overtureDivisionBoundaries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_overtureDivisions` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `overtureDivisions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_overtureDivisions`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt` FROM `overtureDivisions`;--> statement-breakpoint
DROP TABLE `overtureDivisions`;--> statement-breakpoint
ALTER TABLE `__new_overtureDivisions` RENAME TO `overtureDivisions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_overturePlaces` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `overturePlaces_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_overturePlaces`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt` FROM `overturePlaces`;--> statement-breakpoint
DROP TABLE `overturePlaces`;--> statement-breakpoint
ALTER TABLE `__new_overturePlaces` RENAME TO `overturePlaces`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovAlsAddresses2d` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovAlsAddresses2d_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovAlsAddresses2d`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt` FROM `hkgovAlsAddresses2d`;--> statement-breakpoint
DROP TABLE `hkgovAlsAddresses2d`;--> statement-breakpoint
ALTER TABLE `__new_hkgovAlsAddresses2d` RENAME TO `hkgovAlsAddresses2d`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovAlsAddresses3d` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sources` text,
	`rawProperties` text NOT NULL,
	CONSTRAINT `hkgovAlsAddresses3d_pk` PRIMARY KEY(`releaseId`, `sourceRecordId`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovAlsAddresses3d`(`sourceRecordId`, `versionHash`, `releaseId`, `createdAt`, `updatedAt`, `sources`, `rawProperties`) SELECT `sourceRecordId`, `versionHash`, `releaseId`, `createdAt`, `updatedAt`, `sources`, `rawProperties` FROM `hkgovAlsAddresses3d`;--> statement-breakpoint
DROP TABLE `hkgovAlsAddresses3d`;--> statement-breakpoint
ALTER TABLE `__new_hkgovAlsAddresses3d` RENAME TO `hkgovAlsAddresses3d`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovLandsdPlaceNames` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	`placeNames` text NOT NULL,
	CONSTRAINT `hkgovLandsdPlaceNames_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovLandsdPlaceNames`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`, `placeNames`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`, `placeNames` FROM `hkgovLandsdPlaceNames`;--> statement-breakpoint
DROP TABLE `hkgovLandsdPlaceNames`;--> statement-breakpoint
ALTER TABLE `__new_hkgovLandsdPlaceNames` RENAME TO `hkgovLandsdPlaceNames`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovLandsdRoadCentrelines` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sources` text,
	`rawProperties` text,
	`sourceGeometry` text NOT NULL,
	CONSTRAINT `hkgovLandsdRoadCentrelines_pk` PRIMARY KEY(`sourceRecordId`, `releaseId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovLandsdRoadCentrelines`(`sourceRecordId`, `versionHash`, `releaseId`, `createdAt`, `updatedAt`, `sources`, `rawProperties`, `sourceGeometry`) SELECT `sourceRecordId`, `versionHash`, `releaseId`, `createdAt`, `updatedAt`, `sources`, `rawProperties`, `sourceGeometry` FROM `hkgovLandsdRoadCentrelines`;--> statement-breakpoint
DROP TABLE `hkgovLandsdRoadCentrelines`;--> statement-breakpoint
ALTER TABLE `__new_hkgovLandsdRoadCentrelines` RENAME TO `hkgovLandsdRoadCentrelines`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovLandsdStreetBaselineRecords` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sources` text,
	`deferToNotices` integer NOT NULL,
	`nameEn` text NOT NULL,
	`nameZhHant` text NOT NULL,
	`districtCode` text NOT NULL,
	CONSTRAINT `hkgovLandsdStreetBaselineRecords_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovLandsdStreetBaselineRecords`(`sourceRecordId`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sources`, `deferToNotices`, `nameEn`, `nameZhHant`, `districtCode`) SELECT `sourceRecordId`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sources`, `deferToNotices`, `nameEn`, `nameZhHant`, `districtCode` FROM `hkgovLandsdStreetBaselineRecords`;--> statement-breakpoint
DROP TABLE `hkgovLandsdStreetBaselineRecords`;--> statement-breakpoint
ALTER TABLE `__new_hkgovLandsdStreetBaselineRecords` RENAME TO `hkgovLandsdStreetBaselineRecords`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovLandsdStreetNotices` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sources` text,
	`gazetteDate` text NOT NULL,
	`kind` text NOT NULL,
	`noticeRef` text NOT NULL,
	`effectiveDate` text,
	`previousNoticeRefs` text,
	`rawExtractedText` text,
	`parserDiagnostics` text,
	`districtCodes` text,
	`nameEn` text NOT NULL,
	`nameZhHant` text NOT NULL,
	`descriptionEn` text,
	`descriptionZhHant` text,
	`evidenceAssets` text NOT NULL,
	CONSTRAINT `hkgovLandsdStreetNotices_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovLandsdStreetNotices`(`sourceRecordId`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sources`, `gazetteDate`, `kind`, `noticeRef`, `effectiveDate`, `previousNoticeRefs`, `rawExtractedText`, `parserDiagnostics`, `districtCodes`, `nameEn`, `nameZhHant`, `descriptionEn`, `descriptionZhHant`, `evidenceAssets`) SELECT `sourceRecordId`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sources`, `gazetteDate`, `kind`, `noticeRef`, `effectiveDate`, `previousNoticeRefs`, `rawExtractedText`, `parserDiagnostics`, `districtCodes`, `nameEn`, `nameZhHant`, `descriptionEn`, `descriptionZhHant`, `evidenceAssets` FROM `hkgovLandsdStreetNotices`;--> statement-breakpoint
DROP TABLE `hkgovLandsdStreetNotices`;--> statement-breakpoint
ALTER TABLE `__new_hkgovLandsdStreetNotices` RENAME TO `hkgovLandsdStreetNotices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovHydSensitiveStreets` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	CONSTRAINT `hkgovHydSensitiveStreets_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovHydSensitiveStreets`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry` FROM `hkgovHydSensitiveStreets`;--> statement-breakpoint
DROP TABLE `hkgovHydSensitiveStreets`;--> statement-breakpoint
ALTER TABLE `__new_hkgovHydSensitiveStreets` RENAME TO `hkgovHydSensitiveStreets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovHydStrategicStreets` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	CONSTRAINT `hkgovHydStrategicStreets_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovHydStrategicStreets`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry` FROM `hkgovHydStrategicStreets`;--> statement-breakpoint
DROP TABLE `hkgovHydStrategicStreets`;--> statement-breakpoint
ALTER TABLE `__new_hkgovHydStrategicStreets` RENAME TO `hkgovHydStrategicStreets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovHydStreetNamePlates` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	CONSTRAINT `hkgovHydStreetNamePlates_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovHydStreetNamePlates`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry` FROM `hkgovHydStreetNamePlates`;--> statement-breakpoint
DROP TABLE `hkgovHydStreetNamePlates`;--> statement-breakpoint
ALTER TABLE `__new_hkgovHydStreetNamePlates` RENAME TO `hkgovHydStreetNamePlates`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovTdPedestrianStreets` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	`kind` text NOT NULL,
	CONSTRAINT `hkgovTdPedestrianStreets_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovTdPedestrianStreets`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`, `kind`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`, `kind` FROM `hkgovTdPedestrianStreets`;--> statement-breakpoint
DROP TABLE `hkgovTdPedestrianStreets`;--> statement-breakpoint
ALTER TABLE `__new_hkgovTdPedestrianStreets` RENAME TO `hkgovTdPedestrianStreets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovHadDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text,
	CONSTRAINT `hkgovHadDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovHadDivisionAreas`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry` FROM `hkgovHadDivisionAreas`;--> statement-breakpoint
DROP TABLE `hkgovHadDivisionAreas`;--> statement-breakpoint
ALTER TABLE `__new_hkgovHadDivisionAreas` RENAME TO `hkgovHadDivisionAreas`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovCenstatdDistrictLandAreaPopulationDensities` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	CONSTRAINT `hkgovCenstatdDistrictLandAreaPopulationDensities_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovCenstatdDistrictLandAreaPopulationDensities`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry` FROM `hkgovCenstatdDistrictLandAreaPopulationDensities`;--> statement-breakpoint
DROP TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities`;--> statement-breakpoint
ALTER TABLE `__new_hkgovCenstatdDistrictLandAreaPopulationDensities` RENAME TO `hkgovCenstatdDistrictLandAreaPopulationDensities`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovCenstatdDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	`censusYear` text NOT NULL,
	CONSTRAINT `hkgovCenstatdDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovCenstatdDivisionAreas`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`, `censusYear`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`, `censusYear` FROM `hkgovCenstatdDivisionAreas`;--> statement-breakpoint
DROP TABLE `hkgovCenstatdDivisionAreas`;--> statement-breakpoint
ALTER TABLE `__new_hkgovCenstatdDivisionAreas` RENAME TO `hkgovCenstatdDivisionAreas`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovCenstatdStatistics` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text,
	CONSTRAINT `hkgovCenstatdStatistics_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovCenstatdStatistics`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry` FROM `hkgovCenstatdStatistics`;--> statement-breakpoint
DROP TABLE `hkgovCenstatdStatistics`;--> statement-breakpoint
ALTER TABLE `__new_hkgovCenstatdStatistics` RENAME TO `hkgovCenstatdStatistics`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovPlandNewTowns` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	`wasGeometryRepaired` integer DEFAULT false NOT NULL,
	`repairedGeometry` text,
	CONSTRAINT `hkgovPlandNewTowns_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovPlandNewTowns`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`, `wasGeometryRepaired`, `repairedGeometry`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`, `wasGeometryRepaired`, `repairedGeometry` FROM `hkgovPlandNewTowns`;--> statement-breakpoint
DROP TABLE `hkgovPlandNewTowns`;--> statement-breakpoint
ALTER TABLE `__new_hkgovPlandNewTowns` RENAME TO `hkgovPlandNewTowns`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovPlandPlanningCells` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	`wasGeometryRepaired` integer DEFAULT false NOT NULL,
	`repairedGeometry` text,
	CONSTRAINT `hkgovPlandPlanningCells_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovPlandPlanningCells`(`sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`, `wasGeometryRepaired`, `repairedGeometry`) SELECT `sourceRecordId`, `sources`, `rawProperties`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`, `sourceGeometry`, `wasGeometryRepaired`, `repairedGeometry` FROM `hkgovPlandPlanningCells`;--> statement-breakpoint
DROP TABLE `hkgovPlandPlanningCells`;--> statement-breakpoint
ALTER TABLE `__new_hkgovPlandPlanningCells` RENAME TO `hkgovPlandPlanningCells`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_releaseId_idx` ON `overtureDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_sourceRecordId_idx` ON `overtureDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_current_lookup_idx` ON `overtureDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_release_validity_idx` ON `overtureDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_releaseId_idx` ON `overtureDivisionBoundaries` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_sourceRecordId_idx` ON `overtureDivisionBoundaries` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_current_lookup_idx` ON `overtureDivisionBoundaries` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_release_validity_idx` ON `overtureDivisionBoundaries` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_releaseId_idx` ON `overtureDivisions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_sourceRecordId_idx` ON `overtureDivisions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_current_lookup_idx` ON `overtureDivisions` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_release_validity_idx` ON `overtureDivisions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overturePlaces_releaseId_idx` ON `overturePlaces` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overturePlaces_sourceRecordId_idx` ON `overturePlaces` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overturePlaces_current_lookup_idx` ON `overturePlaces` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overturePlaces_release_validity_idx` ON `overturePlaces` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_releaseId_idx` ON `hkgovAlsAddresses2d` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_sourceRecordId_idx` ON `hkgovAlsAddresses2d` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_current_lookup_idx` ON `hkgovAlsAddresses2d` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_release_validity_idx` ON `hkgovAlsAddresses2d` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses3d_releaseId_idx` ON `hkgovAlsAddresses3d` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses3d_sourceRecordId_idx` ON `hkgovAlsAddresses3d` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_releaseId_idx` ON `hkgovLandsdPlaceNames` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_sourceRecordId_idx` ON `hkgovLandsdPlaceNames` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_current_lookup_idx` ON `hkgovLandsdPlaceNames` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_release_validity_idx` ON `hkgovLandsdPlaceNames` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_releaseId_idx` ON `hkgovLandsdRoadCentrelines` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_sourceRecordId_idx` ON `hkgovLandsdRoadCentrelines` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_releaseId_idx` ON `hkgovLandsdStreetBaselineRecords` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_sourceRecordId_idx` ON `hkgovLandsdStreetBaselineRecords` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_current_lookup_idx` ON `hkgovLandsdStreetBaselineRecords` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_release_validity_idx` ON `hkgovLandsdStreetBaselineRecords` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_deferToNotices_idx` ON `hkgovLandsdStreetBaselineRecords` (`deferToNotices`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_releaseId_idx` ON `hkgovLandsdStreetNotices` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_sourceRecordId_idx` ON `hkgovLandsdStreetNotices` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_current_lookup_idx` ON `hkgovLandsdStreetNotices` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_release_validity_idx` ON `hkgovLandsdStreetNotices` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_gazetteDate_idx` ON `hkgovLandsdStreetNotices` (`gazetteDate`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_kind_idx` ON `hkgovLandsdStreetNotices` (`kind`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_noticeRef_idx` ON `hkgovLandsdStreetNotices` (`noticeRef`);--> statement-breakpoint
CREATE INDEX `hkgovHydSensitiveStreets_releaseId_idx` ON `hkgovHydSensitiveStreets` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHydSensitiveStreets_sourceRecordId_idx` ON `hkgovHydSensitiveStreets` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovHydSensitiveStreets_current_lookup_idx` ON `hkgovHydSensitiveStreets` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovHydSensitiveStreets_release_validity_idx` ON `hkgovHydSensitiveStreets` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovHydStrategicStreets_releaseId_idx` ON `hkgovHydStrategicStreets` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHydStrategicStreets_sourceRecordId_idx` ON `hkgovHydStrategicStreets` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovHydStrategicStreets_current_lookup_idx` ON `hkgovHydStrategicStreets` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovHydStrategicStreets_release_validity_idx` ON `hkgovHydStrategicStreets` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_releaseId_idx` ON `hkgovHydStreetNamePlates` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_sourceRecordId_idx` ON `hkgovHydStreetNamePlates` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_current_lookup_idx` ON `hkgovHydStreetNamePlates` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_release_validity_idx` ON `hkgovHydStreetNamePlates` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_releaseId_idx` ON `hkgovTdPedestrianStreets` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_sourceRecordId_idx` ON `hkgovTdPedestrianStreets` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_current_lookup_idx` ON `hkgovTdPedestrianStreets` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_release_validity_idx` ON `hkgovTdPedestrianStreets` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_kind_idx` ON `hkgovTdPedestrianStreets` (`kind`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_releaseId_idx` ON `hkgovHadDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_sourceRecordId_idx` ON `hkgovHadDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_current_lookup_idx` ON `hkgovHadDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_release_validity_idx` ON `hkgovHadDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_releaseId_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_sourceRecordId_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_current_lookup_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_release_validity_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_releaseId_idx` ON `hkgovCenstatdDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_sourceRecordId_idx` ON `hkgovCenstatdDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_current_lookup_idx` ON `hkgovCenstatdDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_release_validity_idx` ON `hkgovCenstatdDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_releaseId_idx` ON `hkgovCenstatdStatistics` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_sourceRecordId_idx` ON `hkgovCenstatdStatistics` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_current_lookup_idx` ON `hkgovCenstatdStatistics` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_release_validity_idx` ON `hkgovCenstatdStatistics` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTowns_releaseId_idx` ON `hkgovPlandNewTowns` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTowns_sourceRecordId_idx` ON `hkgovPlandNewTowns` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTowns_current_lookup_idx` ON `hkgovPlandNewTowns` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTowns_release_validity_idx` ON `hkgovPlandNewTowns` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_releaseId_idx` ON `hkgovPlandPlanningCells` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_sourceRecordId_idx` ON `hkgovPlandPlanningCells` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_current_lookup_idx` ON `hkgovPlandPlanningCells` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_release_validity_idx` ON `hkgovPlandPlanningCells` (`validFromRelease`,`validToRelease`);