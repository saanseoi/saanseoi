CREATE TABLE `streetChangelog` (
	`snapshotId` text NOT NULL,
	`sourceEventId` text NOT NULL,
	`streetId` text NOT NULL,
	`kind` text NOT NULL,
	`isPartialNameChange` integer NOT NULL,
	`publicationDate` text,
	`effectiveDate` text,
	`sourceShardId` text,
	`sourceReleaseId` text,
	`sourceRecordId` text NOT NULL,
	`names` text,
	`assetLinks` text,
	`references` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetChangelog_pk` PRIMARY KEY(`snapshotId`, `sourceEventId`, `streetId`)
);
--> statement-breakpoint
CREATE INDEX `streetChangelog_street_idx` ON `streetChangelog` (`snapshotId`,`streetId`);--> statement-breakpoint
CREATE INDEX `streetChangelog_event_idx` ON `streetChangelog` (`sourceEventId`);