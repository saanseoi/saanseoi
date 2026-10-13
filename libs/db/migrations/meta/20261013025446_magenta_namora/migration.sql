PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_apiReleaseSetSnapshots` (
	`apiReleaseSetId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`variant` text DEFAULT 'default' NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`cohortMatchingMode` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `apiReleaseSetSnapshots_pk` PRIMARY KEY(`apiReleaseSetId`, `snapshotId`, `variant`),
	CONSTRAINT `fk_apiReleaseSetSnapshots_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apiReleaseSetSnapshots_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_apiReleaseSetSnapshots`(`apiReleaseSetId`, `snapshotId`, `variant`, `role`, `isRequired`, `cohortMatchingMode`, `createdAt`) SELECT `apiReleaseSetId`, `snapshotId`, `variant`, `role`, `isRequired`, `cohortMatchingMode`, `createdAt` FROM `apiReleaseSetSnapshots`;--> statement-breakpoint
DROP TABLE `apiReleaseSetSnapshots`;--> statement-breakpoint
ALTER TABLE `__new_apiReleaseSetSnapshots` RENAME TO `apiReleaseSetSnapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `apiReleaseSetSnapshots_snapshotId_idx` ON `apiReleaseSetSnapshots` (`snapshotId`);--> statement-breakpoint
ALTER TABLE `apiCompositionMembers` DROP COLUMN `anchorResourceType`;