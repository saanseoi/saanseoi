CREATE TABLE `address2dEvidence` (
	`addressId` text NOT NULL,
	`sources` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `address2dEvidence_pk` PRIMARY KEY(`addressId`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `address2dEvidence_current_lookup_idx` ON `address2dEvidence` (`addressId`,`isCurrent`);