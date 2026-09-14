CREATE TABLE `protomapsIslandFeatures` (
	`sourceRecordId` text NOT NULL,
	`sourceLocator` text,
	`properties` text,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceGeometry` text NOT NULL,
	CONSTRAINT `protomapsIslandFeatures_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `protomapsIslandFeatures_releaseId_idx` ON `protomapsIslandFeatures` (`releaseId`);--> statement-breakpoint
CREATE INDEX `protomapsIslandFeatures_sourceRecordId_idx` ON `protomapsIslandFeatures` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `protomapsIslandFeatures_current_lookup_idx` ON `protomapsIslandFeatures` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `protomapsIslandFeatures_release_validity_idx` ON `protomapsIslandFeatures` (`validFromRelease`,`validToRelease`);