PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_snapshots` (
	`id` text PRIMARY KEY,
	`snapshotLineageId` text NOT NULL,
	`parentSnapshotId` text,
	`code` text NOT NULL,
	`cohortKey` text NOT NULL,
	`geometryStatus` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`publishedAt` text,
	`validFrom` text,
	`validTo` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_snapshots_snapshotLineageId_snapshotLineages_id_fk` FOREIGN KEY (`snapshotLineageId`) REFERENCES `snapshotLineages`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_snapshots`(`id`, `snapshotLineageId`, `parentSnapshotId`, `code`, `cohortKey`, `geometryStatus`, `revision`, `status`, `publishedAt`, `validFrom`, `validTo`, `createdAt`, `updatedAt`) SELECT `id`, `snapshotLineageId`, `parentSnapshotId`, `code`, `cohortKey`, `geometryStatus`, `revision`, `status`, `publishedAt`, `validFrom`, `validTo`, `createdAt`, `updatedAt` FROM `snapshots`;--> statement-breakpoint
DROP TABLE `snapshots`;--> statement-breakpoint
ALTER TABLE `__new_snapshots` RENAME TO `snapshots`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshots_resourceType_code_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshots_id_resourceType_unique_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshots_resourceType_status_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_code_unique_idx` ON `snapshots` (`code`);--> statement-breakpoint
CREATE INDEX `snapshots_status_idx` ON `snapshots` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_lineage_cohort_revision_unique_idx` ON `snapshots` (`snapshotLineageId`,`cohortKey`,`revision`);--> statement-breakpoint
CREATE INDEX `snapshots_parentSnapshotId_idx` ON `snapshots` (`parentSnapshotId`);