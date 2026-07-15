CREATE TABLE `divisionAreas` (
	`id` text NOT NULL,
	`bbox` text,
	`geometry` text,
	`sourceKeys` text,
	`sources` text,
	`type` text NOT NULL,
	`is_land` integer,
	`is_territorial` integer,
	`divisionId` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`validFromCohortKey` text NOT NULL,
	`validToCohortKey` text,
	CONSTRAINT `divisionAreas_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `divisionBoundaries` (
	`id` text NOT NULL,
	`bbox` text,
	`geometry` text,
	`sourceKeys` text,
	`sources` text,
	`type` text NOT NULL,
	`is_land` integer,
	`is_territorial` integer,
	`leftDivisionId` text NOT NULL,
	`rightDivisionId` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`validFromSnapshotId` text NOT NULL,
	`validToSnapshotId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`validFromCohortKey` text NOT NULL,
	`validToCohortKey` text,
	CONSTRAINT `divisionBoundaries_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `divisionAreas_current_lookup_idx` ON `divisionAreas` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionAreas_divisionId_idx` ON `divisionAreas` (`divisionId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionAreas_snapshot_validity_idx` ON `divisionAreas` (`validFromSnapshotId`,`validToSnapshotId`);--> statement-breakpoint
CREATE INDEX `divisionAreas_validity_idx` ON `divisionAreas` (`validFromCohortKey`,`validToCohortKey`);--> statement-breakpoint
CREATE INDEX `divisionAreas_sourceReleaseId_idx` ON `divisionAreas` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `divisionAreas_snapshotId_idx` ON `divisionAreas` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_current_lookup_idx` ON `divisionBoundaries` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_leftDivisionId_idx` ON `divisionBoundaries` (`leftDivisionId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_rightDivisionId_idx` ON `divisionBoundaries` (`rightDivisionId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_snapshot_validity_idx` ON `divisionBoundaries` (`validFromSnapshotId`,`validToSnapshotId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_validity_idx` ON `divisionBoundaries` (`validFromCohortKey`,`validToCohortKey`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_sourceReleaseId_idx` ON `divisionBoundaries` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `divisionBoundaries_snapshotId_idx` ON `divisionBoundaries` (`snapshotId`);