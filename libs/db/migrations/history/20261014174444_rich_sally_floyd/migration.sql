DROP VIEW IF EXISTS "historyEvents";--> statement-breakpoint
ALTER TABLE `address2dI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}';--> statement-breakpoint
ALTER TABLE `address3dI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}';--> statement-breakpoint
ALTER TABLE `divisionsI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}';--> statement-breakpoint
ALTER TABLE `placesI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}';--> statement-breakpoint
ALTER TABLE `statsFieldsI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}';--> statement-breakpoint
ALTER TABLE `statsMeasuresI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}';--> statement-breakpoint
ALTER TABLE `statsValuesI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}';--> statement-breakpoint
ALTER TABLE `streetsI18n` ADD `meta` text DEFAULT '{"isLocaleInferred":false}';--> statement-breakpoint
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
	`sourceReleaseId` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dI18n_pk` PRIMARY KEY(`addressId`, `snapshotId`, `locale`),
	CONSTRAINT "address2dI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "sourceReleaseId" is not null and "formattedAddress" is not null and "meta" is not null))
);--> statement-breakpoint
INSERT INTO `__new_address2dI18n`(`addressId`, `locale`, `formattedAddress`, `buildingName`, `buildingNumberExpression`, `buildingNumberFrom`, `buildingNumberTo`, `buildingNumberConnector`, `blockExpression`, `blockType`, `blockRef`, `blockTypeBeforeNumber`, `phaseExpression`, `phaseName`, `phaseRef`, `estateName`, `streetName`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt`) SELECT `addressId`, `locale`, `formattedAddress`, `buildingName`, `buildingNumberExpression`, `buildingNumberFrom`, `buildingNumberTo`, `buildingNumberConnector`, `blockExpression`, `blockType`, `blockRef`, `blockTypeBeforeNumber`, `phaseExpression`, `phaseName`, `phaseRef`, `estateName`, `streetName`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt` FROM `address2dI18n`;--> statement-breakpoint
DROP TABLE `address2dI18n`;--> statement-breakpoint
ALTER TABLE `__new_address2dI18n` RENAME TO `address2dI18n`;--> statement-breakpoint
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
	`sourceReleaseId` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address3dI18n_pk` PRIMARY KEY(`address3dId`, `snapshotId`, `locale`),
	CONSTRAINT "address3dI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "sourceReleaseId" is not null and "units" is not null and "meta" is not null))
);--> statement-breakpoint
INSERT INTO `__new_address3dI18n`(`address3dId`, `locale`, `units`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt`) SELECT `address3dId`, `locale`, `units`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt` FROM `address3dI18n`;--> statement-breakpoint
DROP TABLE `address3dI18n`;--> statement-breakpoint
ALTER TABLE `__new_address3dI18n` RENAME TO `address3dI18n`;--> statement-breakpoint
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
	`sourceReleaseId` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionsI18n_pk` PRIMARY KEY(`divisionId`, `snapshotId`, `locale`),
	CONSTRAINT "divisionsI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "sourceReleaseId" is not null and "meta" is not null))
);--> statement-breakpoint
INSERT INTO `__new_divisionsI18n`(`divisionId`, `locale`, `name`, `nameVariant`, `nameAlts`, `nameRules`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt`) SELECT `divisionId`, `locale`, `name`, `nameVariant`, `nameAlts`, `nameRules`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt` FROM `divisionsI18n`;--> statement-breakpoint
DROP TABLE `divisionsI18n`;--> statement-breakpoint
ALTER TABLE `__new_divisionsI18n` RENAME TO `divisionsI18n`;--> statement-breakpoint
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
	`sourceReleaseId` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsFieldsI18n_pk` PRIMARY KEY(`datasetCode`, `fieldName`, `locale`, `snapshotId`),
	CONSTRAINT "statsFieldsI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "sourceReleaseId" is not null and "name" is not null and "meta" is not null))
);--> statement-breakpoint
INSERT INTO `__new_statsFieldsI18n`(`datasetCode`, `fieldName`, `locale`, `name`, `description`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt`) SELECT `datasetCode`, `fieldName`, `locale`, `name`, `description`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt` FROM `statsFieldsI18n`;--> statement-breakpoint
DROP TABLE `statsFieldsI18n`;--> statement-breakpoint
ALTER TABLE `__new_statsFieldsI18n` RENAME TO `statsFieldsI18n`;--> statement-breakpoint
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
	`sourceReleaseId` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasuresI18n_pk` PRIMARY KEY(`datasetCode`, `measureCode`, `locale`, `snapshotId`),
	CONSTRAINT "statsMeasuresI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "sourceReleaseId" is not null and "name" is not null and "meta" is not null))
);--> statement-breakpoint
INSERT INTO `__new_statsMeasuresI18n`(`datasetCode`, `measureCode`, `locale`, `name`, `description`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt`) SELECT `datasetCode`, `measureCode`, `locale`, `name`, `description`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt` FROM `statsMeasuresI18n`;--> statement-breakpoint
DROP TABLE `statsMeasuresI18n`;--> statement-breakpoint
ALTER TABLE `__new_statsMeasuresI18n` RENAME TO `statsMeasuresI18n`;--> statement-breakpoint
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
	`sourceReleaseId` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsValuesI18n_pk` PRIMARY KEY(`datasetCode`, `dimensionCode`, `valueCode`, `locale`, `snapshotId`),
	CONSTRAINT "statsValuesI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "sourceReleaseId" is not null and "name" is not null and "meta" is not null))
);--> statement-breakpoint
INSERT INTO `__new_statsValuesI18n`(`datasetCode`, `dimensionCode`, `valueCode`, `locale`, `name`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt`) SELECT `datasetCode`, `dimensionCode`, `valueCode`, `locale`, `name`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt` FROM `statsValuesI18n`;--> statement-breakpoint
DROP TABLE `statsValuesI18n`;--> statement-breakpoint
ALTER TABLE `__new_statsValuesI18n` RENAME TO `statsValuesI18n`;--> statement-breakpoint
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
	`sourceReleaseId` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetsI18n_pk` PRIMARY KEY(`streetId`, `snapshotId`, `locale`),
	CONSTRAINT "streetsI18n_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "sourceReleaseId" is not null and "name" is not null and "meta" is not null))
);--> statement-breakpoint
INSERT INTO `__new_streetsI18n`(`streetId`, `locale`, `name`, `base`, `designator`, `directionalPrefix`, `directionalSuffix`, `normalised`, `description`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt`) SELECT `streetId`, `locale`, `name`, `base`, `designator`, `directionalPrefix`, `directionalSuffix`, `normalised`, `description`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt` FROM `streetsI18n`;--> statement-breakpoint
DROP TABLE `streetsI18n`;--> statement-breakpoint
ALTER TABLE `__new_streetsI18n` RENAME TO `streetsI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `address2dI18n_history_event_snapshot_idx` ON `address2dI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address2dI18n_current_lookup_idx` ON `address2dI18n` (`addressId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `address3dI18n_history_event_snapshot_idx` ON `address3dI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `address3dI18n_current_lookup_idx` ON `address3dI18n` (`address3dId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_history_event_snapshot_idx` ON `divisionsI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionsI18n_current_lookup_idx` ON `divisionsI18n` (`divisionId`,`locale`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `statsFieldsI18n_history_event_snapshot_idx` ON `statsFieldsI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `statsMeasuresI18n_history_event_snapshot_idx` ON `statsMeasuresI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `statsValuesI18n_history_event_snapshot_idx` ON `statsValuesI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetsI18n_history_event_snapshot_idx` ON `streetsI18n` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `streetsI18n_current_lookup_idx` ON `streetsI18n` (`streetId`,`locale`,`isCurrent`);--> statement-breakpoint
ALTER TABLE `placesI18n` DROP COLUMN `provenance`;--> statement-breakpoint
CREATE VIEW "historyEvents" AS SELECT * FROM (SELECT snapshotId, 'division' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "divisions"
UNION ALL
SELECT snapshotId, 'divisionI18n' AS recordType, "divisionId" AS recordId, "locale" AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "divisionsI18n"
UNION ALL
SELECT snapshotId, 'divisionArea' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "divisionAreas"
UNION ALL
SELECT snapshotId, 'divisionBoundary' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "divisionBoundaries"
UNION ALL
SELECT snapshotId, 'address2d' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "address2d")
UNION ALL
SELECT * FROM (SELECT snapshotId, 'address2dI18n' AS recordType, "addressId" AS recordId, "locale" AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "address2dI18n"
UNION ALL
SELECT snapshotId, 'address2dBuildingNumberLookup' AS recordType, json_array("addressId", "buildingNumber") AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "address2dBuildingNumberLookup"
UNION ALL
SELECT snapshotId, 'address3d' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "address3d"
UNION ALL
SELECT snapshotId, 'address3dI18n' AS recordType, "address3dId" AS recordId, "locale" AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "address3dI18n"
UNION ALL
SELECT snapshotId, 'place' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "places")
UNION ALL
SELECT * FROM (SELECT snapshotId, 'placeI18n' AS recordType, "placeId" AS recordId, "locale" AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "placesI18n"
UNION ALL
SELECT snapshotId, 'street' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "streets"
UNION ALL
SELECT snapshotId, 'streetI18n' AS recordType, "streetId" AS recordId, "locale" AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "streetsI18n"
UNION ALL
SELECT snapshotId, 'streetGeometry' AS recordType, "streetId" AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "streetGeometry"
UNION ALL
SELECT snapshotId, 'streetNameChange' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "streetNameChanges")
UNION ALL
SELECT * FROM (SELECT snapshotId, 'streetNameChangeStreet' AS recordType, json_array("nameChangeId", "streetId", "role") AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "streetNameChangeStreets"
UNION ALL
SELECT snapshotId, 'streetChangelog' AS recordType, json_array("streetId", "recordKey") AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "streetChangelog"
UNION ALL
SELECT snapshotId, 'statsRecord' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "statsRecords"
UNION ALL
SELECT snapshotId, 'statsField' AS recordType, json_array("datasetCode", "fieldName") AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "statsFields"
UNION ALL
SELECT snapshotId, 'statsFieldI18n' AS recordType, json_array("datasetCode", "fieldName") AS recordId, "locale" AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "statsFieldsI18n")
UNION ALL
SELECT * FROM (SELECT snapshotId, 'statsMeasure' AS recordType, json_array("datasetCode", "measureCode") AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "statsMeasures"
UNION ALL
SELECT snapshotId, 'statsMeasureI18n' AS recordType, json_array("datasetCode", "measureCode") AS recordId, "locale" AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "statsMeasuresI18n"
UNION ALL
SELECT snapshotId, 'statsValueI18n' AS recordType, json_array("datasetCode", "dimensionCode", "valueCode") AS recordId, "locale" AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "statsValuesI18n");