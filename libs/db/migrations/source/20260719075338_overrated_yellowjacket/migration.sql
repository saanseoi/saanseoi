CREATE TABLE `hkgovCenstatdDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`districtClass` text NOT NULL,
	`districtCode` integer NOT NULL,
	`districtNameEn` text NOT NULL,
	`districtNameZhHant` text NOT NULL,
	`censusYear` text NOT NULL,
	`sourceCrs` text NOT NULL,
	`sourceGeometry` text NOT NULL,
	`derivation` text,
	`geometry` text,
	`bbox` text,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovCenstatdDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_releaseId_idx` ON `hkgovCenstatdDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_sourceRecordId_idx` ON `hkgovCenstatdDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_current_lookup_idx` ON `hkgovCenstatdDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_release_validity_idx` ON `hkgovCenstatdDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_districtClass_idx` ON `hkgovCenstatdDivisionAreas` (`districtClass`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_districtCode_idx` ON `hkgovCenstatdDivisionAreas` (`districtCode`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_censusYear_idx` ON `hkgovCenstatdDivisionAreas` (`censusYear`);