DROP VIEW `historyEvents`;--> statement-breakpoint
ALTER TABLE `address2d` DROP COLUMN `bbox`;--> statement-breakpoint
ALTER TABLE `address2d` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `address2dBuildingNumberLookup` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `address2dI18n` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `address3d` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `address3dI18n` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `divisionAreas` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `divisionBoundaries` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `divisionStatistics` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `divisions` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `divisionsI18n` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `places` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `placesI18n` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `statsFields` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `statsFieldsI18n` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `statsMeasures` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `statsMeasuresI18n` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `statsRecords` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `statsValuesI18n` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `streetGeometry` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `streetChangelog` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `streetNameChangeStreets` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `streetNameChanges` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `streets` DROP COLUMN `updatedAt`;--> statement-breakpoint
ALTER TABLE `streetsI18n` DROP COLUMN `updatedAt`;--> statement-breakpoint
CREATE VIEW `historyEvents` AS SELECT * FROM (SELECT snapshotId, 'division' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "divisions"
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
SELECT snapshotId, 'divisionStatistic' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "divisionStatistics"
UNION ALL
SELECT snapshotId, 'statsRecord' AS recordType, "id" AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "statsRecords"
UNION ALL
SELECT snapshotId, 'statsField' AS recordType, json_array("datasetCode", "fieldName") AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "statsFields")
UNION ALL
SELECT * FROM (SELECT snapshotId, 'statsFieldI18n' AS recordType, json_array("datasetCode", "fieldName") AS recordId, "locale" AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "statsFieldsI18n"
UNION ALL
SELECT snapshotId, 'statsMeasure' AS recordType, json_array("datasetCode", "measureCode") AS recordId, '' AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "statsMeasures"
UNION ALL
SELECT snapshotId, 'statsMeasureI18n' AS recordType, json_array("datasetCode", "measureCode") AS recordId, "locale" AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "statsMeasuresI18n"
UNION ALL
SELECT snapshotId, 'statsValueI18n' AS recordType, json_array("datasetCode", "dimensionCode", "valueCode") AS recordId, "locale" AS locale, versionHash, operation, sourceReleaseId, createdAt FROM "statsValuesI18n");