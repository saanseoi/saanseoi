ALTER TABLE `apiCompositionMembers` ADD `variant` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `apiFieldProvenance` ADD `variant` text;--> statement-breakpoint
ALTER TABLE `apiReleaseSetSnapshots` ADD `variant` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_apiCompositionMembers` (
	`apiCompositionId` text NOT NULL,
	`resourceType` text NOT NULL,
	`variant` text DEFAULT 'default' NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`selectionMode` text NOT NULL,
	`anchorResourceType` text,
	`maxLagDays` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`configJson` text,
	CONSTRAINT `apiCompositionMembers_pk` PRIMARY KEY(`apiCompositionId`, `resourceType`, `variant`),
	CONSTRAINT `fk_apiCompositionMembers_apiCompositionId_apiComposition_id_fk` FOREIGN KEY (`apiCompositionId`) REFERENCES `apiComposition`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
INSERT INTO `__new_apiCompositionMembers`(`apiCompositionId`, `resourceType`, `role`, `isRequired`, `selectionMode`, `anchorResourceType`, `maxLagDays`, `priority`, `configJson`) SELECT `apiCompositionId`, `resourceType`, `role`, `isRequired`, `selectionMode`, `anchorResourceType`, `maxLagDays`, `priority`, `configJson` FROM `apiCompositionMembers`;--> statement-breakpoint
DROP TABLE `apiCompositionMembers`;--> statement-breakpoint
ALTER TABLE `__new_apiCompositionMembers` RENAME TO `apiCompositionMembers`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_apiReleaseSetSnapshots` (
	`apiReleaseSetId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`variant` text DEFAULT 'default' NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`selectionMode` text NOT NULL,
	`anchorSnapshotId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `apiReleaseSetSnapshots_pk` PRIMARY KEY(`apiReleaseSetId`, `snapshotId`, `variant`),
	CONSTRAINT `fk_apiReleaseSetSnapshots_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apiReleaseSetSnapshots_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_apiReleaseSetSnapshots_anchorSnapshotId_snapshots_id_fk` FOREIGN KEY (`anchorSnapshotId`) REFERENCES `snapshots`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_apiReleaseSetSnapshots`(`apiReleaseSetId`, `snapshotId`, `role`, `isRequired`, `selectionMode`, `anchorSnapshotId`, `createdAt`) SELECT `apiReleaseSetId`, `snapshotId`, `role`, `isRequired`, `selectionMode`, `anchorSnapshotId`, `createdAt` FROM `apiReleaseSetSnapshots`;--> statement-breakpoint
DROP TABLE `apiReleaseSetSnapshots`;--> statement-breakpoint
ALTER TABLE `__new_apiReleaseSetSnapshots` RENAME TO `apiReleaseSetSnapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `apiReleaseSetSnapshots_snapshotId_idx` ON `apiReleaseSetSnapshots` (`snapshotId`);