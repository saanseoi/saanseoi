ALTER TABLE `snapshotSources` RENAME COLUMN `sourceReleaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `sourceReleases` ADD `expectedResourceTypes` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_snapshotSources` (
	`snapshotId` text NOT NULL,
	`datasetId` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`role` text NOT NULL,
	`selectedByRule` text,
	`selectionMode` text,
	`anchorReleaseId` text,
	`sourceCohortKey` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `snapshotSources_pk` PRIMARY KEY(`snapshotId`, `resourceReleaseId`),
	CONSTRAINT `fk_snapshotSources_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotSources_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `snapshotSources_resourceReleaseId_datasetId_releases_id_datasetId_fk` FOREIGN KEY (`resourceReleaseId`,`datasetId`) REFERENCES `releases`(`id`,`datasetId`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_snapshotSources`(`snapshotId`, `datasetId`, `resourceReleaseId`, `role`, `selectedByRule`, `selectionMode`, `anchorReleaseId`, `sourceCohortKey`, `createdAt`) SELECT `snapshotId`, `datasetId`, `resourceReleaseId`, `role`, `selectedByRule`, `selectionMode`, `anchorReleaseId`, `sourceCohortKey`, `createdAt` FROM `snapshotSources`;--> statement-breakpoint
DROP TABLE `snapshotSources`;--> statement-breakpoint
ALTER TABLE `__new_snapshotSources` RENAME TO `snapshotSources`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshotSources_sourceReleaseId_idx`;--> statement-breakpoint
CREATE INDEX `snapshotSources_datasetId_idx` ON `snapshotSources` (`datasetId`);--> statement-breakpoint
CREATE INDEX `snapshotSources_resourceReleaseId_idx` ON `snapshotSources` (`resourceReleaseId`);