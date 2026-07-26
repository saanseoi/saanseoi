CREATE TABLE `streetChangelog` (
	`streetId` text NOT NULL,
	`sourceEventId` text NOT NULL,
	`kind` text NOT NULL,
	`isPartialNameChange` integer NOT NULL,
	`publicationDate` text,
	`effectiveDate` text,
	`sourceShardId` text,
	`sourceRecordId` text NOT NULL,
	`names` text,
	`assetLinks` text,
	`references` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `streetChangelog_pk` PRIMARY KEY(`streetId`, `sourceEventId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `streetChangelog_street_current_idx` ON `streetChangelog` (`streetId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `streetChangelog_event_idx` ON `streetChangelog` (`sourceEventId`);--> statement-breakpoint
CREATE INDEX `streetChangelog_snapshot_idx` ON `streetChangelog` (`snapshotId`);