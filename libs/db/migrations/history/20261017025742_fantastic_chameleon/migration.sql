DROP VIEW IF EXISTS "historyEvents";--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisionAreas` (
	`id` text NOT NULL,
	`variant` text,
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
INSERT INTO `__new_divisionAreas`(`id`, `variant`, `bbox`, `geometry`, `sources`, `type`, `isLand`, `isTerritorial`, `divisionId`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`, `producerDatasetCode`) SELECT `id`, `variant`, `bbox`, `geometry`, `sources`, `type`, `isLand`, `isTerritorial`, `divisionId`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`, `producerDatasetCode` FROM `divisionAreas`;--> statement-breakpoint
DROP TABLE `divisionAreas`;--> statement-breakpoint
ALTER TABLE `__new_divisionAreas` RENAME TO `divisionAreas`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_divisionBoundaries` (
	`id` text NOT NULL,
	`variant` text,
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
INSERT INTO `__new_divisionBoundaries`(`id`, `variant`, `bbox`, `geometry`, `sources`, `type`, `isLand`, `isTerritorial`, `leftDivisionId`, `rightDivisionId`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`, `producerDatasetCode`) SELECT `id`, `variant`, `bbox`, `geometry`, `sources`, `type`, `isLand`, `isTerritorial`, `leftDivisionId`, `rightDivisionId`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`, `producerDatasetCode` FROM `divisionBoundaries`;--> statement-breakpoint
DROP TABLE `divisionBoundaries`;--> statement-breakpoint
ALTER TABLE `__new_divisionBoundaries` RENAME TO `divisionBoundaries`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `divisionAreas_history_event_snapshot_idx` ON `divisionAreas` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionAreas_current_lookup_idx` ON `divisionAreas` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionAreas_divisionId_idx` ON `divisionAreas` (`divisionId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionAreas_snapshotId_idx` ON `divisionAreas` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_history_event_snapshot_idx` ON `divisionBoundaries` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_current_lookup_idx` ON `divisionBoundaries` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_leftDivisionId_idx` ON `divisionBoundaries` (`leftDivisionId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_rightDivisionId_idx` ON `divisionBoundaries` (`rightDivisionId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_snapshotId_idx` ON `divisionBoundaries` (`snapshotId`);--> statement-breakpoint
CREATE VIEW "historyEvents" AS SELECT * FROM (SELECT snapshotId, 'division' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, createdAt, NULL AS producerDatasetCode FROM "divisions"
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