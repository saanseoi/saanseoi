CREATE TABLE `apiComposition` (
	`id` text PRIMARY KEY,
	`apiVersionId` text NOT NULL,
	`code` text NOT NULL UNIQUE,
	`version` integer NOT NULL,
	`primaryResourceType` text NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`versionHash` text NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_apiComposition_apiVersionId_apiVersions_id_fk` FOREIGN KEY (`apiVersionId`) REFERENCES `apiVersions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `apiCompositionMembers` (
	`apiCompositionId` text NOT NULL,
	`resourceType` text NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`selectionMode` text NOT NULL,
	`anchorResourceType` text,
	`maxLagDays` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`configJson` text,
	CONSTRAINT `apiCompositionMembers_pk` PRIMARY KEY(`apiCompositionId`, `resourceType`),
	CONSTRAINT `fk_apiCompositionMembers_apiCompositionId_apiComposition_id_fk` FOREIGN KEY (`apiCompositionId`) REFERENCES `apiComposition`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `snapshotAssembly` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`resourceType` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`versionHash` text NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshotAssemblyRuns` (
	`id` text PRIMARY KEY,
	`snapshotId` text NOT NULL,
	`snapshotAssemblyId` text NOT NULL,
	`anchorReleaseId` text,
	`anchorCohortKey` text,
	`status` text NOT NULL,
	`selectionSummaryJson` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_snapshotAssemblyRuns_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotAssemblyRuns_snapshotAssemblyId_snapshotAssembly_id_fk` FOREIGN KEY (`snapshotAssemblyId`) REFERENCES `snapshotAssembly`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `snapshotAssemblySources` (
	`snapshotAssemblyId` text NOT NULL,
	`datasetId` text NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`selectorType` text NOT NULL,
	`anchorDatasetId` text,
	`maxLagDays` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`configJson` text,
	CONSTRAINT `snapshotAssemblySources_pk` PRIMARY KEY(`snapshotAssemblyId`, `datasetId`, `role`),
	CONSTRAINT `fk_snapshotAssemblySources_snapshotAssemblyId_snapshotAssembly_id_fk` FOREIGN KEY (`snapshotAssemblyId`) REFERENCES `snapshotAssembly`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotAssemblySources_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_snapshotAssemblySources_anchorDatasetId_datasets_id_fk` FOREIGN KEY (`anchorDatasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
ALTER TABLE `releases` RENAME COLUMN `snapshotMonth` TO `cohortKey`;--> statement-breakpoint
ALTER TABLE `entityAliases` RENAME COLUMN `validFromMonth` TO `validFromCohortKey`;--> statement-breakpoint
ALTER TABLE `entityAliases` RENAME COLUMN `validToMonth` TO `validToCohortKey`;--> statement-breakpoint
ALTER TABLE `apiReleaseSetSnapshots` ADD `role` text NOT NULL;--> statement-breakpoint
ALTER TABLE `apiReleaseSetSnapshots` ADD `isRequired` integer NOT NULL;--> statement-breakpoint
ALTER TABLE `apiReleaseSetSnapshots` ADD `selectionMode` text NOT NULL;--> statement-breakpoint
ALTER TABLE `apiReleaseSetSnapshots` ADD `anchorSnapshotId` text REFERENCES snapshots(id);--> statement-breakpoint
ALTER TABLE `apiReleaseSetSnapshots` ADD `createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL;--> statement-breakpoint
ALTER TABLE `snapshotSources` ADD `selectedByRule` text;--> statement-breakpoint
ALTER TABLE `snapshotSources` ADD `selectionMode` text;--> statement-breakpoint
ALTER TABLE `snapshotSources` ADD `anchorReleaseId` text;--> statement-breakpoint
ALTER TABLE `snapshotSources` ADD `sourceCohortKey` text;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `cohortKey` text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `apiComposition_apiVersionId_version_unique_idx` ON `apiComposition` (`apiVersionId`,`version`);--> statement-breakpoint
CREATE INDEX `snapshotAssembly_resourceType_status_idx` ON `snapshotAssembly` (`resourceType`,`status`);--> statement-breakpoint
CREATE INDEX `snapshotAssemblyRuns_snapshotId_idx` ON `snapshotAssemblyRuns` (`snapshotId`);