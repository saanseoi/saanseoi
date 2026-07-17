CREATE TABLE `snapshotVersionChanges` (
	`snapshotId` text NOT NULL,
	`recordType` text NOT NULL,
	`recordId` text NOT NULL,
	`locale` text DEFAULT '' NOT NULL,
	`versionHash` text,
	`operation` text NOT NULL,
	`sourceReleaseId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `snapshotVersionChanges_pk` PRIMARY KEY(`snapshotId`, `recordType`, `recordId`, `locale`)
);
--> statement-breakpoint
CREATE INDEX `snapshotVersionChanges_record_lookup_idx` ON `snapshotVersionChanges` (`recordType`,`recordId`,`locale`,`snapshotId`);--> statement-breakpoint
CREATE INDEX `snapshotVersionChanges_snapshot_idx` ON `snapshotVersionChanges` (`snapshotId`);
