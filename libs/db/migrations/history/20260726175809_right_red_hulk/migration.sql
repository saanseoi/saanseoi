CREATE TABLE `streetGeometry` (
	`streetId` text NOT NULL,
	`geometry` text NOT NULL,
	`bbox` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetGeometry_pk` PRIMARY KEY(`streetId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `streetGeometry_current_lookup_idx` ON `streetGeometry` (`streetId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetGeometry_sourceReleaseId_idx` ON `streetGeometry` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `streetGeometry_snapshotId_idx` ON `streetGeometry` (`snapshotId`);