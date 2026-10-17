DROP VIEW IF EXISTS "historyEvents";--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_statsRecords` (
	`id` text NOT NULL,
	`datasetCode` text,
	`divisionId` text,
	`referencePeriodCode` text,
	`referencePeriodStart` text,
	`referencePeriodEnd` text,
	`referencePeriodGranularity` text,
	`referencePeriodEndYear` text,
	`geography` text,
	`fieldSources` text DEFAULT '[]',
	`definitionSetId` text,
	`values` text,
	`snapshotId` text NOT NULL,
	`operation` text DEFAULT 'upsert' NOT NULL,
	`versionHash` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsRecords_pk` PRIMARY KEY(`id`, `snapshotId`),
	CONSTRAINT "statsRecords_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "datasetCode" is not null and "referencePeriodCode" is not null and "referencePeriodGranularity" is not null and "referencePeriodEndYear" is not null and "geography" is not null and "fieldSources" is not null and "definitionSetId" is not null and "values" is not null))
);--> statement-breakpoint
INSERT INTO `__new_statsRecords`(`id`, `datasetCode`, `divisionId`, `referencePeriodCode`, `referencePeriodStart`, `referencePeriodEnd`, `referencePeriodGranularity`, `referencePeriodEndYear`, `geography`, `fieldSources`, `definitionSetId`, `values`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt`) SELECT `id`, `datasetCode`, `divisionId`, `referencePeriodCode`, `referencePeriodStart`, `referencePeriodEnd`, `referencePeriodGranularity`, `referencePeriodEndYear`, `geography`, `fieldSources`, `definitionSetId`, `values`, `snapshotId`, `operation`, `versionHash`, `isCurrent`, `createdAt` FROM `statsRecords`;--> statement-breakpoint
DROP TABLE `statsRecords`;--> statement-breakpoint
ALTER TABLE `__new_statsRecords` RENAME TO `statsRecords`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `statsRecords_history_event_snapshot_idx` ON `statsRecords` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `statsRecords_current_lookup_idx` ON `statsRecords` (`id`,`isCurrent`);--> statement-breakpoint
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