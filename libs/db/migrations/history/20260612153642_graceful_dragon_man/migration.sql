CREATE TABLE `divisionsVersions` (
	`id` text NOT NULL,
	`versionHash` text NOT NULL,
	`regionCode` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromReleaseSetId` text NOT NULL,
	`validToReleaseSetId` text,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
	`level` integer NOT NULL,
	`type` text NOT NULL,
	`otGeometryJson` text,
	`otPopulation` integer,
	`otVersion` text,
	`otVersionHash` text NOT NULL,
	`otSubtype` text,
	`otClass` text,
	`otWikidata` text,
	`otHierarchyJson` text,
	`hierarchyJson` text,
	`parentDivisionId` text,
	`otCartographyJson` text,
	`otBboxJson` text,
	`sourcesJson` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `divisionsVersions_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `divisionsVersionsI18n` (
	`divisionId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromReleaseSetId` text NOT NULL,
	`validToReleaseSetId` text,
	`isCurrent` integer NOT NULL,
	`locale` text NOT NULL,
	`otName` text,
	`otNameVariantJson` text,
	`otNameAlts` text,
	`otNameRulesJson` text,
	`otLocalType` text,
	`isLocaleInferred` integer NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `divisionsVersionsI18n_pk` PRIMARY KEY(`divisionId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `address2dVersions` (
	`id` text NOT NULL,
	`versionHash` text NOT NULL,
	`regionCode` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromReleaseSetId` text NOT NULL,
	`validToReleaseSetId` text,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
	`streetId` text,
	`hamletId` text,
	`microhoodId` text,
	`villageId` text,
	`neighbourhoodId` text,
	`macrohoodId` text,
	`townId` text,
	`districtId` text,
	`areaId` text,
	`countryId` text,
	`geometryJson` text,
	`identifiersJson` text,
	`otStreet` text,
	`otNumber` text,
	`otBboxJson` text,
	`otVersion` text,
	`sourcesJson` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `address2dVersions_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `address2dVersionsI18n` (
	`addressId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromReleaseSetId` text NOT NULL,
	`validToReleaseSetId` text,
	`isCurrent` integer NOT NULL,
	`locale` text NOT NULL,
	`formattedAddress` text NOT NULL,
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
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `address2dVersionsI18n_pk` PRIMARY KEY(`addressId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `address3dVersions` (
	`id` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromReleaseSetId` text NOT NULL,
	`validToReleaseSetId` text,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
	`address2dId` text NOT NULL,
	`sourcesJson` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `address3dVersions_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `address3dVersionsI18n` (
	`address3dId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromReleaseSetId` text NOT NULL,
	`validToReleaseSetId` text,
	`isCurrent` integer NOT NULL,
	`locale` text NOT NULL,
	`formattedAddressPart` text NOT NULL,
	`accessHint` text,
	`unitPortion` text,
	`unitNumber` text,
	`unitType` text,
	`floorNumber` text,
	`floorType` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `address3dVersionsI18n_pk` PRIMARY KEY(`address3dId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `streetsVersions` (
	`id` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromReleaseSetId` text NOT NULL,
	`validToReleaseSetId` text,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
	`yearBuiltJson` text,
	`referencesJson` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `streetsVersions_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `streetsVersionsI18n` (
	`streetId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromReleaseSetId` text NOT NULL,
	`validToReleaseSetId` text,
	`isCurrent` integer NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`base` text,
	`designator` text,
	`directionalPrefix` text,
	`directionalSuffix` text,
	`normalised` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `streetsVersionsI18n_pk` PRIMARY KEY(`streetId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `placesVersions` (
	`id` text NOT NULL,
	`versionHash` text NOT NULL,
	`regionCode` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromReleaseSetId` text NOT NULL,
	`validToReleaseSetId` text,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
	`address2dId` text,
	`address3dId` text,
	`otVersionHash` text NOT NULL,
	`otVersion` text NOT NULL,
	`otLng` real NOT NULL,
	`otLat` real NOT NULL,
	`otBboxJson` text,
	`otOperatingStatus` text,
	`otBasicCategory` text,
	`otTaxonomyPrimary` text,
	`otTaxonomyHierarchyJson` text,
	`otTaxonomyAlternatesJson` text,
	`otBrandWikidata` text,
	`otWebsitesJson` text,
	`otSocialsJson` text,
	`otEmailsJson` text,
	`otPhonesJson` text,
	`otAddressesJson` text,
	`otConfidence` real,
	`sourcesJson` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `placesVersions_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `placesVersionsI18n` (
	`placeId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromReleaseSetId` text NOT NULL,
	`validToReleaseSetId` text,
	`isCurrent` integer NOT NULL,
	`locale` text NOT NULL,
	`otName` text,
	`otNameVariantJson` text,
	`otNameAlts` text,
	`isLocaleInferred` integer NOT NULL,
	`otBrandName` text,
	`otBrandNameVariantJson` text,
	`otBrandNameAlts` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `placesVersionsI18n_pk` PRIMARY KEY(`placeId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE INDEX `divisionsVersions_current_lookup_idx` ON `divisionsVersions` (`regionCode`,`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionsVersions_releaseSet_validity_idx` ON `divisionsVersions` (`regionCode`,`validFromReleaseSetId`,`validToReleaseSetId`);--> statement-breakpoint
CREATE INDEX `divisionsVersions_validity_idx` ON `divisionsVersions` (`regionCode`,`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `divisionsVersions_releaseId_idx` ON `divisionsVersions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `divisionsVersionsI18n_locale_idx` ON `divisionsVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `divisionsVersionsI18n_name_idx` ON `divisionsVersionsI18n` (`locale`,`otName`);--> statement-breakpoint
CREATE INDEX `divisionsVersionsI18n_current_lookup_idx` ON `divisionsVersionsI18n` (`divisionId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address2dVersions_current_lookup_idx` ON `address2dVersions` (`regionCode`,`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address2dVersions_releaseSet_validity_idx` ON `address2dVersions` (`regionCode`,`validFromReleaseSetId`,`validToReleaseSetId`);--> statement-breakpoint
CREATE INDEX `address2dVersions_validity_idx` ON `address2dVersions` (`regionCode`,`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `address2dVersions_releaseId_idx` ON `address2dVersions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `address2dVersionsI18n_locale_idx` ON `address2dVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address2dVersionsI18n_current_lookup_idx` ON `address2dVersionsI18n` (`addressId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3dVersions_current_lookup_idx` ON `address3dVersions` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3dVersions_releaseSet_validity_idx` ON `address3dVersions` (`validFromReleaseSetId`,`validToReleaseSetId`);--> statement-breakpoint
CREATE INDEX `address3dVersions_validity_idx` ON `address3dVersions` (`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `address3dVersions_releaseId_idx` ON `address3dVersions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `address3dVersions_address2dId_idx` ON `address3dVersions` (`address2dId`);--> statement-breakpoint
CREATE INDEX `address3dVersionsI18n_locale_idx` ON `address3dVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address3dVersionsI18n_current_lookup_idx` ON `address3dVersionsI18n` (`address3dId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetsVersions_current_lookup_idx` ON `streetsVersions` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetsVersions_releaseSet_validity_idx` ON `streetsVersions` (`validFromReleaseSetId`,`validToReleaseSetId`);--> statement-breakpoint
CREATE INDEX `streetsVersions_validity_idx` ON `streetsVersions` (`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `streetsVersions_releaseId_idx` ON `streetsVersions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `streetsVersionsI18n_locale_idx` ON `streetsVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `streetsVersionsI18n_name_idx` ON `streetsVersionsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `streetsVersionsI18n_current_lookup_idx` ON `streetsVersionsI18n` (`streetId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `placesVersions_current_lookup_idx` ON `placesVersions` (`regionCode`,`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `placesVersions_releaseSet_validity_idx` ON `placesVersions` (`regionCode`,`validFromReleaseSetId`,`validToReleaseSetId`);--> statement-breakpoint
CREATE INDEX `placesVersions_validity_idx` ON `placesVersions` (`regionCode`,`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `placesVersions_releaseId_idx` ON `placesVersions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `placesVersionsI18n_locale_idx` ON `placesVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `placesVersionsI18n_name_idx` ON `placesVersionsI18n` (`locale`,`otName`);--> statement-breakpoint
CREATE INDEX `placesVersionsI18n_current_lookup_idx` ON `placesVersionsI18n` (`placeId`,`locale`,`isCurrent`);