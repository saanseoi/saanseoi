CREATE TABLE `overtureAddresses2d` (
	`sourceRecordId` text NOT NULL,
	`area` text,
	`district` text,
	`unit` text,
	`streetName` text,
	`streetNumber` text,
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
	CONSTRAINT `overtureAddresses2d_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
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
	`population` integer,
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
	`addressSourceRecordId` text,
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
CREATE INDEX `overtureAddresses2d_releaseId_idx` ON `overtureAddresses2d` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overtureAddresses2d_sourceRecordId_idx` ON `overtureAddresses2d` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overtureAddresses2d_current_lookup_idx` ON `overtureAddresses2d` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overtureAddresses2d_release_validity_idx` ON `overtureAddresses2d` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overtureAddresses2d_area_idx` ON `overtureAddresses2d` (`area`);--> statement-breakpoint
CREATE INDEX `overtureAddresses2d_district_idx` ON `overtureAddresses2d` (`district`);--> statement-breakpoint
CREATE INDEX `overtureAddresses2d_district_street_lookup_idx` ON `overtureAddresses2d` (`district`,`streetName`,`streetNumber`);--> statement-breakpoint
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
CREATE INDEX `overturePlaces_addressSourceRecordId_idx` ON `overturePlaces` (`addressSourceRecordId`);--> statement-breakpoint
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
CREATE INDEX `hkgovAlsAddresses2d_street_lookup_idx` ON `hkgovAlsAddresses2d` (`streetName`,`streetNumber`);