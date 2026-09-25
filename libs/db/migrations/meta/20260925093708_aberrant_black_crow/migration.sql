ALTER TABLE `snapshotSourceReleases` RENAME TO `snapshotResourceReleases`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_snapshotResourceReleases` (
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
	CONSTRAINT `snapshotResourceReleases_resourceReleaseId_datasetId_resourceReleases_id_datasetId_fk` FOREIGN KEY (`resourceReleaseId`,`datasetId`) REFERENCES `resourceReleases`(`id`,`datasetId`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_snapshotResourceReleases`(`snapshotId`, `datasetId`, `resourceReleaseId`, `role`, `selectedByRule`, `selectionMode`, `anchorReleaseId`, `sourceCohortKey`, `createdAt`) SELECT `snapshotId`, `datasetId`, `resourceReleaseId`, `role`, `selectedByRule`, `selectionMode`, `anchorReleaseId`, `sourceCohortKey`, `createdAt` FROM `snapshotResourceReleases`;--> statement-breakpoint
DROP TABLE `snapshotResourceReleases`;--> statement-breakpoint
ALTER TABLE `__new_snapshotResourceReleases` RENAME TO `snapshotResourceReleases`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshotSourceReleases_datasetId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshotSourceReleases_resourceReleaseId_idx`;--> statement-breakpoint
CREATE INDEX `snapshotResourceReleases_datasetId_idx` ON `snapshotResourceReleases` (`datasetId`);--> statement-breakpoint
CREATE INDEX `snapshotResourceReleases_resourceReleaseId_idx` ON `snapshotResourceReleases` (`resourceReleaseId`);