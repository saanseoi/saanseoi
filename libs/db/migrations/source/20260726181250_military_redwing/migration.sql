CREATE TABLE `hkgovLandsdRoadCentrelineI18n` (
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovLandsdRoadCentrelineI18n_pk` PRIMARY KEY(`sourceRecordId`, `releaseId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `hkgovLandsdRoadCentrelines` (
	`sourceRecordId` text NOT NULL,
	`streetId` text NOT NULL,
	`objectId` integer NOT NULL,
	`streetCode` text NOT NULL,
	`streetType` text,
	`sourceGeometry` text NOT NULL,
	`geometry` text NOT NULL,
	`bbox` text NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovLandsdRoadCentrelines_pk` PRIMARY KEY(`sourceRecordId`, `releaseId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelineI18n_releaseId_idx` ON `hkgovLandsdRoadCentrelineI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelineI18n_sourceRecordId_idx` ON `hkgovLandsdRoadCentrelineI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelineI18n_locale_name_idx` ON `hkgovLandsdRoadCentrelineI18n` (`locale`,`name`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_releaseId_idx` ON `hkgovLandsdRoadCentrelines` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_sourceRecordId_idx` ON `hkgovLandsdRoadCentrelines` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_street_idx` ON `hkgovLandsdRoadCentrelines` (`streetId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_objectId_idx` ON `hkgovLandsdRoadCentrelines` (`objectId`);