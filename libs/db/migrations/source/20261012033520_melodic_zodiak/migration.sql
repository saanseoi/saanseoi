PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_overtureDivisions` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceGeometry` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `overtureDivisions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_overtureDivisions`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `overtureDivisions`;--> statement-breakpoint
DROP TABLE `overtureDivisions`;--> statement-breakpoint
ALTER TABLE `__new_overtureDivisions` RENAME TO `overtureDivisions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_overturePlaces` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceGeometry` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `overturePlaces_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_overturePlaces`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `overturePlaces`;--> statement-breakpoint
DROP TABLE `overturePlaces`;--> statement-breakpoint
ALTER TABLE `__new_overturePlaces` RENAME TO `overturePlaces`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_protomapsIslandFeatures` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceGeometry` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `protomapsIslandFeatures_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_protomapsIslandFeatures`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `protomapsIslandFeatures`;--> statement-breakpoint
DROP TABLE `protomapsIslandFeatures`;--> statement-breakpoint
ALTER TABLE `__new_protomapsIslandFeatures` RENAME TO `protomapsIslandFeatures`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovAlsAddresses2d` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceLocator` text,
	`sourceGeometry` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovAlsAddresses2d_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovAlsAddresses2d`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceLocator`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceLocator`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `hkgovAlsAddresses2d`;--> statement-breakpoint
DROP TABLE `hkgovAlsAddresses2d`;--> statement-breakpoint
ALTER TABLE `__new_hkgovAlsAddresses2d` RENAME TO `hkgovAlsAddresses2d`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovAlsAddresses3d` (
	`sourceRecordId` text NOT NULL,
	`properties` text NOT NULL,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceLocator` text,
	`sourceGeometry` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovAlsAddresses3d_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovAlsAddresses3d`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceLocator`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceLocator`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `hkgovAlsAddresses3d`;--> statement-breakpoint
DROP TABLE `hkgovAlsAddresses3d`;--> statement-breakpoint
ALTER TABLE `__new_hkgovAlsAddresses3d` RENAME TO `hkgovAlsAddresses3d`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovLandsdPlaceNames` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceGeometry` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovLandsdPlaceNames_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovLandsdPlaceNames`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `hkgovLandsdPlaceNames`;--> statement-breakpoint
DROP TABLE `hkgovLandsdPlaceNames`;--> statement-breakpoint
ALTER TABLE `__new_hkgovLandsdPlaceNames` RENAME TO `hkgovLandsdPlaceNames`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovLandsdRoadCentrelines` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sources` text,
	`sourceGeometry` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovLandsdRoadCentrelines_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovLandsdRoadCentrelines`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sources`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sources`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `hkgovLandsdRoadCentrelines`;--> statement-breakpoint
DROP TABLE `hkgovLandsdRoadCentrelines`;--> statement-breakpoint
ALTER TABLE `__new_hkgovLandsdRoadCentrelines` RENAME TO `hkgovLandsdRoadCentrelines`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovLandsdStreetBaselineRecords` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`deferToNotices` integer NOT NULL,
	`nameEn` text NOT NULL,
	`nameZhHant` text NOT NULL,
	`districtCode` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovLandsdStreetBaselineRecords_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovLandsdStreetBaselineRecords`(`sourceRecordId`, `sources`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `deferToNotices`, `nameEn`, `nameZhHant`, `districtCode`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `sources`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `deferToNotices`, `nameEn`, `nameZhHant`, `districtCode`, `createdAt`, `updatedAt` FROM `hkgovLandsdStreetBaselineRecords`;--> statement-breakpoint
DROP TABLE `hkgovLandsdStreetBaselineRecords`;--> statement-breakpoint
ALTER TABLE `__new_hkgovLandsdStreetBaselineRecords` RENAME TO `hkgovLandsdStreetBaselineRecords`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovLandsdStreetNoticeApplications` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`method` text NOT NULL,
	`disposition` text NOT NULL,
	`nameChangeScope` text,
	`retainedDescriptions` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovLandsdStreetNoticeApplications_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovLandsdStreetNoticeApplications`(`sourceRecordId`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `method`, `disposition`, `nameChangeScope`, `retainedDescriptions`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `method`, `disposition`, `nameChangeScope`, `retainedDescriptions`, `createdAt`, `updatedAt` FROM `hkgovLandsdStreetNoticeApplications`;--> statement-breakpoint
DROP TABLE `hkgovLandsdStreetNoticeApplications`;--> statement-breakpoint
ALTER TABLE `__new_hkgovLandsdStreetNoticeApplications` RENAME TO `hkgovLandsdStreetNoticeApplications`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovLandsdStreetNotices` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
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
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovLandsdStreetNotices_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovLandsdStreetNotices`(`sourceRecordId`, `sources`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `gazetteDate`, `kind`, `noticeRef`, `effectiveDate`, `previousNoticeRefs`, `rawExtractedText`, `parserDiagnostics`, `districtCodes`, `nameEn`, `nameZhHant`, `descriptionEn`, `descriptionZhHant`, `evidenceAssets`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `sources`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `gazetteDate`, `kind`, `noticeRef`, `effectiveDate`, `previousNoticeRefs`, `rawExtractedText`, `parserDiagnostics`, `districtCodes`, `nameEn`, `nameZhHant`, `descriptionEn`, `descriptionZhHant`, `evidenceAssets`, `createdAt`, `updatedAt` FROM `hkgovLandsdStreetNotices`;--> statement-breakpoint
DROP TABLE `hkgovLandsdStreetNotices`;--> statement-breakpoint
ALTER TABLE `__new_hkgovLandsdStreetNotices` RENAME TO `hkgovLandsdStreetNotices`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovHydSensitiveStreets` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sources` text,
	`sourceGeometry` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovHydSensitiveStreets_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovHydSensitiveStreets`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sources`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sources`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `hkgovHydSensitiveStreets`;--> statement-breakpoint
