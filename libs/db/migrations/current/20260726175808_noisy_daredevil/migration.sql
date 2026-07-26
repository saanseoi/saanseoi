CREATE TABLE `streetGeometry` (
	`snapshotId` text NOT NULL,
	`streetId` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`geometry` text NOT NULL,
	`bbox` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetGeometry_pk` PRIMARY KEY(`snapshotId`, `streetId`)
);
--> statement-breakpoint
CREATE INDEX `streetGeometry_streetId_idx` ON `streetGeometry` (`streetId`);--> statement-breakpoint
CREATE INDEX `streetGeometry_sourceReleaseId_idx` ON `streetGeometry` (`sourceReleaseId`);