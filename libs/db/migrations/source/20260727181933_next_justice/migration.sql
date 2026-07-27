CREATE TABLE `overtureDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
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
	`division_id` text,
	CONSTRAINT `overtureDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `overtureDivisionBoundaries` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
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
	`division_ids` text,
	CONSTRAINT `overtureDivisionBoundaries_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `overtureDivisionI18n` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`nameRules` text,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	CONSTRAINT `overtureDivisionI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `overtureDivisions` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`admin_level` integer,
	`subtype` text,
	`class` text,
	`wikidata` text,
	`hierarchies` text,
	`cartography` text,
	CONSTRAINT `overtureDivisions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `overturePlaceI18n` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`brandName` text,
	`brandNameVariant` text,
	`brandNameAlts` text,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	CONSTRAINT `overturePlaceI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `overturePlaces` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`lng` real,
	`lat` real,
	`bbox` text,
	`operatingStatus` text,
	`basicCategory` text,
	`taxonomyPrimary` text,
	`taxonomyHierarchy` text,
	`taxonomyAlternates` text,
	`brandWikidata` text,
	`websites` text,
	`socials` text,
	`emails` text,
	`phones` text,
	`addresses` text,
	`confidence` real,
	CONSTRAINT `overturePlaces_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovAlsAddress2dI18n` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`locale` text NOT NULL,
	`formattedAddress` text,
	`buildingName` text,
	`buildingNumberFrom` text,
	`buildingNumberTo` text,
	`blockType` text,
	`blockNumber` text,
	`blockTypeBeforeNumber` integer,
	`phaseName` text,
	`phaseNumber` text,
	`estateName` text,
	`streetNumber` text,
	`streetName` text,
	`villageName` text,
	`districtName` text,
	CONSTRAINT `hkgovAlsAddress2dI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovAlsAddresses2d` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`districtCode` text,
	`districtName` text,
	`estateName` text,
	`buildingName` text,
	`blockNumber` text,
	`blockDescriptor` text,
	`phaseName` text,
	`phaseNumber` text,
	`floor` text,
	`unit` text,
	`streetNumber` text,
	`streetName` text,
	`villageName` text,
	`identifiers` text,
	`easting` real,
	`northing` real,
	`geometry` text,
	CONSTRAINT `hkgovAlsAddresses2d_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdRoadCentrelineI18n` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	CONSTRAINT `hkgovLandsdRoadCentrelineI18n_pk` PRIMARY KEY(`sourceRecordId`, `releaseId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdRoadCentrelines` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`streetId` text NOT NULL,
	`objectId` integer NOT NULL,
	`streetCode` text NOT NULL,
	`streetType` text,
	`sourceGeometry` text NOT NULL,
	`geometry` text NOT NULL,
	`bbox` text NOT NULL,
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
	`streetId` text NOT NULL,
	`deferToNotices` integer NOT NULL,
	`englishName` text NOT NULL,
	`chineseName` text NOT NULL,
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
	`sourceStreetId` text,
	`resultStreetId` text,
	`nameChangeScope` text,
	`retainedDescriptions` text,
	CONSTRAINT `hkgovLandsdStreetNoticeApplications_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdStreetNoticeI18n` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	CONSTRAINT `hkgovLandsdStreetNoticeI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
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
	`gazetteDate` text NOT NULL,
	`kind` text NOT NULL,
	`noticeRef` text NOT NULL,
	`effectiveDate` text,
	`previousNoticeRefs` text,
	`rawExtractedText` text,
	`parserDiagnostics` text,
	`districtCodes` text,
	`evidenceAssets` text NOT NULL,
	CONSTRAINT `hkgovLandsdStreetNotices_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovHydSensitiveStreets` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
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
	`sources` text,
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
	`sources` text,
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
CREATE TABLE `hkgovTdPedestrianStreetI18n` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`locale` text NOT NULL,
	`description` text NOT NULL,
	CONSTRAINT `hkgovTdPedestrianStreetI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovTdPedestrianStreets` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
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
	`regionCode` text,
	`startTime` text,
	`endTime` text,
	CONSTRAINT `hkgovTdPedestrianStreets_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovHadDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
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
	`sources` text,
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
	`referenceYear` text NOT NULL,
	`landAreaSqKm` real NOT NULL,
	`midYearPopulation` integer NOT NULL,
	`midYearPopulationDensityPerSqKm` integer NOT NULL,
	CONSTRAINT `hkgovCenstatdDistrictLandAreaPopulationDensities_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdDistrictLandAreaPopulationDensityI18n` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	CONSTRAINT `hkgovCenstatdDistrictLandAreaPopulationDensityI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
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
CREATE TABLE `hkgovCenstatdDivisionAreaI18n` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	CONSTRAINT `hkgovCenstatdDivisionAreaI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
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
	`censusYear` text NOT NULL,
	CONSTRAINT `hkgovCenstatdDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdStatistics` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
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
	`referenceYear` text NOT NULL,
	`featureId` text NOT NULL,
	`properties` text NOT NULL,
	`sourceFeature` text NOT NULL,
	`sourceGeometry` text,
	CONSTRAINT `hkgovCenstatdStatistics_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`divisionId` text NOT NULL,
	`planningLevel` text NOT NULL,
	`sourceCellIds` text NOT NULL,
	`repairedSourceFeatureIds` text NOT NULL,
	CONSTRAINT `hkgovPlandDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandDivisionI18n` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	CONSTRAINT `hkgovPlandDivisionI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandDivisions` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`planningLevel` text NOT NULL,
	`ppuCode` text,
	`spuCode` text,
	`tpuCode` text,
	`subunitCode` text,
	`newTownId` text,
	`sourceCellIds` text NOT NULL,
	`wasGeometryRepaired` integer DEFAULT false NOT NULL,
	`canonicalGeometry` text,
	CONSTRAINT `hkgovPlandDivisions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandNewTownDivisionAreaI18n` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	CONSTRAINT `hkgovPlandNewTownDivisionAreaI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandNewTownDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`divisionId` text NOT NULL,
	`newTownId` text NOT NULL,
	`wasGeometryRepaired` integer DEFAULT false NOT NULL,
	`canonicalGeometry` text,
	CONSTRAINT `hkgovPlandNewTownDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandPlanningCells` (
	`sourceRecordId` text NOT NULL,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`ppuCode` text NOT NULL,
	`spuCode` text NOT NULL,
	`tpuCode` text NOT NULL,
	`subunitCode` text NOT NULL,
	`wasGeometryRepaired` integer DEFAULT false NOT NULL,
	`canonicalGeometry` text,
	CONSTRAINT `hkgovPlandPlanningCells_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_releaseId_idx` ON `overtureDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_sourceRecordId_idx` ON `overtureDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_current_lookup_idx` ON `overtureDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_release_validity_idx` ON `overtureDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_divisionId_idx` ON `overtureDivisionAreas` (`division_id`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_subtype_idx` ON `overtureDivisionAreas` (`subtype`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_class_idx` ON `overtureDivisionAreas` (`class`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_releaseId_idx` ON `overtureDivisionBoundaries` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_sourceRecordId_idx` ON `overtureDivisionBoundaries` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_current_lookup_idx` ON `overtureDivisionBoundaries` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_release_validity_idx` ON `overtureDivisionBoundaries` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_subtype_idx` ON `overtureDivisionBoundaries` (`subtype`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_class_idx` ON `overtureDivisionBoundaries` (`class`);--> statement-breakpoint
CREATE INDEX `overtureDivisionI18n_releaseId_idx` ON `overtureDivisionI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionI18n_sourceRecordId_idx` ON `overtureDivisionI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionI18n_current_lookup_idx` ON `overtureDivisionI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overtureDivisionI18n_release_validity_idx` ON `overtureDivisionI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overtureDivisionI18n_locale_idx` ON `overtureDivisionI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_releaseId_idx` ON `overtureDivisions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_sourceRecordId_idx` ON `overtureDivisions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_current_lookup_idx` ON `overtureDivisions` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_release_validity_idx` ON `overtureDivisions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_adminLevel_idx` ON `overtureDivisions` (`admin_level`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_subtype_idx` ON `overtureDivisions` (`subtype`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_class_idx` ON `overtureDivisions` (`class`);--> statement-breakpoint
CREATE INDEX `overturePlaceI18n_releaseId_idx` ON `overturePlaceI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overturePlaceI18n_sourceRecordId_idx` ON `overturePlaceI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overturePlaceI18n_current_lookup_idx` ON `overturePlaceI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overturePlaceI18n_release_validity_idx` ON `overturePlaceI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overturePlaceI18n_locale_idx` ON `overturePlaceI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `overturePlaces_releaseId_idx` ON `overturePlaces` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overturePlaces_sourceRecordId_idx` ON `overturePlaces` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overturePlaces_current_lookup_idx` ON `overturePlaces` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overturePlaces_release_validity_idx` ON `overturePlaces` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overturePlaces_basicCategory_idx` ON `overturePlaces` (`basicCategory`);--> statement-breakpoint
CREATE INDEX `overturePlaces_taxonomyPrimary_idx` ON `overturePlaces` (`taxonomyPrimary`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddress2dI18n_releaseId_idx` ON `hkgovAlsAddress2dI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddress2dI18n_sourceRecordId_idx` ON `hkgovAlsAddress2dI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddress2dI18n_current_lookup_idx` ON `hkgovAlsAddress2dI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddress2dI18n_release_validity_idx` ON `hkgovAlsAddress2dI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddress2dI18n_locale_idx` ON `hkgovAlsAddress2dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_releaseId_idx` ON `hkgovAlsAddresses2d` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_sourceRecordId_idx` ON `hkgovAlsAddresses2d` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_current_lookup_idx` ON `hkgovAlsAddresses2d` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_release_validity_idx` ON `hkgovAlsAddresses2d` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_identifiers_idx` ON `hkgovAlsAddresses2d` (`identifiers`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_street_lookup_idx` ON `hkgovAlsAddresses2d` (`streetName`,`streetNumber`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelineI18n_releaseId_idx` ON `hkgovLandsdRoadCentrelineI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelineI18n_sourceRecordId_idx` ON `hkgovLandsdRoadCentrelineI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelineI18n_locale_name_idx` ON `hkgovLandsdRoadCentrelineI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_releaseId_idx` ON `hkgovLandsdRoadCentrelines` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_sourceRecordId_idx` ON `hkgovLandsdRoadCentrelines` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_street_idx` ON `hkgovLandsdRoadCentrelines` (`streetId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_objectId_idx` ON `hkgovLandsdRoadCentrelines` (`objectId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_releaseId_idx` ON `hkgovLandsdStreetBaselineRecords` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_sourceRecordId_idx` ON `hkgovLandsdStreetBaselineRecords` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_current_lookup_idx` ON `hkgovLandsdStreetBaselineRecords` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_release_validity_idx` ON `hkgovLandsdStreetBaselineRecords` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_street_idx` ON `hkgovLandsdStreetBaselineRecords` (`streetId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_deferToNotices_idx` ON `hkgovLandsdStreetBaselineRecords` (`deferToNotices`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_releaseId_idx` ON `hkgovLandsdStreetNoticeApplications` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_sourceRecordId_idx` ON `hkgovLandsdStreetNoticeApplications` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_current_lookup_idx` ON `hkgovLandsdStreetNoticeApplications` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_release_validity_idx` ON `hkgovLandsdStreetNoticeApplications` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_sourceStreet_idx` ON `hkgovLandsdStreetNoticeApplications` (`sourceStreetId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_resultStreet_idx` ON `hkgovLandsdStreetNoticeApplications` (`resultStreetId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeI18n_releaseId_idx` ON `hkgovLandsdStreetNoticeI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeI18n_sourceRecordId_idx` ON `hkgovLandsdStreetNoticeI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeI18n_current_lookup_idx` ON `hkgovLandsdStreetNoticeI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeI18n_release_validity_idx` ON `hkgovLandsdStreetNoticeI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeI18n_locale_name_idx` ON `hkgovLandsdStreetNoticeI18n` (`locale`,`name`);--> statement-breakpoint
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
CREATE INDEX `hkgovTdPedestrianStreetI18n_releaseId_idx` ON `hkgovTdPedestrianStreetI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreetI18n_sourceRecordId_idx` ON `hkgovTdPedestrianStreetI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreetI18n_current_lookup_idx` ON `hkgovTdPedestrianStreetI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreetI18n_release_validity_idx` ON `hkgovTdPedestrianStreetI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreetI18n_locale_idx` ON `hkgovTdPedestrianStreetI18n` (`locale`);--> statement-breakpoint
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
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_referenceYear_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`referenceYear`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensityI18n_releaseId_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensityI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensityI18n_sourceRecordId_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensityI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensityI18n_current_lookup_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensityI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensityI18n_release_validity_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensityI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensityI18n_locale_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensityI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_releaseId_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_sourceRecordId_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_current_lookup_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_release_validity_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_input_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`sourceRecordId`,`inputVersionHash`,`transform`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaI18n_releaseId_idx` ON `hkgovCenstatdDivisionAreaI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaI18n_sourceRecordId_idx` ON `hkgovCenstatdDivisionAreaI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaI18n_current_lookup_idx` ON `hkgovCenstatdDivisionAreaI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaI18n_release_validity_idx` ON `hkgovCenstatdDivisionAreaI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaI18n_locale_idx` ON `hkgovCenstatdDivisionAreaI18n` (`locale`);--> statement-breakpoint
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
CREATE INDEX `hkgovCenstatdStatistics_referenceYear_idx` ON `hkgovCenstatdStatistics` (`referenceYear`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionAreas_releaseId_idx` ON `hkgovPlandDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionAreas_sourceRecordId_idx` ON `hkgovPlandDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionAreas_current_lookup_idx` ON `hkgovPlandDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionAreas_release_validity_idx` ON `hkgovPlandDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionAreas_divisionId_idx` ON `hkgovPlandDivisionAreas` (`divisionId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionAreas_planningLevel_idx` ON `hkgovPlandDivisionAreas` (`planningLevel`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionI18n_releaseId_idx` ON `hkgovPlandDivisionI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionI18n_sourceRecordId_idx` ON `hkgovPlandDivisionI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionI18n_current_lookup_idx` ON `hkgovPlandDivisionI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionI18n_release_validity_idx` ON `hkgovPlandDivisionI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionI18n_locale_idx` ON `hkgovPlandDivisionI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_releaseId_idx` ON `hkgovPlandDivisions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_sourceRecordId_idx` ON `hkgovPlandDivisions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_current_lookup_idx` ON `hkgovPlandDivisions` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_release_validity_idx` ON `hkgovPlandDivisions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_planningLevel_idx` ON `hkgovPlandDivisions` (`planningLevel`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_tpuCode_idx` ON `hkgovPlandDivisions` (`tpuCode`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_newTownId_idx` ON `hkgovPlandDivisions` (`newTownId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreaI18n_releaseId_idx` ON `hkgovPlandNewTownDivisionAreaI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreaI18n_sourceRecordId_idx` ON `hkgovPlandNewTownDivisionAreaI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreaI18n_current_lookup_idx` ON `hkgovPlandNewTownDivisionAreaI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreaI18n_release_validity_idx` ON `hkgovPlandNewTownDivisionAreaI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreaI18n_locale_idx` ON `hkgovPlandNewTownDivisionAreaI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreas_releaseId_idx` ON `hkgovPlandNewTownDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreas_sourceRecordId_idx` ON `hkgovPlandNewTownDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreas_current_lookup_idx` ON `hkgovPlandNewTownDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreas_release_validity_idx` ON `hkgovPlandNewTownDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreas_divisionId_idx` ON `hkgovPlandNewTownDivisionAreas` (`divisionId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTownDivisionAreas_newTownId_idx` ON `hkgovPlandNewTownDivisionAreas` (`newTownId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_releaseId_idx` ON `hkgovPlandPlanningCells` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_sourceRecordId_idx` ON `hkgovPlandPlanningCells` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_current_lookup_idx` ON `hkgovPlandPlanningCells` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_release_validity_idx` ON `hkgovPlandPlanningCells` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_tpuCode_idx` ON `hkgovPlandPlanningCells` (`tpuCode`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_spuCode_idx` ON `hkgovPlandPlanningCells` (`spuCode`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_ppuCode_idx` ON `hkgovPlandPlanningCells` (`ppuCode`);