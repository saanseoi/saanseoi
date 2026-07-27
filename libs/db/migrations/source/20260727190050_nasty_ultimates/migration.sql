CREATE TABLE `hkgovLandsdPlaceNames` (
	`sourceRecordId` text NOT NULL,
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
	`sourceGeometry` text NOT NULL,
	`geoNameId` text NOT NULL,
	`placeClass` text NOT NULL,
	`placeType` text NOT NULL,
	`district` text,
	CONSTRAINT `hkgovLandsdPlaceNames_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_releaseId_idx` ON `hkgovLandsdPlaceNames` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_sourceRecordId_idx` ON `hkgovLandsdPlaceNames` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_current_lookup_idx` ON `hkgovLandsdPlaceNames` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_release_validity_idx` ON `hkgovLandsdPlaceNames` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_geoNameId_idx` ON `hkgovLandsdPlaceNames` (`geoNameId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_placeClass_idx` ON `hkgovLandsdPlaceNames` (`placeClass`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_district_idx` ON `hkgovLandsdPlaceNames` (`district`);