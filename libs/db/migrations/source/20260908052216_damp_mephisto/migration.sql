-- Run `bun libs/db/scripts/prepare-source-versioning-migration.ts` against the
-- exact source and metadata databases before applying this migration. It creates
-- __sourceVersioningMap, validates release chronology, and preserves reappearances
-- as distinct source lifecycles.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovAlsAddresses3d` (
	`sourceRecordId` text NOT NULL, `sources` text, `rawProperties` text NOT NULL,
	`versionHash` text NOT NULL, `releaseId` text NOT NULL, `validFromRelease` text NOT NULL,
	`validToRelease` text, `isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovAlsAddresses3d_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovAlsAddresses3d` (`sourceRecordId`,`sources`,`rawProperties`,`versionHash`,`releaseId`,`validFromRelease`,`validToRelease`,`isCurrent`,`createdAt`,`updatedAt`)
SELECT m.sourceRecordId,s.sources,s.rawProperties,m.versionHash,m.oldReleaseId,m.validFromRelease,m.validToRelease,m.isCurrent,m.createdAt,m.updatedAt
FROM __sourceVersioningMap m JOIN hkgovAlsAddresses3d s ON s.sourceRecordId=m.sourceRecordId AND s.versionHash=m.oldVersionHash AND s.releaseId=m.oldReleaseId
WHERE m.tableName='hkgovAlsAddresses3d' AND m.representative=1;
--> statement-breakpoint
DROP TABLE `hkgovAlsAddresses3d`;--> statement-breakpoint
ALTER TABLE `__new_hkgovAlsAddresses3d` RENAME TO `hkgovAlsAddresses3d`;--> statement-breakpoint
CREATE TABLE `__new_hkgovLandsdRoadCentrelines` (
	`sourceRecordId` text NOT NULL, `sources` text, `rawProperties` text NOT NULL,
	`versionHash` text NOT NULL, `releaseId` text NOT NULL, `validFromRelease` text NOT NULL,
	`validToRelease` text, `isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	CONSTRAINT `hkgovLandsdRoadCentrelines_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovLandsdRoadCentrelines` (`sourceRecordId`,`sources`,`rawProperties`,`versionHash`,`releaseId`,`validFromRelease`,`validToRelease`,`isCurrent`,`createdAt`,`updatedAt`,`sourceGeometry`)
SELECT m.sourceRecordId,s.sources,s.rawProperties,m.versionHash,m.oldReleaseId,m.validFromRelease,m.validToRelease,m.isCurrent,m.createdAt,m.updatedAt,s.sourceGeometry
FROM __sourceVersioningMap m JOIN hkgovLandsdRoadCentrelines s ON s.sourceRecordId=m.sourceRecordId AND s.versionHash=m.oldVersionHash AND s.releaseId=m.oldReleaseId
WHERE m.tableName='hkgovLandsdRoadCentrelines' AND m.representative=1;
--> statement-breakpoint
DROP TABLE `hkgovLandsdRoadCentrelines`;--> statement-breakpoint
ALTER TABLE `__new_hkgovLandsdRoadCentrelines` RENAME TO `hkgovLandsdRoadCentrelines`;--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses3d_releaseId_idx` ON `hkgovAlsAddresses3d` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses3d_sourceRecordId_idx` ON `hkgovAlsAddresses3d` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses3d_current_lookup_idx` ON `hkgovAlsAddresses3d` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses3d_release_validity_idx` ON `hkgovAlsAddresses3d` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_releaseId_idx` ON `hkgovLandsdRoadCentrelines` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_sourceRecordId_idx` ON `hkgovLandsdRoadCentrelines` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_current_lookup_idx` ON `hkgovLandsdRoadCentrelines` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_release_validity_idx` ON `hkgovLandsdRoadCentrelines` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
DROP TABLE __sourceVersioningMap;--> statement-breakpoint
PRAGMA foreign_keys=ON;
