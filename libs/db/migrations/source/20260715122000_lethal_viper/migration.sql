CREATE TABLE `hkgovHadDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`areaId` text,
	`areaCode` text,
	`divisionId` text,
	`geometry` text,
	`bbox` text,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`sourceCrs` text,
	`sourceGeometry` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovHadDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_releaseId_idx` ON `hkgovHadDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_sourceRecordId_idx` ON `hkgovHadDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_current_lookup_idx` ON `hkgovHadDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_release_validity_idx` ON `hkgovHadDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_areaId_idx` ON `hkgovHadDivisionAreas` (`areaId`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_areaCode_idx` ON `hkgovHadDivisionAreas` (`areaCode`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_divisionId_idx` ON `hkgovHadDivisionAreas` (`divisionId`);