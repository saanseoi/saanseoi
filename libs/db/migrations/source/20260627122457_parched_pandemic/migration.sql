CREATE TABLE `sourceOvertureAddress2dI18n` (
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`streetName` text,
	`locality` text,
	`region` text,
	`country` text,
	CONSTRAINT `sourceOvertureAddress2dI18n_pk` PRIMARY KEY(`sourceRecordId`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `sourceOvertureAddress2dI18nVersions` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`locale` text NOT NULL,
	`streetName` text,
	`locality` text,
	`region` text,
	`country` text,
	CONSTRAINT `sourceOvertureAddress2dI18nVersions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `sourceOvertureAddresses2d` (
	`releaseId` text NOT NULL,
	`datasetId` text NOT NULL,
	`sourceRecordId` text PRIMARY KEY NOT NULL,
	`sourcePayloadHash` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`regionCode` text NOT NULL,
	`version` integer,
	`geometry` text,
	`bbox` text,
	`streetName` text,
	`streetNumber` text,
	`sources` text,
	`rawProperties` text
);
--> statement-breakpoint
CREATE TABLE `sourceOvertureAddresses2dVersions` (
	`sourceRecordId` text NOT NULL,
	`regionCode` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`version` integer,
	`geometry` text,
	`bbox` text,
	`streetName` text,
	`streetNumber` text,
	`sources` text,
	`rawProperties` text,
	CONSTRAINT `sourceOvertureAddresses2dVersions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `sourceOvertureDivisionI18n` (
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`nameRules` text,
	`localType` text,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	CONSTRAINT `sourceOvertureDivisionI18n_pk` PRIMARY KEY(`sourceRecordId`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `sourceOvertureDivisionI18nVersions` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`nameRules` text,
	`localType` text,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	CONSTRAINT `sourceOvertureDivisionI18nVersions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `sourceOvertureDivisions` (
	`releaseId` text NOT NULL,
	`datasetId` text NOT NULL,
	`sourceRecordId` text PRIMARY KEY NOT NULL,
	`sourcePayloadHash` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`regionCode` text NOT NULL,
	`level` integer,
	`divisionType` text,
	`subtype` text,
	`divisionClass` text,
	`population` integer,
	`version` integer,
	`wikidata` text,
	`geometry` text,
	`bbox` text,
	`hierarchies` text,
	`cartography` text,
	`sources` text,
	`rawProperties` text
);
--> statement-breakpoint
CREATE TABLE `sourceOvertureDivisionsVersions` (
	`sourceRecordId` text NOT NULL,
	`regionCode` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`level` integer,
	`divisionType` text,
	`subtype` text,
	`divisionClass` text,
	`population` integer,
	`version` integer,
	`wikidata` text,
	`geometry` text,
	`bbox` text,
	`hierarchies` text,
	`cartography` text,
	`sources` text,
	`rawProperties` text,
	CONSTRAINT `sourceOvertureDivisionsVersions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `sourceOverturePlaceI18n` (
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`brandName` text,
	`brandNameVariant` text,
	`brandNameAlts` text,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	CONSTRAINT `sourceOverturePlaceI18n_pk` PRIMARY KEY(`sourceRecordId`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `sourceOverturePlaceI18nVersions` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`brandName` text,
	`brandNameVariant` text,
	`brandNameAlts` text,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	CONSTRAINT `sourceOverturePlaceI18nVersions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `sourceOverturePlaces` (
	`releaseId` text NOT NULL,
	`datasetId` text NOT NULL,
	`sourceRecordId` text PRIMARY KEY NOT NULL,
	`sourcePayloadHash` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`regionCode` text NOT NULL,
	`addressSourceRecordId` text,
	`version` integer,
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
	`rawProperties` text
);
--> statement-breakpoint
CREATE TABLE `sourceOverturePlacesVersions` (
	`sourceRecordId` text NOT NULL,
	`regionCode` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`addressSourceRecordId` text,
	`version` integer,
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
	CONSTRAINT `sourceOverturePlacesVersions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `sourceHkgovAlsAddress2dI18n` (
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
	CONSTRAINT `sourceHkgovAlsAddress2dI18n_pk` PRIMARY KEY(`sourceRecordId`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `sourceHkgovAlsAddress2dI18nVersions` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
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
	CONSTRAINT `sourceHkgovAlsAddress2dI18nVersions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `sourceHkgovAlsAddresses2d` (
	`releaseId` text NOT NULL,
	`datasetId` text NOT NULL,
	`sourceRecordId` text PRIMARY KEY NOT NULL,
	`sourcePayloadHash` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`regionCode` text NOT NULL,
	`geoAddress` text,
	`csuId` text,
	`x` real,
	`y` real,
	`geometry` text,
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
	`dataOwner` text,
	`rawPayload` text
);
--> statement-breakpoint
CREATE TABLE `sourceHkgovAlsAddresses2dVersions` (
	`sourceRecordId` text NOT NULL,
	`regionCode` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`geoAddress` text,
	`csuId` text,
	`x` real,
	`y` real,
	`geometry` text,
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
	`dataOwner` text,
	`rawPayload` text,
	CONSTRAINT `sourceHkgovAlsAddresses2dVersions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `sourceOvertureAddress2dI18n_locale_idx` ON `sourceOvertureAddress2dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddress2dI18nVersions_releaseId_idx` ON `sourceOvertureAddress2dI18nVersions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddress2dI18nVersions_sourceRecordId_idx` ON `sourceOvertureAddress2dI18nVersions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddress2dI18nVersions_current_lookup_idx` ON `sourceOvertureAddress2dI18nVersions` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddress2dI18nVersions_release_validity_idx` ON `sourceOvertureAddress2dI18nVersions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddress2dI18nVersions_locale_idx` ON `sourceOvertureAddress2dI18nVersions` (`locale`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2d_datasetId_idx` ON `sourceOvertureAddresses2d` (`datasetId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2d_releaseId_idx` ON `sourceOvertureAddresses2d` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2d_sourceRecordId_idx` ON `sourceOvertureAddresses2d` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2d_regionCode_idx` ON `sourceOvertureAddresses2d` (`regionCode`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2d_street_lookup_idx` ON `sourceOvertureAddresses2d` (`regionCode`,`streetName`,`streetNumber`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2dVersions_releaseId_idx` ON `sourceOvertureAddresses2dVersions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2dVersions_sourceRecordId_idx` ON `sourceOvertureAddresses2dVersions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2dVersions_current_lookup_idx` ON `sourceOvertureAddresses2dVersions` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2dVersions_release_validity_idx` ON `sourceOvertureAddresses2dVersions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2dVersions_regionCode_idx` ON `sourceOvertureAddresses2dVersions` (`regionCode`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2dVersions_street_lookup_idx` ON `sourceOvertureAddresses2dVersions` (`regionCode`,`streetName`,`streetNumber`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisionI18n_locale_idx` ON `sourceOvertureDivisionI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisionI18nVersions_releaseId_idx` ON `sourceOvertureDivisionI18nVersions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisionI18nVersions_sourceRecordId_idx` ON `sourceOvertureDivisionI18nVersions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisionI18nVersions_current_lookup_idx` ON `sourceOvertureDivisionI18nVersions` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisionI18nVersions_release_validity_idx` ON `sourceOvertureDivisionI18nVersions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisionI18nVersions_locale_idx` ON `sourceOvertureDivisionI18nVersions` (`locale`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisions_datasetId_idx` ON `sourceOvertureDivisions` (`datasetId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisions_releaseId_idx` ON `sourceOvertureDivisions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisions_sourceRecordId_idx` ON `sourceOvertureDivisions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisions_regionCode_idx` ON `sourceOvertureDivisions` (`regionCode`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisions_level_idx` ON `sourceOvertureDivisions` (`level`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisions_type_idx` ON `sourceOvertureDivisions` (`divisionType`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisionsVersions_releaseId_idx` ON `sourceOvertureDivisionsVersions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisionsVersions_sourceRecordId_idx` ON `sourceOvertureDivisionsVersions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisionsVersions_current_lookup_idx` ON `sourceOvertureDivisionsVersions` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisionsVersions_release_validity_idx` ON `sourceOvertureDivisionsVersions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisionsVersions_regionCode_idx` ON `sourceOvertureDivisionsVersions` (`regionCode`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisionsVersions_level_idx` ON `sourceOvertureDivisionsVersions` (`level`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisionsVersions_type_idx` ON `sourceOvertureDivisionsVersions` (`divisionType`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaceI18n_locale_idx` ON `sourceOverturePlaceI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaceI18nVersions_releaseId_idx` ON `sourceOverturePlaceI18nVersions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaceI18nVersions_sourceRecordId_idx` ON `sourceOverturePlaceI18nVersions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaceI18nVersions_current_lookup_idx` ON `sourceOverturePlaceI18nVersions` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaceI18nVersions_release_validity_idx` ON `sourceOverturePlaceI18nVersions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaceI18nVersions_locale_idx` ON `sourceOverturePlaceI18nVersions` (`locale`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaces_datasetId_idx` ON `sourceOverturePlaces` (`datasetId`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaces_releaseId_idx` ON `sourceOverturePlaces` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaces_sourceRecordId_idx` ON `sourceOverturePlaces` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaces_regionCode_idx` ON `sourceOverturePlaces` (`regionCode`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaces_basicCategory_idx` ON `sourceOverturePlaces` (`basicCategory`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaces_taxonomyPrimary_idx` ON `sourceOverturePlaces` (`taxonomyPrimary`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaces_addressSourceRecordId_idx` ON `sourceOverturePlaces` (`addressSourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlacesVersions_releaseId_idx` ON `sourceOverturePlacesVersions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlacesVersions_sourceRecordId_idx` ON `sourceOverturePlacesVersions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlacesVersions_current_lookup_idx` ON `sourceOverturePlacesVersions` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlacesVersions_release_validity_idx` ON `sourceOverturePlacesVersions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlacesVersions_regionCode_idx` ON `sourceOverturePlacesVersions` (`regionCode`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlacesVersions_basicCategory_idx` ON `sourceOverturePlacesVersions` (`basicCategory`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlacesVersions_taxonomyPrimary_idx` ON `sourceOverturePlacesVersions` (`taxonomyPrimary`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlacesVersions_addressSourceRecordId_idx` ON `sourceOverturePlacesVersions` (`addressSourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddress2dI18n_locale_idx` ON `sourceHkgovAlsAddress2dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddress2dI18nVersions_releaseId_idx` ON `sourceHkgovAlsAddress2dI18nVersions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddress2dI18nVersions_sourceRecordId_idx` ON `sourceHkgovAlsAddress2dI18nVersions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddress2dI18nVersions_current_lookup_idx` ON `sourceHkgovAlsAddress2dI18nVersions` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddress2dI18nVersions_release_validity_idx` ON `sourceHkgovAlsAddress2dI18nVersions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddress2dI18nVersions_locale_idx` ON `sourceHkgovAlsAddress2dI18nVersions` (`locale`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2d_datasetId_idx` ON `sourceHkgovAlsAddresses2d` (`datasetId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2d_releaseId_idx` ON `sourceHkgovAlsAddresses2d` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2d_sourceRecordId_idx` ON `sourceHkgovAlsAddresses2d` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2d_regionCode_idx` ON `sourceHkgovAlsAddresses2d` (`regionCode`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2d_csuId_idx` ON `sourceHkgovAlsAddresses2d` (`csuId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2d_geoAddress_idx` ON `sourceHkgovAlsAddresses2d` (`geoAddress`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2d_street_lookup_idx` ON `sourceHkgovAlsAddresses2d` (`regionCode`,`streetName`,`streetNumber`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2dVersions_releaseId_idx` ON `sourceHkgovAlsAddresses2dVersions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2dVersions_sourceRecordId_idx` ON `sourceHkgovAlsAddresses2dVersions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2dVersions_current_lookup_idx` ON `sourceHkgovAlsAddresses2dVersions` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2dVersions_release_validity_idx` ON `sourceHkgovAlsAddresses2dVersions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2dVersions_regionCode_idx` ON `sourceHkgovAlsAddresses2dVersions` (`regionCode`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2dVersions_csuId_idx` ON `sourceHkgovAlsAddresses2dVersions` (`csuId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2dVersions_geoAddress_idx` ON `sourceHkgovAlsAddresses2dVersions` (`geoAddress`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2dVersions_street_lookup_idx` ON `sourceHkgovAlsAddresses2dVersions` (`regionCode`,`streetName`,`streetNumber`);