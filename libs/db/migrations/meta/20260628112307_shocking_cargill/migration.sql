PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_id_family_unique_idx` ON `snapshots` (`id`,`family`);--> statement-breakpoint
CREATE TABLE `__new_apiReleaseSetSnapshots` (
	`apiReleaseSetId` text NOT NULL,
	`snapshotFamily` text NOT NULL,
	`snapshotId` text NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `apiReleaseSetSnapshots_pk` PRIMARY KEY(`apiReleaseSetId`, `snapshotFamily`),
	CONSTRAINT `fk_apiReleaseSetSnapshots_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `apiReleaseSetSnapshots_snapshotId_snapshotFamily_snapshots_id_family_fk` FOREIGN KEY (`snapshotId`,`snapshotFamily`) REFERENCES `snapshots`(`id`,`family`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_apiReleaseSetSnapshots`(`apiReleaseSetId`, `snapshotFamily`, `snapshotId`, `createdAt`) SELECT `apiReleaseSetId`, `snapshotFamily`, `snapshotId`, `createdAt` FROM `apiReleaseSetSnapshots`;--> statement-breakpoint
DROP TABLE `apiReleaseSetSnapshots`;--> statement-breakpoint
ALTER TABLE `__new_apiReleaseSetSnapshots` RENAME TO `apiReleaseSetSnapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_historyVersionProvenance` (
	`snapshotId` text NOT NULL,
	`entityType` text NOT NULL,
	`entityId` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `historyVersionProvenance_pk` PRIMARY KEY(`snapshotId`, `entityType`, `entityId`, `versionHash`, `sourceReleaseId`),
	CONSTRAINT `fk_historyVersionProvenance_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_historyVersionProvenance_sourceReleaseId_releases_id_fk` FOREIGN KEY (`sourceReleaseId`) REFERENCES `releases`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_historyVersionProvenance`(`snapshotId`, `entityType`, `entityId`, `versionHash`, `sourceReleaseId`, `createdAt`) SELECT `snapshotId`, `entityType`, `entityId`, `versionHash`, `sourceReleaseId`, `createdAt` FROM `historyVersionProvenance`;--> statement-breakpoint
DROP TABLE `historyVersionProvenance`;--> statement-breakpoint
ALTER TABLE `__new_historyVersionProvenance` RENAME TO `historyVersionProvenance`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `apiReleaseSetSnapshots_snapshotId_idx` ON `apiReleaseSetSnapshots` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `historyVersionProvenance_sourceReleaseId_idx` ON `historyVersionProvenance` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `historyVersionProvenance_entity_idx` ON `historyVersionProvenance` (`entityType`,`entityId`,`versionHash`);--> statement-breakpoint
