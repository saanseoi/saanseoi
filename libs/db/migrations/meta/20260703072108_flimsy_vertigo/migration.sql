CREATE TABLE `publishedDataJournal` (
	`id` text PRIMARY KEY,
	`releaseId` text NOT NULL,
	`relatedReleaseId` text,
	`snapshotId` text,
	`apiReleaseSetId` text,
	`action` text NOT NULL,
	`statusFrom` text,
	`statusTo` text,
	`reason` text,
	`metadataJson` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_publishedDataJournal_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_publishedDataJournal_relatedReleaseId_releases_id_fk` FOREIGN KEY (`relatedReleaseId`) REFERENCES `releases`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_publishedDataJournal_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_publishedDataJournal_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `publishedDataJournal_releaseId_idx` ON `publishedDataJournal` (`releaseId`);--> statement-breakpoint
CREATE INDEX `publishedDataJournal_relatedReleaseId_idx` ON `publishedDataJournal` (`relatedReleaseId`);--> statement-breakpoint
CREATE INDEX `publishedDataJournal_action_idx` ON `publishedDataJournal` (`action`);