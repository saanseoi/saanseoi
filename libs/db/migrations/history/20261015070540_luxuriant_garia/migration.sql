DROP VIEW `historyEvents`;--> statement-breakpoint
ALTER TABLE `divisionAreas` ADD `producerDatasetCode` text;--> statement-breakpoint
ALTER TABLE `divisionBoundaries` ADD `producerDatasetCode` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_address2d` (
	`id` text NOT NULL,
	`parentAddressId` text,
	`granularity` text DEFAULT 'unknown',
	`streetId` text,
	`hamletId` text,
	`microhoodId` text,
	`villageId` text,
	`neighbourhoodId` text,
	`ruralAreaId` text,
	`macrohoodId` text,
	`townId` text,
	`landformId` text,
	`districtId` text,
	`areaId` text,
	`countryId` text,
	`identifiers` text,
	`sources` text,
	`geometry` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2d_pk` PRIMARY KEY(`id`, `snapshotId`),
	CONSTRAINT "address2d_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "granularity" is not null))
);--> statement-breakpoint
INSERT INTO `__new_address2d`(`id`, `parentAddressId`, `granularity`, `streetId`, `hamletId`, `microhoodId`, `villageId`, `neighbourhoodId`, `ruralAreaId`, `macrohoodId`, `townId`, `landformId`, `districtId`, `areaId`, `countryId`, `identifiers`, `sources`, `geometry`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `id`, `parentAddressId`, `granularity`, `streetId`, `hamletId`, `microhoodId`, `villageId`, `neighbourhoodId`, `ruralAreaId`, `macrohoodId`, `townId`, `landformId`, `districtId`, `areaId`, `countryId`, `identifiers`, `sources`, `geometry`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `address2d`;--> statement-breakpoint
DROP TABLE `address2d`;--> statement-breakpoint
ALTER TABLE `__new_address2d` RENAME TO `address2d`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_address2dBuildingNumberLookup` (
	`addressId` text NOT NULL,
	`buildingNumber` text NOT NULL,
	`numericStem` text,
	`evidence` text,
	`derivation` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dBuildingNumberLookup_pk` PRIMARY KEY(`addressId`, `snapshotId`, `buildingNumber`),
	CONSTRAINT "address2dBuildingNumberLookup_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "evidence" is not null))
);--> statement-breakpoint
INSERT INTO `__new_address2dBuildingNumberLookup`(`addressId`, `buildingNumber`, `numericStem`, `evidence`, `derivation`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `addressId`, `buildingNumber`, `numericStem`, `evidence`, `derivation`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `address2dBuildingNumberLookup`;--> statement-breakpoint
DROP TABLE `address2dBuildingNumberLookup`;--> statement-breakpoint
ALTER TABLE `__new_address2dBuildingNumberLookup` RENAME TO `address2dBuildingNumberLookup`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_address2dI18n` (
	`addressId` text NOT NULL,
	`locale` text NOT NULL,
	`meta` text DEFAULT '{"isLocaleInferred":false}',
	`formattedAddress` text,
	`buildingName` text,
	`buildingNumberExpression` text,
	`buildingNumberFrom` text,
	`buildingNumberTo` text,
	`buildingNumberConnector` text,
	`blockExpression` text,
	`blockType` text,
	`blockRef` text,
	`blockTypeBeforeNumber` integer,
	`phaseExpression` text,
	`phaseName` text,
	`phaseRef` text,
	`estateName` text,
	`streetName` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dI18n_pk` PRIMARY KEY(`addressId`, `snapshotId`, `locale`),
	CONSTRAINT "address2dI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "formattedAddress" is not null and "meta" is not null))
);--> statement-breakpoint
INSERT INTO `__new_address2dI18n`(`addressId`, `locale`, `meta`, `formattedAddress`, `buildingName`, `buildingNumberExpression`, `buildingNumberFrom`, `buildingNumberTo`, `buildingNumberConnector`, `blockExpression`, `blockType`, `blockRef`, `blockTypeBeforeNumber`, `phaseExpression`, `phaseName`, `phaseRef`, `estateName`, `streetName`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `addressId`, `locale`, `meta`, `formattedAddress`, `buildingName`, `buildingNumberExpression`, `buildingNumberFrom`, `buildingNumberTo`, `buildingNumberConnector`, `blockExpression`, `blockType`, `blockRef`, `blockTypeBeforeNumber`, `phaseExpression`, `phaseName`, `phaseRef`, `estateName`, `streetName`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `address2dI18n`;--> statement-breakpoint
DROP TABLE `address2dI18n`;--> statement-breakpoint
ALTER TABLE `__new_address2dI18n` RENAME TO `address2dI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_address3d` (
	`id` text NOT NULL,
	`address2dId` text,
	`units` text,
	`unitCount` integer,
	`contentHash` text,
	`unresolvedSectionIds` text,
	`sources` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3d_pk` PRIMARY KEY(`id`, `snapshotId`),
	CONSTRAINT "address3d_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "address2dId" is not null and "units" is not null and "unitCount" is not null and "contentHash" is not null and "unresolvedSectionIds" is not null))
);--> statement-breakpoint
INSERT INTO `__new_address3d`(`id`, `address2dId`, `units`, `unitCount`, `contentHash`, `unresolvedSectionIds`, `sources`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `id`, `address2dId`, `units`, `unitCount`, `contentHash`, `unresolvedSectionIds`, `sources`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `address3d`;--> statement-breakpoint
DROP TABLE `address3d`;--> statement-breakpoint
ALTER TABLE `__new_address3d` RENAME TO `address3d`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_address3dI18n` (
	`address3dId` text NOT NULL,
	`locale` text NOT NULL,
	`meta` text DEFAULT '{"isLocaleInferred":false}',
	`units` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3dI18n_pk` PRIMARY KEY(`address3dId`, `snapshotId`, `locale`),
	CONSTRAINT "address3dI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "units" is not null and "meta" is not null))
);--> statement-breakpoint
INSERT INTO `__new_address3dI18n`(`address3dId`, `locale`, `meta`, `units`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `address3dId`, `locale`, `meta`, `units`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `address3dI18n`;--> statement-breakpoint
DROP TABLE `address3dI18n`;--> statement-breakpoint
ALTER TABLE `__new_address3dI18n` RENAME TO `address3dI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisionAreas` (
	`id` text NOT NULL,
	`variant` text DEFAULT 'overture',
	`bbox` text,
	`geometry` text,
	`sources` text,
	`type` text,
	`isLand` integer,
	`isTerritorial` integer,
	`divisionId` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`producerDatasetCode` text,
	CONSTRAINT `divisionAreas_pk` PRIMARY KEY(`id`, `snapshotId`),
	CONSTRAINT "divisionAreas_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "divisionId" is not null and "variant" is not null and "type" is not null))
);--> statement-breakpoint
INSERT INTO `__new_divisionAreas`(`id`, `variant`, `bbox`, `geometry`, `sources`, `type`, `isLand`, `isTerritorial`, `divisionId`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `id`, `variant`, `bbox`, `geometry`, `sources`, `type`, `isLand`, `isTerritorial`, `divisionId`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `divisionAreas`;--> statement-breakpoint
DROP TABLE `divisionAreas`;--> statement-breakpoint
ALTER TABLE `__new_divisionAreas` RENAME TO `divisionAreas`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisionBoundaries` (
	`id` text NOT NULL,
	`variant` text DEFAULT 'overture',
	`bbox` text,
	`geometry` text,
	`sources` text,
	`type` text,
	`isLand` integer,
	`isTerritorial` integer,
	`leftDivisionId` text,
	`rightDivisionId` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`producerDatasetCode` text,
	CONSTRAINT `divisionBoundaries_pk` PRIMARY KEY(`id`, `snapshotId`),
	CONSTRAINT "divisionBoundaries_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "leftDivisionId" is not null and "rightDivisionId" is not null and "variant" is not null and "type" is not null))
);--> statement-breakpoint
INSERT INTO `__new_divisionBoundaries`(`id`, `variant`, `bbox`, `geometry`, `sources`, `type`, `isLand`, `isTerritorial`, `leftDivisionId`, `rightDivisionId`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `id`, `variant`, `bbox`, `geometry`, `sources`, `type`, `isLand`, `isTerritorial`, `leftDivisionId`, `rightDivisionId`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `divisionBoundaries`;--> statement-breakpoint
DROP TABLE `divisionBoundaries`;--> statement-breakpoint
ALTER TABLE `__new_divisionBoundaries` RENAME TO `divisionBoundaries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisions` (
	`id` text NOT NULL,
	`divisionCode` text,
	`identifiers` text,
	`level` integer,
	`category` text,
	`class` text,
	`hierarchies` text,
	`cartography` text,
	`sources` text,
	`geometry` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisions_pk` PRIMARY KEY(`id`, `snapshotId`),
	CONSTRAINT "divisions_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "class" is not null and "hierarchies" is not null))
);--> statement-breakpoint
INSERT INTO `__new_divisions`(`id`, `divisionCode`, `identifiers`, `level`, `category`, `class`, `hierarchies`, `cartography`, `sources`, `geometry`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `id`, `divisionCode`, `identifiers`, `level`, `category`, `class`, `hierarchies`, `cartography`, `sources`, `geometry`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `divisions`;--> statement-breakpoint
DROP TABLE `divisions`;--> statement-breakpoint
ALTER TABLE `__new_divisions` RENAME TO `divisions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisionsI18n` (
	`divisionId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`nameRules` text,
	`meta` text DEFAULT '{"isLocaleInferred":false}',
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionsI18n_pk` PRIMARY KEY(`divisionId`, `snapshotId`, `locale`),
	CONSTRAINT "divisionsI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "meta" is not null))
);--> statement-breakpoint
INSERT INTO `__new_divisionsI18n`(`divisionId`, `locale`, `name`, `nameVariant`, `nameAlts`, `nameRules`, `meta`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `divisionId`, `locale`, `name`, `nameVariant`, `nameAlts`, `nameRules`, `meta`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `divisionsI18n`;--> statement-breakpoint
DROP TABLE `divisionsI18n`;--> statement-breakpoint
ALTER TABLE `__new_divisionsI18n` RENAME TO `divisionsI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_places` (
	`id` text NOT NULL,
	`resourceReleaseId` text,
	`addressDependencyHash` text,
	`addressSnapshotId` text,
	`address2dId` text,
	`address3dId` text,
	`address3dUnitId` text,
	`address3dMembership` text,
	`countryId` text,
	`areaId` text,
	`districtId` text,
	`townId` text,
	`ruralAreaId` text,
	`macrohoodId` text,
	`neighbourhoodId` text,
	`villageId` text,
	`microhoodId` text,
	`hamletId` text,
	`landformId` text,
	`divisionDefinitionSetId` text,
	`geometry` text,
	`bbox` text,
	`operatingStatus` text,
	`basicCategory` text,
	`taxonomyPrimary` text,
	`taxonomyHierarchy` text,
	`taxonomyAlternates` text,
	`identifiers` text,
	`websites` text,
	`socials` text,
	`emails` text,
	`phones` text,
	`addresses` text,
	`confidence` real,
	`sources` text,
	`firstSeenMonth` text,
	`lastSeenMonth` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `places_pk` PRIMARY KEY(`id`, `snapshotId`),
	CONSTRAINT "places_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "resourceReleaseId" is not null and "geometry" is not null and "firstSeenMonth" is not null and "lastSeenMonth" is not null))
);--> statement-breakpoint
INSERT INTO `__new_places`(`id`, `resourceReleaseId`, `addressDependencyHash`, `addressSnapshotId`, `address2dId`, `address3dId`, `address3dUnitId`, `address3dMembership`, `countryId`, `areaId`, `districtId`, `townId`, `ruralAreaId`, `macrohoodId`, `neighbourhoodId`, `villageId`, `microhoodId`, `hamletId`, `landformId`, `divisionDefinitionSetId`, `geometry`, `bbox`, `operatingStatus`, `basicCategory`, `taxonomyPrimary`, `taxonomyHierarchy`, `taxonomyAlternates`, `identifiers`, `websites`, `socials`, `emails`, `phones`, `addresses`, `confidence`, `sources`, `firstSeenMonth`, `lastSeenMonth`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `id`, `resourceReleaseId`, `addressDependencyHash`, `addressSnapshotId`, `address2dId`, `address3dId`, `address3dUnitId`, `address3dMembership`, `countryId`, `areaId`, `districtId`, `townId`, `ruralAreaId`, `macrohoodId`, `neighbourhoodId`, `villageId`, `microhoodId`, `hamletId`, `landformId`, `divisionDefinitionSetId`, `geometry`, `bbox`, `operatingStatus`, `basicCategory`, `taxonomyPrimary`, `taxonomyHierarchy`, `taxonomyAlternates`, `identifiers`, `websites`, `socials`, `emails`, `phones`, `addresses`, `confidence`, `sources`, `firstSeenMonth`, `lastSeenMonth`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `places`;--> statement-breakpoint
DROP TABLE `places`;--> statement-breakpoint
ALTER TABLE `__new_places` RENAME TO `places`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_placesI18n` (
	`searchDependencyText` text,
	`placeId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`nameVariant` text,
	`nameAlts` text,
	`brandName` text,
	`brandNameVariant` text,
	`brandNameAlts` text,
	`freeformAddress` text,
	`accessHint` text,
	`meta` text DEFAULT '{"isLocaleInferred":false}',
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `placesI18n_pk` PRIMARY KEY(`placeId`, `snapshotId`, `locale`),
	CONSTRAINT "placesI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null))
);--> statement-breakpoint
INSERT INTO `__new_placesI18n`(`searchDependencyText`, `placeId`, `locale`, `name`, `nameVariant`, `nameAlts`, `brandName`, `brandNameVariant`, `brandNameAlts`, `freeformAddress`, `accessHint`, `meta`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `searchDependencyText`, `placeId`, `locale`, `name`, `nameVariant`, `nameAlts`, `brandName`, `brandNameVariant`, `brandNameAlts`, `freeformAddress`, `accessHint`, `meta`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `placesI18n`;--> statement-breakpoint
DROP TABLE `placesI18n`;--> statement-breakpoint
ALTER TABLE `__new_placesI18n` RENAME TO `placesI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_statsFields` (
	`datasetCode` text NOT NULL,
	`measureCode` text,
	`measureVersionHash` text DEFAULT '',
	`fieldName` text NOT NULL,
	`sourceField` text,
	`dimensions` text,
	`comparability` text,
	`sourceNullOption` text,
	`statisticKind` text DEFAULT 'unreviewed',
	`aggregation` text DEFAULT 'unreviewed',
	`aggregationPercentile` real,
	`periodicity` text,
	`denominatorFieldName` text,
	`valueKind` text,
	`unitCode` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsFields_pk` PRIMARY KEY(`datasetCode`, `fieldName`, `snapshotId`),
	CONSTRAINT "statsFields_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "measureCode" is not null and "measureVersionHash" is not null and "sourceField" is not null and "dimensions" is not null and "statisticKind" is not null and "aggregation" is not null and "valueKind" is not null and "unitCode" is not null))
);--> statement-breakpoint
INSERT INTO `__new_statsFields`(`datasetCode`, `measureCode`, `measureVersionHash`, `fieldName`, `sourceField`, `dimensions`, `comparability`, `sourceNullOption`, `statisticKind`, `aggregation`, `aggregationPercentile`, `periodicity`, `denominatorFieldName`, `valueKind`, `unitCode`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `datasetCode`, `measureCode`, `measureVersionHash`, `fieldName`, `sourceField`, `dimensions`, `comparability`, `sourceNullOption`, `statisticKind`, `aggregation`, `aggregationPercentile`, `periodicity`, `denominatorFieldName`, `valueKind`, `unitCode`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `statsFields`;--> statement-breakpoint
DROP TABLE `statsFields`;--> statement-breakpoint
ALTER TABLE `__new_statsFields` RENAME TO `statsFields`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_statsFieldsI18n` (
	`datasetCode` text NOT NULL,
	`fieldName` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`description` text,
	`meta` text DEFAULT '{"isLocaleInferred":false}',
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsFieldsI18n_pk` PRIMARY KEY(`datasetCode`, `fieldName`, `locale`, `snapshotId`),
	CONSTRAINT "statsFieldsI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "name" is not null and "meta" is not null))
);--> statement-breakpoint
INSERT INTO `__new_statsFieldsI18n`(`datasetCode`, `fieldName`, `locale`, `name`, `description`, `meta`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `datasetCode`, `fieldName`, `locale`, `name`, `description`, `meta`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `statsFieldsI18n`;--> statement-breakpoint
DROP TABLE `statsFieldsI18n`;--> statement-breakpoint
ALTER TABLE `__new_statsFieldsI18n` RENAME TO `statsFieldsI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_statsMeasures` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasures_pk` PRIMARY KEY(`datasetCode`, `measureCode`, `snapshotId`),
	CONSTRAINT "statsMeasures_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null))
);--> statement-breakpoint
INSERT INTO `__new_statsMeasures`(`datasetCode`, `measureCode`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `datasetCode`, `measureCode`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `statsMeasures`;--> statement-breakpoint
DROP TABLE `statsMeasures`;--> statement-breakpoint
ALTER TABLE `__new_statsMeasures` RENAME TO `statsMeasures`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_statsMeasuresI18n` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`locale` text NOT NULL,
	`name` text,
	`description` text,
	`meta` text DEFAULT '{"isLocaleInferred":false}',
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasuresI18n_pk` PRIMARY KEY(`datasetCode`, `measureCode`, `locale`, `snapshotId`),
	CONSTRAINT "statsMeasuresI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "name" is not null and "meta" is not null))
);--> statement-breakpoint
INSERT INTO `__new_statsMeasuresI18n`(`datasetCode`, `measureCode`, `locale`, `name`, `description`, `meta`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `datasetCode`, `measureCode`, `locale`, `name`, `description`, `meta`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `statsMeasuresI18n`;--> statement-breakpoint
DROP TABLE `statsMeasuresI18n`;--> statement-breakpoint
ALTER TABLE `__new_statsMeasuresI18n` RENAME TO `statsMeasuresI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_statsRecords` (
	`id` text NOT NULL,
	`datasetCode` text,
	`sourceFeatureRef` text,
	`divisionId` text,
	`referencePeriodCode` text,
	`referencePeriodStart` text,
	`referencePeriodEnd` text,
	`referencePeriodGranularity` text,
	`referencePeriodEndYear` text,
	`geography` text,
	`fieldSources` text DEFAULT '{}',
	`definitionSetId` text,
	`values` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsRecords_pk` PRIMARY KEY(`id`, `snapshotId`),
	CONSTRAINT "statsRecords_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "datasetCode" is not null and "sourceFeatureRef" is not null and "referencePeriodCode" is not null and "referencePeriodGranularity" is not null and "referencePeriodEndYear" is not null and "geography" is not null and "fieldSources" is not null and "definitionSetId" is not null and "values" is not null))
);--> statement-breakpoint
INSERT INTO `__new_statsRecords`(`id`, `datasetCode`, `sourceFeatureRef`, `divisionId`, `referencePeriodCode`, `referencePeriodStart`, `referencePeriodEnd`, `referencePeriodGranularity`, `referencePeriodEndYear`, `geography`, `fieldSources`, `definitionSetId`, `values`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `id`, `datasetCode`, `sourceFeatureRef`, `divisionId`, `referencePeriodCode`, `referencePeriodStart`, `referencePeriodEnd`, `referencePeriodGranularity`, `referencePeriodEndYear`, `geography`, `fieldSources`, `definitionSetId`, `values`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `statsRecords`;--> statement-breakpoint
DROP TABLE `statsRecords`;--> statement-breakpoint
ALTER TABLE `__new_statsRecords` RENAME TO `statsRecords`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_statsValuesI18n` (
	`datasetCode` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`valueCode` text NOT NULL,
	`locale` text NOT NULL,
	`meta` text DEFAULT '{"isLocaleInferred":false}',
	`name` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsValuesI18n_pk` PRIMARY KEY(`datasetCode`, `dimensionCode`, `valueCode`, `locale`, `snapshotId`),
	CONSTRAINT "statsValuesI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "name" is not null and "meta" is not null))
);--> statement-breakpoint
INSERT INTO `__new_statsValuesI18n`(`datasetCode`, `dimensionCode`, `valueCode`, `locale`, `meta`, `name`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `datasetCode`, `dimensionCode`, `valueCode`, `locale`, `meta`, `name`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `statsValuesI18n`;--> statement-breakpoint
DROP TABLE `statsValuesI18n`;--> statement-breakpoint
ALTER TABLE `__new_statsValuesI18n` RENAME TO `statsValuesI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_streetGeometry` (
	`streetId` text NOT NULL,
	`geometry` text,
	`bbox` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetGeometry_pk` PRIMARY KEY(`streetId`, `snapshotId`),
	CONSTRAINT "streetGeometry_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "geometry" is not null and "bbox" is not null))
);--> statement-breakpoint
INSERT INTO `__new_streetGeometry`(`streetId`, `geometry`, `bbox`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `streetId`, `geometry`, `bbox`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `streetGeometry`;--> statement-breakpoint
DROP TABLE `streetGeometry`;--> statement-breakpoint
ALTER TABLE `__new_streetGeometry` RENAME TO `streetGeometry`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_streetChangelog` (
	`streetId` text NOT NULL,
	`recordKey` text NOT NULL,
	`kind` text,
	`isPartialNameChange` integer,
	`gazetteDate` text,
	`effectiveDate` text,
	`sourceShardId` text,
	`noticeRef` text,
	`evidenceAssets` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetChangelog_pk` PRIMARY KEY(`streetId`, `recordKey`, `snapshotId`),
	CONSTRAINT "streetChangelog_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "kind" is not null and "isPartialNameChange" is not null))
);--> statement-breakpoint
INSERT INTO `__new_streetChangelog`(`streetId`, `recordKey`, `kind`, `isPartialNameChange`, `gazetteDate`, `effectiveDate`, `sourceShardId`, `noticeRef`, `evidenceAssets`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `streetId`, `recordKey`, `kind`, `isPartialNameChange`, `gazetteDate`, `effectiveDate`, `sourceShardId`, `noticeRef`, `evidenceAssets`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `streetChangelog`;--> statement-breakpoint
DROP TABLE `streetChangelog`;--> statement-breakpoint
ALTER TABLE `__new_streetChangelog` RENAME TO `streetChangelog`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_streetNameChangeStreets` (
	`nameChangeId` text NOT NULL,
	`streetId` text NOT NULL,
	`role` text NOT NULL,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetNameChangeStreets_pk` PRIMARY KEY(`nameChangeId`, `snapshotId`, `streetId`, `role`),
	CONSTRAINT "streetNameChangeStreets_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null))
);--> statement-breakpoint
INSERT INTO `__new_streetNameChangeStreets`(`nameChangeId`, `streetId`, `role`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `nameChangeId`, `streetId`, `role`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `streetNameChangeStreets`;--> statement-breakpoint
DROP TABLE `streetNameChangeStreets`;--> statement-breakpoint
ALTER TABLE `__new_streetNameChangeStreets` RENAME TO `streetNameChangeStreets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_streetNameChanges` (
	`id` text NOT NULL,
	`noticeRef` text,
	`intentionNotificationDate` text,
	`nameChangeDate` text,
	`isPartialNameChange` integer,
	`status` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetNameChanges_pk` PRIMARY KEY(`id`, `snapshotId`),
	CONSTRAINT "streetNameChanges_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "noticeRef" is not null and "isPartialNameChange" is not null and "status" is not null))
);--> statement-breakpoint
INSERT INTO `__new_streetNameChanges`(`id`, `noticeRef`, `intentionNotificationDate`, `nameChangeDate`, `isPartialNameChange`, `status`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `id`, `noticeRef`, `intentionNotificationDate`, `nameChangeDate`, `isPartialNameChange`, `status`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `streetNameChanges`;--> statement-breakpoint
DROP TABLE `streetNameChanges`;--> statement-breakpoint
ALTER TABLE `__new_streetNameChanges` RENAME TO `streetNameChanges`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_streets` (
	`id` text NOT NULL,
	`version` integer,
	`status` text,
	`deletedAt` text,
	`districtIds` text,
	`gazetteDate` text,
	`yearBuilt` text,
	`noticeRefs` text,
	`evidenceAssets` text,
	`sources` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streets_pk` PRIMARY KEY(`id`, `snapshotId`),
	CONSTRAINT "streets_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "version" is not null and "status" is not null)),
	CONSTRAINT "history_streets_version_positive" CHECK("version" > 0)
);--> statement-breakpoint
INSERT INTO `__new_streets`(`id`, `version`, `status`, `deletedAt`, `districtIds`, `gazetteDate`, `yearBuilt`, `noticeRefs`, `evidenceAssets`, `sources`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `id`, `version`, `status`, `deletedAt`, `districtIds`, `gazetteDate`, `yearBuilt`, `noticeRefs`, `evidenceAssets`, `sources`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `streets`;--> statement-breakpoint
DROP TABLE `streets`;--> statement-breakpoint
ALTER TABLE `__new_streets` RENAME TO `streets`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_streetsI18n` (
	`streetId` text NOT NULL,
	`locale` text NOT NULL,
	`meta` text DEFAULT '{"isLocaleInferred":false}',
	`name` text,
	`base` text,
	`designator` text,
	`directionalPrefix` text,
	`directionalSuffix` text,
	`normalised` text,
	`description` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetsI18n_pk` PRIMARY KEY(`streetId`, `snapshotId`, `locale`),
	CONSTRAINT "streetsI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "name" is not null and "meta" is not null))
);--> statement-breakpoint
INSERT INTO `__new_streetsI18n`(`streetId`, `locale`, `meta`, `name`, `base`, `designator`, `directionalPrefix`, `directionalSuffix`, `normalised`, `description`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `streetId`, `locale`, `meta`, `name`, `base`, `designator`, `directionalPrefix`, `directionalSuffix`, `normalised`, `description`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `streetsI18n`;--> statement-breakpoint
DROP TABLE `streetsI18n`;--> statement-breakpoint
ALTER TABLE `__new_streetsI18n` RENAME TO `streetsI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `address2d_sourceReleaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `address3d_sourceReleaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `divisionAreas_sourceReleaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `divisionBoundaries_sourceReleaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `divisions_sourceReleaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_sourceReleaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `statsRecords_source_release_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `streetGeometry_sourceReleaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `streets_sourceReleaseId_idx`;--> statement-breakpoint
CREATE INDEX `address2d_history_event_snapshot_idx` ON `address2d` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address2d_current_lookup_idx` ON `address2d` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address2d_snapshotId_idx` ON `address2d` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address2d_parentAddressId_idx` ON `address2d` (`parentAddressId`);--> statement-breakpoint
CREATE INDEX `address2dBuildingNumberLookup_history_event_snapshot_idx` ON `address2dBuildingNumberLookup` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address2dI18n_history_event_snapshot_idx` ON `address2dI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address2dI18n_current_lookup_idx` ON `address2dI18n` (`addressId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3d_history_event_snapshot_idx` ON `address3d` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address3d_current_lookup_idx` ON `address3d` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3d_snapshotId_idx` ON `address3d` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address3d_address2dId_idx` ON `address3d` (`address2dId`);--> statement-breakpoint
CREATE INDEX `address3dI18n_history_event_snapshot_idx` ON `address3dI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address3dI18n_current_lookup_idx` ON `address3dI18n` (`address3dId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionAreas_history_event_snapshot_idx` ON `divisionAreas` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionAreas_current_lookup_idx` ON `divisionAreas` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionAreas_divisionId_idx` ON `divisionAreas` (`divisionId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionAreas_snapshotId_idx` ON `divisionAreas` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_history_event_snapshot_idx` ON `divisionBoundaries` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_current_lookup_idx` ON `divisionBoundaries` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_leftDivisionId_idx` ON `divisionBoundaries` (`leftDivisionId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_rightDivisionId_idx` ON `divisionBoundaries` (`rightDivisionId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_snapshotId_idx` ON `divisionBoundaries` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisions_history_event_snapshot_idx` ON `divisions` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisions_current_lookup_idx` ON `divisions` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisions_divisionCode_idx` ON `divisions` (`snapshotId`,`divisionCode`);--> statement-breakpoint
CREATE INDEX `divisions_snapshotId_idx` ON `divisions` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_history_event_snapshot_idx` ON `divisionsI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_current_lookup_idx` ON `divisionsI18n` (`divisionId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `places_history_event_snapshot_idx` ON `places` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `places_current_lookup_idx` ON `places` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `places_snapshotId_idx` ON `places` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `placesI18n_history_event_snapshot_idx` ON `placesI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `placesI18n_current_lookup_idx` ON `placesI18n` (`placeId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `statsFields_history_event_snapshot_idx` ON `statsFields` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `statsFields_current_lookup_idx` ON `statsFields` (`datasetCode`,`fieldName`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `statsFieldsI18n_history_event_snapshot_idx` ON `statsFieldsI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `statsMeasures_history_event_snapshot_idx` ON `statsMeasures` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `statsMeasures_current_lookup_idx` ON `statsMeasures` (`datasetCode`,`measureCode`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `statsMeasuresI18n_history_event_snapshot_idx` ON `statsMeasuresI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `statsRecords_history_event_snapshot_idx` ON `statsRecords` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `statsRecords_current_lookup_idx` ON `statsRecords` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `statsValuesI18n_history_event_snapshot_idx` ON `statsValuesI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetGeometry_history_event_snapshot_idx` ON `streetGeometry` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetGeometry_current_lookup_idx` ON `streetGeometry` (`streetId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetGeometry_snapshotId_idx` ON `streetGeometry` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetChangelog_history_event_snapshot_idx` ON `streetChangelog` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetChangelog_street_current_idx` ON `streetChangelog` (`streetId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetChangelog_recordKey_idx` ON `streetChangelog` (`recordKey`);--> statement-breakpoint
CREATE INDEX `streetChangelog_snapshot_idx` ON `streetChangelog` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetNameChangeStreets_history_event_snapshot_idx` ON `streetNameChangeStreets` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetNameChangeStreets_streetId_idx` ON `streetNameChangeStreets` (`streetId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetNameChangeStreets_snapshotId_idx` ON `streetNameChangeStreets` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_history_event_snapshot_idx` ON `streetNameChanges` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_current_lookup_idx` ON `streetNameChanges` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_noticeRef_idx` ON `streetNameChanges` (`noticeRef`);--> statement-breakpoint
CREATE INDEX `streetNameChanges_snapshotId_idx` ON `streetNameChanges` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streets_history_event_snapshot_idx` ON `streets` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streets_id_version_idx` ON `streets` (`id`,`version`);--> statement-breakpoint
CREATE INDEX `streets_current_lookup_idx` ON `streets` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streets_snapshotId_idx` ON `streets` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetsI18n_history_event_snapshot_idx` ON `streetsI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetsI18n_current_lookup_idx` ON `streetsI18n` (`streetId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE VIEW `historyEvents` AS SELECT * FROM (SELECT snapshotId, 'division' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "divisions"
UNION ALL
SELECT snapshotId, 'divisionI18n' AS recordType, "divisionId" AS recordId, "locale" AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "divisionsI18n"
UNION ALL
SELECT snapshotId, 'divisionArea' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, createdAt, producerDatasetCode AS producerDatasetCode FROM "divisionAreas"
UNION ALL
SELECT snapshotId, 'divisionBoundary' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, createdAt, producerDatasetCode AS producerDatasetCode FROM "divisionBoundaries"
UNION ALL
SELECT snapshotId, 'address2d' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "address2d")
UNION ALL
SELECT * FROM (SELECT snapshotId, 'address2dI18n' AS recordType, "addressId" AS recordId, "locale" AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "address2dI18n"
UNION ALL
SELECT snapshotId, 'address2dBuildingNumberLookup' AS recordType, json_array("addressId", "buildingNumber") AS recordId, '' AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "address2dBuildingNumberLookup"
UNION ALL
SELECT snapshotId, 'address3d' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "address3d"
UNION ALL
SELECT snapshotId, 'address3dI18n' AS recordType, "address3dId" AS recordId, "locale" AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "address3dI18n"
UNION ALL
SELECT snapshotId, 'place' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "places")
UNION ALL
SELECT * FROM (SELECT snapshotId, 'placeI18n' AS recordType, "placeId" AS recordId, "locale" AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "placesI18n"
UNION ALL
SELECT snapshotId, 'street' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "streets"
UNION ALL
SELECT snapshotId, 'streetI18n' AS recordType, "streetId" AS recordId, "locale" AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "streetsI18n"
UNION ALL
SELECT snapshotId, 'streetGeometry' AS recordType, "streetId" AS recordId, '' AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "streetGeometry"
UNION ALL
SELECT snapshotId, 'streetNameChange' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "streetNameChanges")
UNION ALL
SELECT * FROM (SELECT snapshotId, 'streetNameChangeStreet' AS recordType, json_array("nameChangeId", "streetId", "role") AS recordId, '' AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "streetNameChangeStreets"
UNION ALL
SELECT snapshotId, 'streetChangelog' AS recordType, json_array("streetId", "recordKey") AS recordId, '' AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "streetChangelog"
UNION ALL
SELECT snapshotId, 'statsRecord' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, createdAt, datasetCode AS producerDatasetCode FROM "statsRecords"
UNION ALL
SELECT snapshotId, 'statsField' AS recordType, json_array("datasetCode", "fieldName") AS recordId, '' AS locale, versionHash, operation, createdAt, datasetCode AS producerDatasetCode FROM "statsFields"
UNION ALL
SELECT snapshotId, 'statsFieldI18n' AS recordType, json_array("datasetCode", "fieldName") AS recordId, "locale" AS locale, versionHash, operation, createdAt, datasetCode AS producerDatasetCode FROM "statsFieldsI18n")
UNION ALL
SELECT * FROM (SELECT snapshotId, 'statsMeasure' AS recordType, json_array("datasetCode", "measureCode") AS recordId, '' AS locale, versionHash, operation, createdAt, datasetCode AS producerDatasetCode FROM "statsMeasures"
UNION ALL
SELECT snapshotId, 'statsMeasureI18n' AS recordType, json_array("datasetCode", "measureCode") AS recordId, "locale" AS locale, versionHash, operation, createdAt, datasetCode AS producerDatasetCode FROM "statsMeasuresI18n"
UNION ALL
SELECT snapshotId, 'statsValueI18n' AS recordType, json_array("datasetCode", "dimensionCode", "valueCode") AS recordId, "locale" AS locale, versionHash, operation, createdAt, datasetCode AS producerDatasetCode FROM "statsValuesI18n");