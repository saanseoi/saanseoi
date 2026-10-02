CREATE TABLE `overtureDivisionAreas` (
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
	CONSTRAINT `overtureDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `overtureDivisionBoundaries` (
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
	CONSTRAINT `overtureDivisionBoundaries_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `overtureDivisions` (
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
	CONSTRAINT `overtureDivisions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `overturePlaces` (
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
	CONSTRAINT `overturePlaces_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `protomapsIslandFeatures` (
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
	CONSTRAINT `protomapsIslandFeatures_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovAlsAddresses2d` (
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
	CONSTRAINT `hkgovAlsAddresses2d_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovAlsAddresses3d` (
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
	CONSTRAINT `hkgovAlsAddresses3d_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdPlaceNames` (
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
	CONSTRAINT `hkgovLandsdPlaceNames_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdRoadCentrelines` (
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
	CONSTRAINT `hkgovLandsdRoadCentrelines_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdStreetBaselineRecords` (
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
	CONSTRAINT `hkgovLandsdStreetBaselineRecords_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdStreetNoticeApplications` (
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
	CONSTRAINT `hkgovLandsdStreetNoticeApplications_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdStreetNotices` (
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
	CONSTRAINT `hkgovLandsdStreetNotices_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovHydSensitiveStreets` (
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
	CONSTRAINT `hkgovHydSensitiveStreets_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovHydStrategicStreets` (
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
	CONSTRAINT `hkgovHydStrategicStreets_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovHydStreetNamePlates` (
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
	CONSTRAINT `hkgovHydStreetNamePlates_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovTdPedestrianStreets` (
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
	CONSTRAINT `hkgovTdPedestrianStreets_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovHadDivisionAreas` (
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
	CONSTRAINT `hkgovHadDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceGeometry` text NOT NULL,
	`sourceLocator` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovCenstatdDistrictLandAreaPopulationDensities_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdDivisionAreaDerivatives` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`inputVersionHash` text NOT NULL,
	`transform` text NOT NULL,
	`derivation` text NOT NULL,
	`geometry` text,
	`bbox` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovCenstatdDivisionAreaDerivatives_pk` PRIMARY KEY(`sourceRecordId`, `inputVersionHash`, `transform`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceGeometry` text NOT NULL,
	`censusYear` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovCenstatdDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdStatistics` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceGeometry` text NOT NULL,
	`sourceLocator` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovCenstatdStatistics_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandNewTowns` (
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
	CONSTRAINT `hkgovPlandNewTowns_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandPlanningCells` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`sourceGeometry` text NOT NULL,
	`sourceLocator` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovPlandPlanningCells_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `ssDivision` (
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
	CONSTRAINT `ssDivision_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `ssDivisionArea` (
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
	CONSTRAINT `ssDivisionArea_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovRvdAreas` (
	`sourceRecordId` text NOT NULL,
	`properties` text,
	`versionHash` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovRvdAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_resourceReleaseId_idx` ON `overtureDivisionAreas` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_open_records_idx` ON `overtureDivisionAreas` (`sourceRecordId`) WHERE "overtureDivisionAreas"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_release_validity_idx` ON `overtureDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_resourceReleaseId_idx` ON `overtureDivisionBoundaries` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_open_records_idx` ON `overtureDivisionBoundaries` (`sourceRecordId`) WHERE "overtureDivisionBoundaries"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_release_validity_idx` ON `overtureDivisionBoundaries` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
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
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_resourceReleaseId_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_open_records_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`sourceRecordId`) WHERE "hkgovCenstatdDistrictLandAreaPopulationDensities"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_release_validity_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_resourceReleaseId_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_open_records_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`sourceRecordId`) WHERE "hkgovCenstatdDivisionAreaDerivatives"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_release_validity_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_resourceReleaseId_idx` ON `hkgovCenstatdDivisionAreas` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_open_records_idx` ON `hkgovCenstatdDivisionAreas` (`sourceRecordId`) WHERE "hkgovCenstatdDivisionAreas"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_release_validity_idx` ON `hkgovCenstatdDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_resourceReleaseId_idx` ON `hkgovCenstatdStatistics` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_open_records_idx` ON `hkgovCenstatdStatistics` (`sourceRecordId`) WHERE "hkgovCenstatdStatistics"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_release_validity_idx` ON `hkgovCenstatdStatistics` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
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