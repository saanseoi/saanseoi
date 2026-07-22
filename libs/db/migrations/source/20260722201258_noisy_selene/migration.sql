CREATE TABLE `overtureDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`subtype` text,
	`class` text,
	`isLand` integer,
	`isTerritorial` integer,
	`geometry` text,
	`bbox` text,
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
	`division_id` text,
	CONSTRAINT `overtureDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `overtureDivisionBoundaries` (
	`sourceRecordId` text NOT NULL,
	`subtype` text,
	`class` text,
	`isLand` integer,
	`isTerritorial` integer,
	`geometry` text,
	`bbox` text,
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
	`division_ids` text,
	CONSTRAINT `overtureDivisionBoundaries_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `overtureDivisionI18n` (
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`nameRules` text,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `overtureDivisionI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `overtureDivisions` (
	`sourceRecordId` text NOT NULL,
	`admin_level` integer,
	`subtype` text,
	`class` text,
	`wikidata` text,
	`hierarchies` text,
	`geometry` text,
	`bbox` text,
	`cartography` text,
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
	CONSTRAINT `overtureDivisions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `overturePlaceI18n` (
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`brandName` text,
	`brandNameVariant` text,
	`brandNameAlts` text,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `overturePlaceI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `overturePlaces` (
	`sourceRecordId` text NOT NULL,
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
	CONSTRAINT `overturePlaces_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovAlsAddress2dI18n` (
	`sourceRecordId` text NOT NULL,
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
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovAlsAddress2dI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovAlsAddresses2d` (
	`sourceRecordId` text NOT NULL,
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
	`sources` text,
	`geometry` text,
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
CREATE TABLE `hkgovHadDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`objectId` integer,
	`cdsiAdminAreaId` integer,
	`areaType` text,
	`areaId` text,
	`divisionId` text,
	`areaCode` text,
	`geometry` text,
	`bbox` text,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`sourceCrs` text,
	`sourceGeometry` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovHadDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdDivisionAreaDerivatives` (
	`sourceRecordId` text NOT NULL,
	`inputVersionHash` text NOT NULL,
	`transform` text NOT NULL,
	`derivation` text NOT NULL,
	`geometry` text,
	`bbox` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovCenstatdDivisionAreaDerivatives_pk` PRIMARY KEY(`sourceRecordId`, `inputVersionHash`, `transform`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdDivisionAreaI18n` (
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovCenstatdDivisionAreaI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`districtClass` text NOT NULL,
	`districtCode` integer NOT NULL,
	`censusYear` text NOT NULL,
	`sourceCrs` text NOT NULL,
	`sourceGeometry` text NOT NULL,
	`geometry` text,
	`bbox` text,
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
	CONSTRAINT `hkgovCenstatdDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`divisionId` text NOT NULL,
	`planningLevel` text NOT NULL,
	`sourceCellIds` text NOT NULL,
	`repairedSourceFeatureIds` text NOT NULL,
	`sourceCrs` text NOT NULL,
	`geometry` text,
	`bbox` text,
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
	CONSTRAINT `hkgovPlandDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandDivisionI18n` (
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovPlandDivisionI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandDivisions` (
	`sourceRecordId` text NOT NULL,
	`planningLevel` text NOT NULL,
	`ppuCode` text,
	`spuCode` text,
	`tpuCode` text,
	`subunitCode` text,
	`newTownId` text,
	`sourceCellIds` text NOT NULL,
	`sourceCrs` text NOT NULL,
	`wasGeometryRepaired` integer DEFAULT false NOT NULL,
	`canonicalGeometry` text,
	`geometry` text,
	`bbox` text,
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
	CONSTRAINT `hkgovPlandDivisions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandNewTownDivisionAreaI18n` (
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovPlandNewTownDivisionAreaI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandNewTownDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`divisionId` text NOT NULL,
	`newTownId` text NOT NULL,
	`sourceCrs` text NOT NULL,
	`wasGeometryRepaired` integer DEFAULT false NOT NULL,
	`canonicalGeometry` text,
	`geometry` text,
	`bbox` text,
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
	CONSTRAINT `hkgovPlandNewTownDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovPlandPlanningCells` (
	`sourceRecordId` text NOT NULL,
	`ppuCode` text NOT NULL,
	`spuCode` text NOT NULL,
	`tpuCode` text NOT NULL,
	`subunitCode` text NOT NULL,
	`sourceCrs` text NOT NULL,
	`wasGeometryRepaired` integer DEFAULT false NOT NULL,
	`canonicalGeometry` text,
	`geometry` text,
	`bbox` text,
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
CREATE INDEX `hkgovHadDivisionAreas_releaseId_idx` ON `hkgovHadDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_sourceRecordId_idx` ON `hkgovHadDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_current_lookup_idx` ON `hkgovHadDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_release_validity_idx` ON `hkgovHadDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_areaId_idx` ON `hkgovHadDivisionAreas` (`areaId`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_areaCode_idx` ON `hkgovHadDivisionAreas` (`areaCode`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_divisionId_idx` ON `hkgovHadDivisionAreas` (`divisionId`);--> statement-breakpoint
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