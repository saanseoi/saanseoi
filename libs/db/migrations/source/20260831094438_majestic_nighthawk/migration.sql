CREATE TABLE `overtureDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`subtype` text,
	`class` text,
	`isLand` integer,
	`isTerritorial` integer,
	CONSTRAINT `overtureDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `overtureDivisionBoundaries` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`subtype` text,
	`class` text,
	`isLand` integer,
	`isTerritorial` integer,
	CONSTRAINT `overtureDivisionBoundaries_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `overtureDivisions` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`names` text,
	`admin_level` integer,
	`subtype` text,
	`class` text,
	`wikidata` text,
	`hierarchies` text,
	`cartography` text,
	CONSTRAINT `overtureDivisions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `overturePlaces` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`names` text,
	`lng` real,
	`lat` real,
	`bbox` text,
	`operatingStatus` text,
	`basicCategory` text,
	`taxonomyPrimary` text,
	`taxonomyHierarchy` text,
	`taxonomyAlternates` text,
	`brandWikidata` text,
	`brandNames` text,
	`websites` text,
	`socials` text,
	`emails` text,
	`phones` text,
	`addresses` text,
	`confidence` real,
	CONSTRAINT `overturePlaces_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovAlsAddresses2d` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`identifiers` text,
	`easting` real,
	`northing` real,
	`geometry` text,
	`addressEn` text,
	`addressZhHant` text,
	CONSTRAINT `hkgovAlsAddresses2d_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdPlaceNames` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	`geoNameId` text NOT NULL,
	`placeClass` text NOT NULL,
	`placeType` text NOT NULL,
	`district` text,
	`placeNames` text NOT NULL,
	CONSTRAINT `hkgovLandsdPlaceNames_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdRoadCentrelines` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sources` text NOT NULL,
	`objectId` integer NOT NULL,
	`streetCode` text NOT NULL,
	`streetType` text,
	`nameEn` text,
	`nameZhHant` text,
	`rawProperties` text,
	`sourceGeometry` text NOT NULL,
	CONSTRAINT `hkgovLandsdRoadCentrelines_pk` PRIMARY KEY(`sourceRecordId`, `releaseId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdStreetBaselineRecords` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sources` text NOT NULL,
	`deferToNotices` integer NOT NULL,
	`nameEn` text NOT NULL,
	`nameZhHant` text NOT NULL,
	`districtCode` text NOT NULL,
	CONSTRAINT `hkgovLandsdStreetBaselineRecords_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdStreetNoticeApplications` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`method` text NOT NULL,
	`disposition` text NOT NULL,
	`nameChangeScope` text,
	`retainedDescriptions` text,
	CONSTRAINT `hkgovLandsdStreetNoticeApplications_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdStreetNotices` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sources` text NOT NULL,
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
CREATE TABLE `hkgovHydSensitiveStreets` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	`level` integer,
	`sectionBetween` text,
	`streetName` text,
	CONSTRAINT `hkgovHydSensitiveStreets_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovHydStrategicStreets` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	`level` integer,
	`sectionBetween` text,
	`streetName` text,
	CONSTRAINT `hkgovHydStrategicStreets_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovHydStreetNamePlates` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	`snpId` text NOT NULL,
	`level` integer,
	`roadName` text,
	CONSTRAINT `hkgovHydStreetNamePlates_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovTdPedestrianStreets` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	`kind` text NOT NULL,
	`objectId` integer NOT NULL,
	`startTime` text,
	`endTime` text,
	`descriptionEn` text,
	`descriptionZhHant` text,
	`descriptionZhHans` text,
	CONSTRAINT `hkgovTdPedestrianStreets_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovHadDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`objectId` integer,
	`cdsiAdminAreaId` integer,
	`areaType` text,
	`areaId` text,
	`divisionId` text,
	`areaCode` text,
	`sourceGeometry` text,
	CONSTRAINT `hkgovHadDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	`districtCode` integer NOT NULL,
	`districtEn` text NOT NULL,
	`districtZhHant` text NOT NULL,
	`referencePeriodCode` text NOT NULL,
	`referencePeriodStart` text,
	`referencePeriodEnd` text,
	`referencePeriodGranularity` text NOT NULL,
	`referencePeriodEndYear` text NOT NULL,
	`landAreaSqKm` real NOT NULL,
	`midYearPopulation` integer NOT NULL,
	`midYearPopulationDensityPerSqKm` integer NOT NULL,
	CONSTRAINT `hkgovCenstatdDistrictLandAreaPopulationDensities_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdDivisionAreaDerivatives` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`inputVersionHash` text NOT NULL,
	`transform` text NOT NULL,
	`derivation` text NOT NULL,
	`geometry` text,
	`bbox` text,
	CONSTRAINT `hkgovCenstatdDivisionAreaDerivatives_pk` PRIMARY KEY(`sourceRecordId`, `inputVersionHash`, `transform`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	`districtClass` text NOT NULL,
	`districtCode` integer NOT NULL,
	`districtEn` text NOT NULL,
	`districtZhHant` text NOT NULL,
	`censusYear` text NOT NULL,
	CONSTRAINT `hkgovCenstatdDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdStatistics` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`datasetCode` text NOT NULL,
	`layerName` text NOT NULL,
	`referencePeriodCode` text NOT NULL,
	`referencePeriodStart` text,
	`referencePeriodEnd` text,
	`referencePeriodGranularity` text NOT NULL,
	`referencePeriodEndYear` text NOT NULL,
	`featureId` text NOT NULL,
	`sourceGeometry` text,
	CONSTRAINT `hkgovCenstatdStatistics_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandNewTowns` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	`newTownId` text NOT NULL,
	`nameEn` text NOT NULL,
	`nameZhHant` text NOT NULL,
	`nameZhHans` text NOT NULL,
	`wasGeometryRepaired` integer DEFAULT false NOT NULL,
	`repairedGeometry` text,
	CONSTRAINT `hkgovPlandNewTowns_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandPlanningCells` (
	`sourceRecordId` text NOT NULL,
	`sources` text NOT NULL,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	`ppuCode` text NOT NULL,
	`spuCode` text NOT NULL,
	`tpuCode` text NOT NULL,
	`subunitCode` text NOT NULL,
	`wasGeometryRepaired` integer DEFAULT false NOT NULL,
	`repairedGeometry` text,
	CONSTRAINT `hkgovPlandPlanningCells_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_releaseId_idx` ON `overtureDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_sourceRecordId_idx` ON `overtureDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_current_lookup_idx` ON `overtureDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_release_validity_idx` ON `overtureDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_subtype_idx` ON `overtureDivisionAreas` (`subtype`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_class_idx` ON `overtureDivisionAreas` (`class`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_releaseId_idx` ON `overtureDivisionBoundaries` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_sourceRecordId_idx` ON `overtureDivisionBoundaries` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_current_lookup_idx` ON `overtureDivisionBoundaries` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_release_validity_idx` ON `overtureDivisionBoundaries` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_subtype_idx` ON `overtureDivisionBoundaries` (`subtype`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_class_idx` ON `overtureDivisionBoundaries` (`class`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_releaseId_idx` ON `overtureDivisions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_sourceRecordId_idx` ON `overtureDivisions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_current_lookup_idx` ON `overtureDivisions` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_release_validity_idx` ON `overtureDivisions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_adminLevel_idx` ON `overtureDivisions` (`admin_level`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_subtype_idx` ON `overtureDivisions` (`subtype`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_class_idx` ON `overtureDivisions` (`class`);--> statement-breakpoint
CREATE INDEX `overturePlaces_releaseId_idx` ON `overturePlaces` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overturePlaces_sourceRecordId_idx` ON `overturePlaces` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overturePlaces_current_lookup_idx` ON `overturePlaces` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overturePlaces_release_validity_idx` ON `overturePlaces` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overturePlaces_basicCategory_idx` ON `overturePlaces` (`basicCategory`);--> statement-breakpoint
CREATE INDEX `overturePlaces_taxonomyPrimary_idx` ON `overturePlaces` (`taxonomyPrimary`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_releaseId_idx` ON `hkgovAlsAddresses2d` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_sourceRecordId_idx` ON `hkgovAlsAddresses2d` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_current_lookup_idx` ON `hkgovAlsAddresses2d` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_release_validity_idx` ON `hkgovAlsAddresses2d` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_identifiers_idx` ON `hkgovAlsAddresses2d` (`identifiers`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_releaseId_idx` ON `hkgovLandsdPlaceNames` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_sourceRecordId_idx` ON `hkgovLandsdPlaceNames` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_current_lookup_idx` ON `hkgovLandsdPlaceNames` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_release_validity_idx` ON `hkgovLandsdPlaceNames` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_geoNameId_idx` ON `hkgovLandsdPlaceNames` (`geoNameId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_placeClass_idx` ON `hkgovLandsdPlaceNames` (`placeClass`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_district_idx` ON `hkgovLandsdPlaceNames` (`district`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_releaseId_idx` ON `hkgovLandsdRoadCentrelines` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_sourceRecordId_idx` ON `hkgovLandsdRoadCentrelines` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_objectId_idx` ON `hkgovLandsdRoadCentrelines` (`objectId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_releaseId_idx` ON `hkgovLandsdStreetBaselineRecords` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_sourceRecordId_idx` ON `hkgovLandsdStreetBaselineRecords` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_current_lookup_idx` ON `hkgovLandsdStreetBaselineRecords` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_release_validity_idx` ON `hkgovLandsdStreetBaselineRecords` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_deferToNotices_idx` ON `hkgovLandsdStreetBaselineRecords` (`deferToNotices`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_releaseId_idx` ON `hkgovLandsdStreetNoticeApplications` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_sourceRecordId_idx` ON `hkgovLandsdStreetNoticeApplications` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_current_lookup_idx` ON `hkgovLandsdStreetNoticeApplications` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_release_validity_idx` ON `hkgovLandsdStreetNoticeApplications` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
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
CREATE INDEX `hkgovHydSensitiveStreets_streetName_idx` ON `hkgovHydSensitiveStreets` (`streetName`);--> statement-breakpoint
CREATE INDEX `hkgovHydStrategicStreets_releaseId_idx` ON `hkgovHydStrategicStreets` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHydStrategicStreets_sourceRecordId_idx` ON `hkgovHydStrategicStreets` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovHydStrategicStreets_current_lookup_idx` ON `hkgovHydStrategicStreets` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovHydStrategicStreets_release_validity_idx` ON `hkgovHydStrategicStreets` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovHydStrategicStreets_streetName_idx` ON `hkgovHydStrategicStreets` (`streetName`);--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_releaseId_idx` ON `hkgovHydStreetNamePlates` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_sourceRecordId_idx` ON `hkgovHydStreetNamePlates` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_current_lookup_idx` ON `hkgovHydStreetNamePlates` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_release_validity_idx` ON `hkgovHydStreetNamePlates` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_snpId_idx` ON `hkgovHydStreetNamePlates` (`snpId`);--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_roadName_idx` ON `hkgovHydStreetNamePlates` (`roadName`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_releaseId_idx` ON `hkgovTdPedestrianStreets` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_sourceRecordId_idx` ON `hkgovTdPedestrianStreets` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_current_lookup_idx` ON `hkgovTdPedestrianStreets` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_release_validity_idx` ON `hkgovTdPedestrianStreets` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_kind_idx` ON `hkgovTdPedestrianStreets` (`kind`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_kind_object_idx` ON `hkgovTdPedestrianStreets` (`kind`,`objectId`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_releaseId_idx` ON `hkgovHadDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_sourceRecordId_idx` ON `hkgovHadDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_current_lookup_idx` ON `hkgovHadDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_release_validity_idx` ON `hkgovHadDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_areaId_idx` ON `hkgovHadDivisionAreas` (`areaId`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_areaCode_idx` ON `hkgovHadDivisionAreas` (`areaCode`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_divisionId_idx` ON `hkgovHadDivisionAreas` (`divisionId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_releaseId_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_sourceRecordId_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_current_lookup_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_release_validity_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_districtCode_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`districtCode`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_referencePeriod_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`referencePeriodEndYear`,`referencePeriodCode`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_releaseId_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_sourceRecordId_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_current_lookup_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_release_validity_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_input_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`sourceRecordId`,`inputVersionHash`,`transform`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_releaseId_idx` ON `hkgovCenstatdDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_sourceRecordId_idx` ON `hkgovCenstatdDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_current_lookup_idx` ON `hkgovCenstatdDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_release_validity_idx` ON `hkgovCenstatdDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_districtClass_idx` ON `hkgovCenstatdDivisionAreas` (`districtClass`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_districtCode_idx` ON `hkgovCenstatdDivisionAreas` (`districtCode`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_censusYear_idx` ON `hkgovCenstatdDivisionAreas` (`censusYear`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_releaseId_idx` ON `hkgovCenstatdStatistics` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_sourceRecordId_idx` ON `hkgovCenstatdStatistics` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_current_lookup_idx` ON `hkgovCenstatdStatistics` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_release_validity_idx` ON `hkgovCenstatdStatistics` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_dataset_layer_idx` ON `hkgovCenstatdStatistics` (`datasetCode`,`layerName`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_referencePeriod_idx` ON `hkgovCenstatdStatistics` (`referencePeriodEndYear`,`referencePeriodCode`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTowns_releaseId_idx` ON `hkgovPlandNewTowns` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTowns_sourceRecordId_idx` ON `hkgovPlandNewTowns` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTowns_current_lookup_idx` ON `hkgovPlandNewTowns` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTowns_release_validity_idx` ON `hkgovPlandNewTowns` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTowns_newTownId_idx` ON `hkgovPlandNewTowns` (`newTownId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_releaseId_idx` ON `hkgovPlandPlanningCells` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_sourceRecordId_idx` ON `hkgovPlandPlanningCells` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_current_lookup_idx` ON `hkgovPlandPlanningCells` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_release_validity_idx` ON `hkgovPlandPlanningCells` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_tpuCode_idx` ON `hkgovPlandPlanningCells` (`tpuCode`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_spuCode_idx` ON `hkgovPlandPlanningCells` (`spuCode`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_ppuCode_idx` ON `hkgovPlandPlanningCells` (`ppuCode`);