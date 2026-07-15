CREATE TABLE `overtureDivisionAreas` (
	`sourceRecordId` text NOT NULL,
	`subtype` text,
	`class` text,
	`is_land` integer,
	`is_territorial` integer,
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
	`division_id` text,
	CONSTRAINT `overtureDivisionAreas_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `overtureDivisionBoundaries` (
	`sourceRecordId` text NOT NULL,
	`subtype` text,
	`class` text,
	`is_land` integer,
	`is_territorial` integer,
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
	`division_ids` text,
	CONSTRAINT `overtureDivisionBoundaries_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_releaseId_idx` ON `overtureDivisionAreas` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_sourceRecordId_idx` ON `overtureDivisionAreas` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_current_lookup_idx` ON `overtureDivisionAreas` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_release_validity_idx` ON `overtureDivisionAreas` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_divisionId_idx` ON `overtureDivisionAreas` (`division_id`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_subtype_idx` ON `overtureDivisionAreas` (`subtype`);--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_class_idx` ON `overtureDivisionAreas` (`class`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_releaseId_idx` ON `overtureDivisionBoundaries` (`releaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_sourceRecordId_idx` ON `overtureDivisionBoundaries` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_current_lookup_idx` ON `overtureDivisionBoundaries` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_release_validity_idx` ON `overtureDivisionBoundaries` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_subtype_idx` ON `overtureDivisionBoundaries` (`subtype`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_class_idx` ON `overtureDivisionBoundaries` (`class`);