DROP VIEW IF EXISTS "historyEvents";--> statement-breakpoint
ALTER TABLE `places` ADD `geometry` text;--> statement-breakpoint
ALTER TABLE `places` ADD `identifiers` text;--> statement-breakpoint
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
	`sourceReleaseId` text,
	`isCurrent` integer DEFAULT true NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `places_pk` PRIMARY KEY(`id`, `snapshotId`),
	CONSTRAINT "places_history_event_check" CHECK(("operation" = 'delete' and "versionHash" is null) or ("operation" = 'upsert' and "versionHash" is not null and "sourceReleaseId" is not null and "resourceReleaseId" is not null and "geometry" is not null and "firstSeenMonth" is not null and "lastSeenMonth" is not null))
);--> statement-breakpoint
INSERT INTO `__new_places`(`id`, `resourceReleaseId`, `addressDependencyHash`, `addressSnapshotId`, `address2dId`, `address3dId`, `address3dUnitId`, `address3dMembership`, `bbox`, `operatingStatus`, `basicCategory`, `taxonomyPrimary`, `taxonomyHierarchy`, `taxonomyAlternates`, `websites`, `socials`, `emails`, `phones`, `addresses`, `confidence`, `sources`, `firstSeenMonth`, `lastSeenMonth`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt`) SELECT `id`, `resourceReleaseId`, `addressDependencyHash`, `addressSnapshotId`, `address2dId`, `address3dId`, `address3dUnitId`, `address3dMembership`, `bbox`, `operatingStatus`, `basicCategory`, `taxonomyPrimary`, `taxonomyHierarchy`, `taxonomyAlternates`, `websites`, `socials`, `emails`, `phones`, `addresses`, `confidence`, `sources`, `firstSeenMonth`, `lastSeenMonth`, `snapshotId`, `operation`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt` FROM `places`;--> statement-breakpoint
DROP TABLE `places`;--> statement-breakpoint
ALTER TABLE `__new_places` RENAME TO `places`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `places_history_event_snapshot_idx` ON `places` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `places_current_lookup_idx` ON `places` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `places_sourceReleaseId_idx` ON `places` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `places_snapshotId_idx` ON `places` (`snapshotId`);--> statement-breakpoint
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