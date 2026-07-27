PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovLandsdRoadCentrelines` (
	`sourceRecordId` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`streetId` text,
	`objectId` integer NOT NULL,
	`streetCode` text NOT NULL,
	`streetType` text,
	`sourceGeometry` text NOT NULL,
	`geometry` text NOT NULL,
	`bbox` text NOT NULL,
	CONSTRAINT `hkgovLandsdRoadCentrelines_pk` PRIMARY KEY(`sourceRecordId`, `releaseId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovLandsdRoadCentrelines`(`sourceRecordId`, `versionHash`, `releaseId`, `createdAt`, `updatedAt`, `streetId`, `objectId`, `streetCode`, `streetType`, `sourceGeometry`, `geometry`, `bbox`) SELECT `sourceRecordId`, `versionHash`, `releaseId`, `createdAt`, `updatedAt`, `streetId`, `objectId`, `streetCode`, `streetType`, `sourceGeometry`, `geometry`, `bbox` FROM `hkgovLandsdRoadCentrelines`;--> statement-breakpoint
DROP TABLE `hkgovLandsdRoadCentrelines`;--> statement-breakpoint
ALTER TABLE `__new_hkgovLandsdRoadCentrelines` RENAME TO `hkgovLandsdRoadCentrelines`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_releaseId_idx` ON `hkgovLandsdRoadCentrelines` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_sourceRecordId_idx` ON `hkgovLandsdRoadCentrelines` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_street_idx` ON `hkgovLandsdRoadCentrelines` (`streetId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_objectId_idx` ON `hkgovLandsdRoadCentrelines` (`objectId`);