CREATE TABLE `sourceOvertureAddress2dI18n` (
	`releaseId` text NOT NULL,
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`streetName` text,
	`locality` text,
	`region` text,
	`country` text,
	CONSTRAINT `sourceOvertureAddress2dI18n_pk` PRIMARY KEY(`releaseId`, `sourceRecordId`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `sourceOvertureAddresses2d` (
	`releaseId` text NOT NULL,
	`datasetId` text NOT NULL,
	`sourceRecordId` text NOT NULL,
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
	`rawProperties` text,
	CONSTRAINT `sourceOvertureAddresses2d_pk` PRIMARY KEY(`releaseId`, `sourceRecordId`)
);
--> statement-breakpoint
CREATE TABLE `sourceOvertureDivisionI18n` (
	`releaseId` text NOT NULL,
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`nameRules` text,
	`localType` text,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	CONSTRAINT `sourceOvertureDivisionI18n_pk` PRIMARY KEY(`releaseId`, `sourceRecordId`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `sourceOvertureDivisions` (
	`releaseId` text NOT NULL,
	`datasetId` text NOT NULL,
	`sourceRecordId` text NOT NULL,
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
	`rawProperties` text,
	CONSTRAINT `sourceOvertureDivisions_pk` PRIMARY KEY(`releaseId`, `sourceRecordId`)
);
--> statement-breakpoint
CREATE TABLE `sourceOverturePlaceI18n` (
	`releaseId` text NOT NULL,
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`brandName` text,
	`brandNameVariant` text,
	`brandNameAlts` text,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	CONSTRAINT `sourceOverturePlaceI18n_pk` PRIMARY KEY(`releaseId`, `sourceRecordId`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `sourceOverturePlaces` (
	`releaseId` text NOT NULL,
	`datasetId` text NOT NULL,
	`sourceRecordId` text NOT NULL,
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
	`rawProperties` text,
	CONSTRAINT `sourceOverturePlaces_pk` PRIMARY KEY(`releaseId`, `sourceRecordId`)
);
--> statement-breakpoint
CREATE TABLE `sourceHkgovAlsAddress2dI18n` (
	`releaseId` text NOT NULL,
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
	CONSTRAINT `sourceHkgovAlsAddress2dI18n_pk` PRIMARY KEY(`releaseId`, `sourceRecordId`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `sourceHkgovAlsAddresses2d` (
	`releaseId` text NOT NULL,
	`datasetId` text NOT NULL,
	`sourceRecordId` text NOT NULL,
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
	`rawPayload` text,
	CONSTRAINT `sourceHkgovAlsAddresses2d_pk` PRIMARY KEY(`releaseId`, `sourceRecordId`)
);
--> statement-breakpoint
CREATE INDEX `sourceOvertureAddress2dI18n_locale_idx` ON `sourceOvertureAddress2dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2d_datasetId_idx` ON `sourceOvertureAddresses2d` (`datasetId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2d_releaseId_idx` ON `sourceOvertureAddresses2d` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2d_sourceRecordId_idx` ON `sourceOvertureAddresses2d` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2d_regionCode_idx` ON `sourceOvertureAddresses2d` (`regionCode`);--> statement-breakpoint
CREATE INDEX `sourceOvertureAddresses2d_street_lookup_idx` ON `sourceOvertureAddresses2d` (`regionCode`,`streetName`,`streetNumber`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisionI18n_locale_idx` ON `sourceOvertureDivisionI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisions_datasetId_idx` ON `sourceOvertureDivisions` (`datasetId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisions_releaseId_idx` ON `sourceOvertureDivisions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisions_sourceRecordId_idx` ON `sourceOvertureDivisions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisions_regionCode_idx` ON `sourceOvertureDivisions` (`regionCode`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisions_level_idx` ON `sourceOvertureDivisions` (`level`);--> statement-breakpoint
CREATE INDEX `sourceOvertureDivisions_type_idx` ON `sourceOvertureDivisions` (`divisionType`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaceI18n_locale_idx` ON `sourceOverturePlaceI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaces_datasetId_idx` ON `sourceOverturePlaces` (`datasetId`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaces_releaseId_idx` ON `sourceOverturePlaces` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaces_sourceRecordId_idx` ON `sourceOverturePlaces` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaces_regionCode_idx` ON `sourceOverturePlaces` (`regionCode`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaces_basicCategory_idx` ON `sourceOverturePlaces` (`basicCategory`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaces_taxonomyPrimary_idx` ON `sourceOverturePlaces` (`taxonomyPrimary`);--> statement-breakpoint
CREATE INDEX `sourceOverturePlaces_addressSourceRecordId_idx` ON `sourceOverturePlaces` (`addressSourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddress2dI18n_locale_idx` ON `sourceHkgovAlsAddress2dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2d_datasetId_idx` ON `sourceHkgovAlsAddresses2d` (`datasetId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2d_releaseId_idx` ON `sourceHkgovAlsAddresses2d` (`releaseId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2d_sourceRecordId_idx` ON `sourceHkgovAlsAddresses2d` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2d_regionCode_idx` ON `sourceHkgovAlsAddresses2d` (`regionCode`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2d_csuId_idx` ON `sourceHkgovAlsAddresses2d` (`csuId`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2d_geoAddress_idx` ON `sourceHkgovAlsAddresses2d` (`geoAddress`);--> statement-breakpoint
CREATE INDEX `sourceHkgovAlsAddresses2d_street_lookup_idx` ON `sourceHkgovAlsAddresses2d` (`regionCode`,`streetName`,`streetNumber`);