DROP TABLE `hkgovHydSensitiveStreets`;--> statement-breakpoint
ALTER TABLE `__new_hkgovHydSensitiveStreets` RENAME TO `hkgovHydSensitiveStreets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovHydStrategicStreets` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sources` text,
	`sourceGeometry` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovHydStrategicStreets_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovHydStrategicStreets`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sources`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sources`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `hkgovHydStrategicStreets`;--> statement-breakpoint
DROP TABLE `hkgovHydStrategicStreets`;--> statement-breakpoint
ALTER TABLE `__new_hkgovHydStrategicStreets` RENAME TO `hkgovHydStrategicStreets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovHydStreetNamePlates` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sources` text,
	`sourceGeometry` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovHydStreetNamePlates_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovHydStreetNamePlates`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sources`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sources`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `hkgovHydStreetNamePlates`;--> statement-breakpoint
DROP TABLE `hkgovHydStreetNamePlates`;--> statement-breakpoint
ALTER TABLE `__new_hkgovHydStreetNamePlates` RENAME TO `hkgovHydStreetNamePlates`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovTdPedestrianStreets` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sources` text,
	`sourceGeometry` text NOT NULL,
	`kind` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovTdPedestrianStreets_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovTdPedestrianStreets`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sources`, `sourceGeometry`, `kind`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sources`, `sourceGeometry`, `kind`, `createdAt`, `updatedAt` FROM `hkgovTdPedestrianStreets`;--> statement-breakpoint
DROP TABLE `hkgovTdPedestrianStreets`;--> statement-breakpoint
ALTER TABLE `__new_hkgovTdPedestrianStreets` RENAME TO `hkgovTdPedestrianStreets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovHadDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceGeometry` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovHadDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovHadDivisionAreas`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `hkgovHadDivisionAreas`;--> statement-breakpoint
DROP TABLE `hkgovHadDivisionAreas`;--> statement-breakpoint
ALTER TABLE `__new_hkgovHadDivisionAreas` RENAME TO `hkgovHadDivisionAreas`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovPlandNewTowns` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceGeometry` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovPlandNewTowns_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovPlandNewTowns`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `hkgovPlandNewTowns`;--> statement-breakpoint
DROP TABLE `hkgovPlandNewTowns`;--> statement-breakpoint
ALTER TABLE `__new_hkgovPlandNewTowns` RENAME TO `hkgovPlandNewTowns`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovPlandPlanningCells` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceGeometry` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovPlandPlanningCells_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovPlandPlanningCells`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `hkgovPlandPlanningCells`;--> statement-breakpoint
DROP TABLE `hkgovPlandPlanningCells`;--> statement-breakpoint
ALTER TABLE `__new_hkgovPlandPlanningCells` RENAME TO `hkgovPlandPlanningCells`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ssDivision` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceGeometry` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `ssDivision_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_ssDivision`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `ssDivision`;--> statement-breakpoint
DROP TABLE `ssDivision`;--> statement-breakpoint
ALTER TABLE `__new_ssDivision` RENAME TO `ssDivision`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_ssDivisionArea` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceGeometry` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `ssDivisionArea_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_ssDivisionArea`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `sourceGeometry`, `createdAt`, `updatedAt` FROM `ssDivisionArea`;--> statement-breakpoint
DROP TABLE `ssDivisionArea`;--> statement-breakpoint
ALTER TABLE `__new_ssDivisionArea` RENAME TO `ssDivisionArea`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovRvdAreas` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovRvdAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `validFromRelease`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovRvdAreas`(`sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `properties`, `versionHash`, `resourceReleaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt` FROM `hkgovRvdAreas`;--> statement-breakpoint
DROP TABLE `hkgovRvdAreas`;--> statement-breakpoint
ALTER TABLE `__new_hkgovRvdAreas` RENAME TO `hkgovRvdAreas`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `overtureDivisions_resourceReleaseId_idx` ON `overtureDivisions` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_open_records_idx` ON `overtureDivisions` (`sourceRecordId`) WHERE "overtureDivisions"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `overtureDivisions_release_validity_idx` ON `overtureDivisions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overturePlaces_resourceReleaseId_idx` ON `overturePlaces` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `overturePlaces_open_records_idx` ON `overturePlaces` (`sourceRecordId`) WHERE "overturePlaces"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `overturePlaces_release_validity_idx` ON `overturePlaces` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `protomapsIslandFeatures_resourceReleaseId_idx` ON `protomapsIslandFeatures` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `protomapsIslandFeatures_open_records_idx` ON `protomapsIslandFeatures` (`sourceRecordId`) WHERE "protomapsIslandFeatures"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `protomapsIslandFeatures_release_validity_idx` ON `protomapsIslandFeatures` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_resourceReleaseId_idx` ON `hkgovAlsAddresses2d` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_open_records_idx` ON `hkgovAlsAddresses2d` (`sourceRecordId`) WHERE "hkgovAlsAddresses2d"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_release_validity_idx` ON `hkgovAlsAddresses2d` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses3d_resourceReleaseId_idx` ON `hkgovAlsAddresses3d` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses3d_open_records_idx` ON `hkgovAlsAddresses3d` (`sourceRecordId`) WHERE "hkgovAlsAddresses3d"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses3d_release_validity_idx` ON `hkgovAlsAddresses3d` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_resourceReleaseId_idx` ON `hkgovLandsdPlaceNames` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_open_records_idx` ON `hkgovLandsdPlaceNames` (`sourceRecordId`) WHERE "hkgovLandsdPlaceNames"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_release_validity_idx` ON `hkgovLandsdPlaceNames` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_resourceReleaseId_idx` ON `hkgovLandsdRoadCentrelines` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_open_records_idx` ON `hkgovLandsdRoadCentrelines` (`sourceRecordId`) WHERE "hkgovLandsdRoadCentrelines"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_release_validity_idx` ON `hkgovLandsdRoadCentrelines` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_resourceReleaseId_idx` ON `hkgovLandsdStreetBaselineRecords` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_open_records_idx` ON `hkgovLandsdStreetBaselineRecords` (`sourceRecordId`) WHERE "hkgovLandsdStreetBaselineRecords"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_release_validity_idx` ON `hkgovLandsdStreetBaselineRecords` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_deferToNotices_idx` ON `hkgovLandsdStreetBaselineRecords` (`deferToNotices`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_resourceReleaseId_idx` ON `hkgovLandsdStreetNoticeApplications` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_open_records_idx` ON `hkgovLandsdStreetNoticeApplications` (`sourceRecordId`) WHERE "hkgovLandsdStreetNoticeApplications"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_release_validity_idx` ON `hkgovLandsdStreetNoticeApplications` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_resourceReleaseId_idx` ON `hkgovLandsdStreetNotices` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_open_records_idx` ON `hkgovLandsdStreetNotices` (`sourceRecordId`) WHERE "hkgovLandsdStreetNotices"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_release_validity_idx` ON `hkgovLandsdStreetNotices` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_gazetteDate_idx` ON `hkgovLandsdStreetNotices` (`gazetteDate`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_kind_idx` ON `hkgovLandsdStreetNotices` (`kind`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_noticeRef_idx` ON `hkgovLandsdStreetNotices` (`noticeRef`);--> statement-breakpoint
CREATE INDEX `hkgovHydSensitiveStreets_resourceReleaseId_idx` ON `hkgovHydSensitiveStreets` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHydSensitiveStreets_open_records_idx` ON `hkgovHydSensitiveStreets` (`sourceRecordId`) WHERE "hkgovHydSensitiveStreets"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovHydSensitiveStreets_release_validity_idx` ON `hkgovHydSensitiveStreets` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovHydStrategicStreets_resourceReleaseId_idx` ON `hkgovHydStrategicStreets` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHydStrategicStreets_open_records_idx` ON `hkgovHydStrategicStreets` (`sourceRecordId`) WHERE "hkgovHydStrategicStreets"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovHydStrategicStreets_release_validity_idx` ON `hkgovHydStrategicStreets` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_resourceReleaseId_idx` ON `hkgovHydStreetNamePlates` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_open_records_idx` ON `hkgovHydStreetNamePlates` (`sourceRecordId`) WHERE "hkgovHydStreetNamePlates"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_release_validity_idx` ON `hkgovHydStreetNamePlates` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_resourceReleaseId_idx` ON `hkgovTdPedestrianStreets` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_open_records_idx` ON `hkgovTdPedestrianStreets` (`sourceRecordId`) WHERE "hkgovTdPedestrianStreets"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_release_validity_idx` ON `hkgovTdPedestrianStreets` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_kind_idx` ON `hkgovTdPedestrianStreets` (`kind`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_resourceReleaseId_idx` ON `hkgovHadDivisionAreas` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_open_records_idx` ON `hkgovHadDivisionAreas` (`sourceRecordId`) WHERE "hkgovHadDivisionAreas"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_release_validity_idx` ON `hkgovHadDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTowns_resourceReleaseId_idx` ON `hkgovPlandNewTowns` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTowns_open_records_idx` ON `hkgovPlandNewTowns` (`sourceRecordId`) WHERE "hkgovPlandNewTowns"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTowns_release_validity_idx` ON `hkgovPlandNewTowns` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_resourceReleaseId_idx` ON `hkgovPlandPlanningCells` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_open_records_idx` ON `hkgovPlandPlanningCells` (`sourceRecordId`) WHERE "hkgovPlandPlanningCells"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_release_validity_idx` ON `hkgovPlandPlanningCells` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `ssDivision_resourceReleaseId_idx` ON `ssDivision` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `ssDivision_open_records_idx` ON `ssDivision` (`sourceRecordId`) WHERE "ssDivision"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `ssDivision_release_validity_idx` ON `ssDivision` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `ssDivisionArea_resourceReleaseId_idx` ON `ssDivisionArea` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `ssDivisionArea_open_records_idx` ON `ssDivisionArea` (`sourceRecordId`) WHERE "ssDivisionArea"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `ssDivisionArea_release_validity_idx` ON `ssDivisionArea` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovRvdAreas_resourceReleaseId_idx` ON `hkgovRvdAreas` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovRvdAreas_open_records_idx` ON `hkgovRvdAreas` (`sourceRecordId`) WHERE "hkgovRvdAreas"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovRvdAreas_release_validity_idx` ON `hkgovRvdAreas` (`validFromRelease`,`validToRelease`);