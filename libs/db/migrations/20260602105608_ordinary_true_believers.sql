CREATE TABLE `datasets` (
	`datasetId` text PRIMARY KEY,
	`regionCode` text NOT NULL,
	`snapshotMonth` text NOT NULL,
	`theme` text NOT NULL,
	`type` text NOT NULL,
	`source` text NOT NULL,
	`sourceVersion` text NOT NULL,
	`rawObjectKey` text NOT NULL,
	`originalFileName` text NOT NULL,
	`status` text NOT NULL,
	`isActive` integer NOT NULL,
	`supersedesDatasetId` text,
	`revokedAt` text,
	`revocationReason` text,
	`ingestedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `entityAliases` (
	`aliasId` text PRIMARY KEY,
	`entityType` text NOT NULL,
	`aliasValue` text NOT NULL,
	`canonicalId` text NOT NULL,
	`sourceSystem` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`validFromMonth` text,
	`validToMonth` text,
	`notes` text,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ingestRuns` (
	`runId` text PRIMARY KEY,
	`datasetId` text NOT NULL,
	`phase` text NOT NULL,
	`status` text NOT NULL,
	`statsJson` text,
	`errorJson` text,
	`startedAt` text NOT NULL,
	`finishedAt` text,
	CONSTRAINT `fk_ingestRuns_datasetId_datasets_datasetId_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`datasetId`)
);
--> statement-breakpoint
CREATE TABLE `stats` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`datasetId` text NOT NULL,
	`dimension` text NOT NULL,
	`metric` text NOT NULL,
	`metricUnit` text NOT NULL,
	`value` real NOT NULL,
	`groupBy` text,
	`groupValue` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `fk_stats_datasetId_datasets_datasetId_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`datasetId`)
);
--> statement-breakpoint
CREATE TABLE `divisions` (
	`id` text PRIMARY KEY,
	`level` integer NOT NULL,
	`otVersion` text,
	`otSubtype` text,
	`otAdminLevel` text,
	`otClass` text,
	`otWikidata` text,
	`otHierarchyJson` text,
	`hierarchyJson` text,
	`parentDivisionId` text,
	`otCartographyJson` text,
	`otBboxJson` text,
	`sourcesJson` text
);
--> statement-breakpoint
CREATE TABLE `divisionsI18n` (
	`divisionId` text NOT NULL,
	`locale` text NOT NULL,
	`otName` text,
	`otNameVariantJson` text,
	`otNameAlts` text,
	`otNameRulesJson` text,
	`otLocalType` text,
	`isLocaleInferred` integer NOT NULL,
	CONSTRAINT `divisionsI18n_pk` PRIMARY KEY(`divisionId`, `locale`),
	CONSTRAINT `fk_divisionsI18n_divisionId_divisions_id_fk` FOREIGN KEY (`divisionId`) REFERENCES `divisions`(`id`)
);
--> statement-breakpoint
CREATE TABLE `divisionsVersions` (
	`id` text NOT NULL,
	`versionHash` text NOT NULL,
	`regionCode` text NOT NULL,
	`datasetId` text NOT NULL,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
	`level` integer NOT NULL,
	`otVersion` text,
	`otVersionHash` text NOT NULL,
	`otSubtype` text,
	`otAdminLevel` text,
	`otClass` text,
	`otWikidata` text,
	`otHierarchyJson` text,
	`hierarchyJson` text,
	`parentDivisionId` text,
	`otCartographyJson` text,
	`otBboxJson` text,
	`sourcesJson` text,
	`createdAt` text NOT NULL,
	CONSTRAINT `divisionsVersions_pk` PRIMARY KEY(`id`, `versionHash`),
	CONSTRAINT `fk_divisionsVersions_datasetId_datasets_datasetId_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`datasetId`)
);
--> statement-breakpoint
CREATE TABLE `divisionsVersionsI18n` (
	`divisionId` text NOT NULL,
	`versionHash` text NOT NULL,
	`locale` text NOT NULL,
	`otName` text,
	`otNameVariantJson` text,
	`otNameAlts` text,
	`otNameRulesJson` text,
	`otLocalType` text,
	`isLocaleInferred` integer NOT NULL,
	CONSTRAINT `divisionsVersionsI18n_pk` PRIMARY KEY(`divisionId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `address2d` (
	`id` text PRIMARY KEY,
	`canonicalKey` text NOT NULL UNIQUE,
	`streetId` text,
	`microhoodId` text,
	`neighbourhoodId` text,
	`subDistrictId` text,
	`districtId` text,
	`regionId` text,
	`countryId` text,
	`otLng` real NOT NULL,
	`otLat` real NOT NULL,
	`otStreet` text,
	`otNumber` text,
	`otBboxJson` text,
	`otVersion` text,
	`sourcesJson` text,
	CONSTRAINT `fk_address2d_microhoodId_divisions_id_fk` FOREIGN KEY (`microhoodId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_neighbourhoodId_divisions_id_fk` FOREIGN KEY (`neighbourhoodId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_subDistrictId_divisions_id_fk` FOREIGN KEY (`subDistrictId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_districtId_divisions_id_fk` FOREIGN KEY (`districtId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_regionId_divisions_id_fk` FOREIGN KEY (`regionId`) REFERENCES `divisions`(`id`),
	CONSTRAINT `fk_address2d_countryId_divisions_id_fk` FOREIGN KEY (`countryId`) REFERENCES `divisions`(`id`)
);
--> statement-breakpoint
CREATE TABLE `address2dI18n` (
	`addressId` text NOT NULL,
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
	`isLocaleInferred` integer NOT NULL,
	`streetNumber` text,
	`streetName` text,
	`intersection` text,
	CONSTRAINT `address2dI18n_pk` PRIMARY KEY(`addressId`, `locale`),
	CONSTRAINT `fk_address2dI18n_addressId_address2d_id_fk` FOREIGN KEY (`addressId`) REFERENCES `address2d`(`id`)
);
--> statement-breakpoint
CREATE TABLE `address2dVersions` (
	`id` text NOT NULL,
	`versionHash` text NOT NULL,
	`datasetId` text NOT NULL,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
	`canonicalKey` text NOT NULL,
	`streetId` text,
	`microhoodId` text,
	`neighbourhoodId` text,
	`subDistrictId` text,
	`districtId` text,
	`regionId` text,
	`countryId` text,
	`otLng` real NOT NULL,
	`otLat` real NOT NULL,
	`otStreet` text,
	`otNumber` text,
	`otBboxJson` text,
	`otVersion` text,
	`sourcesJson` text,
	`createdAt` text NOT NULL,
	CONSTRAINT `address2dVersions_pk` PRIMARY KEY(`id`, `versionHash`),
	CONSTRAINT `fk_address2dVersions_datasetId_datasets_datasetId_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`datasetId`)
);
--> statement-breakpoint
CREATE TABLE `address2dVersionsI18n` (
	`addressId` text NOT NULL,
	`versionHash` text NOT NULL,
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
	`isLocaleInferred` integer NOT NULL,
	`streetNumber` text,
	`streetName` text,
	`intersection` text,
	CONSTRAINT `address2dVersionsI18n_pk` PRIMARY KEY(`addressId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `address3d` (
	`id` text PRIMARY KEY,
	`address2dId` text NOT NULL,
	`sourcesJson` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `fk_address3d_address2dId_address2d_id_fk` FOREIGN KEY (`address2dId`) REFERENCES `address2d`(`id`)
);
--> statement-breakpoint
CREATE TABLE `address3dI18n` (
	`address3dId` text NOT NULL,
	`locale` text NOT NULL,
	`formattedAddressPart` text NOT NULL,
	`accessHint` text,
	`isLocaleInferred` integer NOT NULL,
	`unitPortion` text,
	`unitNumber` text,
	`unitType` text,
	`floorNumber` text,
	`floorType` text,
	CONSTRAINT `address3dI18n_pk` PRIMARY KEY(`address3dId`, `locale`),
	CONSTRAINT `fk_address3dI18n_address3dId_address3d_id_fk` FOREIGN KEY (`address3dId`) REFERENCES `address3d`(`id`)
);
--> statement-breakpoint
CREATE TABLE `address3dVersions` (
	`id` text NOT NULL,
	`versionHash` text NOT NULL,
	`datasetId` text NOT NULL,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
	`address2dId` text NOT NULL,
	`sourcesJson` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	CONSTRAINT `address3dVersions_pk` PRIMARY KEY(`id`, `versionHash`),
	CONSTRAINT `fk_address3dVersions_datasetId_datasets_datasetId_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`datasetId`)
);
--> statement-breakpoint
CREATE TABLE `address3dVersionsI18n` (
	`address3dId` text NOT NULL,
	`versionHash` text NOT NULL,
	`locale` text NOT NULL,
	`formattedAddressPart` text NOT NULL,
	`accessHint` text,
	`isLocaleInferred` integer NOT NULL,
	`unitPortion` text,
	`unitNumber` text,
	`unitType` text,
	`floorNumber` text,
	`floorType` text,
	CONSTRAINT `address3dVersionsI18n_pk` PRIMARY KEY(`address3dId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `streets` (
	`id` text PRIMARY KEY,
	`yearBuiltJson` text,
	`referencesJson` text
);
--> statement-breakpoint
CREATE TABLE `streetsAddress` (
	`streetId` text NOT NULL,
	`addressId` text NOT NULL,
	CONSTRAINT `streetsAddress_pk` PRIMARY KEY(`streetId`, `addressId`),
	CONSTRAINT `fk_streetsAddress_streetId_streets_id_fk` FOREIGN KEY (`streetId`) REFERENCES `streets`(`id`),
	CONSTRAINT `fk_streetsAddress_addressId_address2d_id_fk` FOREIGN KEY (`addressId`) REFERENCES `address2d`(`id`)
);
--> statement-breakpoint
CREATE TABLE `streetsI18n` (
	`streetId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`base` text,
	`designator` text,
	`directionalPrefix` text,
	`directionalSuffix` text,
	`normalised` text,
	CONSTRAINT `streetsI18n_pk` PRIMARY KEY(`streetId`, `locale`),
	CONSTRAINT `fk_streetsI18n_streetId_streets_id_fk` FOREIGN KEY (`streetId`) REFERENCES `streets`(`id`)
);
--> statement-breakpoint
CREATE TABLE `streetsVersions` (
	`id` text NOT NULL,
	`versionHash` text NOT NULL,
	`datasetId` text NOT NULL,
	`validFromMonth` text NOT NULL,
	`validToMonth` text,
	`isCurrent` integer NOT NULL,
	`yearBuiltJson` text,
	`referencesJson` text,
	`createdAt` text NOT NULL,
	CONSTRAINT `streetsVersions_pk` PRIMARY KEY(`id`, `versionHash`),
	CONSTRAINT `fk_streetsVersions_datasetId_datasets_datasetId_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`datasetId`)
);
--> statement-breakpoint
CREATE TABLE `streetsVersionsI18n` (
	`streetId` text NOT NULL,
	`versionHash` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`base` text,
	`designator` text,
	`directionalPrefix` text,
	`directionalSuffix` text,
	`normalised` text,
	CONSTRAINT `streetsVersionsI18n_pk` PRIMARY KEY(`streetId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `places` (
	`regionCode` text NOT NULL,
	`datasetId` text NOT NULL,
	`id` text PRIMARY KEY,
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
	`firstSeenMonth` text NOT NULL,
	`lastSeenMonth` text NOT NULL,
	CONSTRAINT `fk_places_datasetId_datasets_datasetId_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`datasetId`),
	CONSTRAINT `fk_places_address2dId_address2d_id_fk` FOREIGN KEY (`address2dId`) REFERENCES `address2d`(`id`),
	CONSTRAINT `fk_places_address3dId_address3d_id_fk` FOREIGN KEY (`address3dId`) REFERENCES `address3d`(`id`)
);
--> statement-breakpoint
CREATE TABLE `placesCells` (
	`regionCode` text NOT NULL,
	`id` text NOT NULL,
	`h3Level` integer NOT NULL,
	`h3Cell` text NOT NULL,
	CONSTRAINT `placesCells_pk` PRIMARY KEY(`regionCode`, `id`, `h3Level`, `h3Cell`),
	CONSTRAINT `fk_placesCells_id_places_id_fk` FOREIGN KEY (`id`) REFERENCES `places`(`id`)
);
--> statement-breakpoint
CREATE TABLE `placesDivision` (
	`placeId` text NOT NULL,
	`divisionId` text NOT NULL,
	CONSTRAINT `placesDivision_pk` PRIMARY KEY(`placeId`, `divisionId`),
	CONSTRAINT `fk_placesDivision_placeId_places_id_fk` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`),
	CONSTRAINT `fk_placesDivision_divisionId_divisions_id_fk` FOREIGN KEY (`divisionId`) REFERENCES `divisions`(`id`)
);
--> statement-breakpoint
CREATE TABLE `placesI18n` (
	`placeId` text NOT NULL,
	`locale` text NOT NULL,
	`otName` text,
	`otNameVariantJson` text,
	`otNameAlts` text,
	`isLocaleInferred` integer NOT NULL,
	`otBrandName` text,
	`otBrandNameVariantJson` text,
	`otBrandNameAlts` text,
	CONSTRAINT `placesI18n_pk` PRIMARY KEY(`placeId`, `locale`),
	CONSTRAINT `fk_placesI18n_placeId_places_id_fk` FOREIGN KEY (`placeId`) REFERENCES `places`(`id`)
);
--> statement-breakpoint
CREATE TABLE `placesVersions` (
	`id` text NOT NULL,
	`versionHash` text NOT NULL,
	`regionCode` text NOT NULL,
	`datasetId` text NOT NULL,
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
	CONSTRAINT `placesVersions_pk` PRIMARY KEY(`id`, `versionHash`),
	CONSTRAINT `fk_placesVersions_datasetId_datasets_datasetId_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`datasetId`)
);
--> statement-breakpoint
CREATE TABLE `placesVersionsI18n` (
	`placeId` text NOT NULL,
	`versionHash` text NOT NULL,
	`locale` text NOT NULL,
	`otName` text,
	`otNameVariantJson` text,
	`otNameAlts` text,
	`isLocaleInferred` integer NOT NULL,
	`otBrandName` text,
	`otBrandNameVariantJson` text,
	`otBrandNameAlts` text,
	CONSTRAINT `placesVersionsI18n_pk` PRIMARY KEY(`placeId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE INDEX `datasets_active_lookup_idx` ON `datasets` (`regionCode`,`source`,`sourceVersion`,`type`,`isActive`);--> statement-breakpoint
CREATE UNIQUE INDEX `datasets_dataset_id_unique_idx` ON `datasets` (`datasetId`);--> statement-breakpoint
CREATE UNIQUE INDEX `entityAliases_entityType_aliasValue_unique_idx` ON `entityAliases` (`entityType`,`aliasValue`);--> statement-breakpoint
CREATE INDEX `entityAliases_canonical_lookup_idx` ON `entityAliases` (`entityType`,`canonicalId`);--> statement-breakpoint
CREATE INDEX `stats_datasetId_idx` ON `stats` (`datasetId`);--> statement-breakpoint
CREATE INDEX `stats_dimension_idx` ON `stats` (`type`,`dimension`,`metric`,`groupBy`,`groupValue`);--> statement-breakpoint
CREATE INDEX `divisions_level_idx` ON `divisions` (`level`);--> statement-breakpoint
CREATE INDEX `divisions_parentDivisionId_idx` ON `divisions` (`parentDivisionId`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_locale_idx` ON `divisionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_name_idx` ON `divisionsI18n` (`locale`,`otName`);--> statement-breakpoint
CREATE INDEX `divisionsVersions_current_lookup_idx` ON `divisionsVersions` (`regionCode`,`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionsVersions_validity_idx` ON `divisionsVersions` (`regionCode`,`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `divisionsVersions_datasetId_idx` ON `divisionsVersions` (`datasetId`);--> statement-breakpoint
CREATE INDEX `divisionsVersionsI18n_locale_idx` ON `divisionsVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `divisionsVersionsI18n_name_idx` ON `divisionsVersionsI18n` (`locale`,`otName`);--> statement-breakpoint
CREATE INDEX `address2d_streetId_idx` ON `address2d` (`streetId`);--> statement-breakpoint
CREATE INDEX `address2d_division_idx` ON `address2d` (`microhoodId`,`neighbourhoodId`,`subDistrictId`,`districtId`);--> statement-breakpoint
CREATE INDEX `address2dI18n_locale_idx` ON `address2dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address2dVersions_current_lookup_idx` ON `address2dVersions` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address2dVersions_validity_idx` ON `address2dVersions` (`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `address2dVersions_datasetId_idx` ON `address2dVersions` (`datasetId`);--> statement-breakpoint
CREATE INDEX `address2dVersions_canonicalKey_idx` ON `address2dVersions` (`canonicalKey`);--> statement-breakpoint
CREATE INDEX `address2dVersionsI18n_locale_idx` ON `address2dVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address3d_address2dId_idx` ON `address3d` (`address2dId`);--> statement-breakpoint
CREATE INDEX `address3dI18n_locale_idx` ON `address3dI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `address3dVersions_current_lookup_idx` ON `address3dVersions` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3dVersions_validity_idx` ON `address3dVersions` (`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `address3dVersions_datasetId_idx` ON `address3dVersions` (`datasetId`);--> statement-breakpoint
CREATE INDEX `address3dVersions_address2dId_idx` ON `address3dVersions` (`address2dId`);--> statement-breakpoint
CREATE INDEX `address3dVersionsI18n_locale_idx` ON `address3dVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `streetsAddress_addressId_idx` ON `streetsAddress` (`addressId`);--> statement-breakpoint
CREATE INDEX `streetsI18n_locale_idx` ON `streetsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `streetsI18n_name_idx` ON `streetsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `streetsVersions_current_lookup_idx` ON `streetsVersions` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetsVersions_validity_idx` ON `streetsVersions` (`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `streetsVersions_datasetId_idx` ON `streetsVersions` (`datasetId`);--> statement-breakpoint
CREATE INDEX `streetsVersionsI18n_locale_idx` ON `streetsVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `streetsVersionsI18n_name_idx` ON `streetsVersionsI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `places_datasetId_idx` ON `places` (`datasetId`);--> statement-breakpoint
CREATE INDEX `places_category_idx` ON `places` (`regionCode`,`otBasicCategory`);--> statement-breakpoint
CREATE INDEX `places_taxonomy_idx` ON `places` (`regionCode`,`otTaxonomyPrimary`);--> statement-breakpoint
CREATE INDEX `places_status_idx` ON `places` (`regionCode`,`otOperatingStatus`);--> statement-breakpoint
CREATE INDEX `placesCells_lookup_idx` ON `placesCells` (`regionCode`,`h3Level`,`h3Cell`,`id`);--> statement-breakpoint
CREATE INDEX `placesDivision_divisionId_idx` ON `placesDivision` (`divisionId`,`placeId`);--> statement-breakpoint
CREATE INDEX `placesI18n_locale_idx` ON `placesI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `placesI18n_name_idx` ON `placesI18n` (`locale`,`otName`);--> statement-breakpoint
CREATE INDEX `placesVersions_current_lookup_idx` ON `placesVersions` (`regionCode`,`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `placesVersions_validity_idx` ON `placesVersions` (`regionCode`,`validFromMonth`,`validToMonth`);--> statement-breakpoint
CREATE INDEX `placesVersions_datasetId_idx` ON `placesVersions` (`datasetId`);--> statement-breakpoint
CREATE INDEX `placesVersionsI18n_locale_idx` ON `placesVersionsI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `placesVersionsI18n_name_idx` ON `placesVersionsI18n` (`locale`,`otName`);
