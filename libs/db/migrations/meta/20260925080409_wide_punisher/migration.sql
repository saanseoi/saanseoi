CREATE TABLE `snapshotDependencies` (
	`snapshotId` text NOT NULL,
	`dependencySnapshotId` text NOT NULL,
	`role` text NOT NULL,
	CONSTRAINT `snapshotDependencies_pk` PRIMARY KEY(`snapshotId`, `role`),
	CONSTRAINT `fk_snapshotDependencies_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotDependencies_dependencySnapshotId_snapshots_id_fk` FOREIGN KEY (`dependencySnapshotId`) REFERENCES `snapshots`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
ALTER TABLE `snapshotAssemblyRuns` RENAME TO `snapshotAssemblies`;--> statement-breakpoint
ALTER TABLE `snapshotAssemblySources` RENAME TO `snapshotRecipeInputs`;--> statement-breakpoint
ALTER TABLE `snapshotAssembly` RENAME TO `snapshotRecipes`;--> statement-breakpoint
ALTER TABLE `snapshotSources` RENAME TO `snapshotSourceReleases`;--> statement-breakpoint
ALTER TABLE `snapshotAssemblies` RENAME COLUMN `snapshotAssemblyId` TO `snapshotRecipeId`;--> statement-breakpoint
ALTER TABLE `snapshotAssemblies` RENAME COLUMN `selectionSummaryJson` TO `detailsJson`;--> statement-breakpoint
ALTER TABLE `snapshotRecipeInputs` RENAME COLUMN `snapshotAssemblyId` TO `snapshotRecipeId`;--> statement-breakpoint
ALTER TABLE `snapshotRecipeInputs` RENAME COLUMN `selectionRulesJson` TO `selectionPolicyJson`;--> statement-breakpoint
ALTER TABLE `snapshotAssemblies` ADD `reviewRequired` integer;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_snapshotSourceReleases` (
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
	CONSTRAINT `snapshotSourceReleases_resourceReleaseId_datasetId_releases_id_datasetId_fk` FOREIGN KEY (`resourceReleaseId`,`datasetId`) REFERENCES `releases`(`id`,`datasetId`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_snapshotSourceReleases`(`snapshotId`, `datasetId`, `resourceReleaseId`, `role`, `selectedByRule`, `selectionMode`, `anchorReleaseId`, `sourceCohortKey`, `createdAt`) SELECT `snapshotId`, `datasetId`, `resourceReleaseId`, `role`, `selectedByRule`, `selectionMode`, `anchorReleaseId`, `sourceCohortKey`, `createdAt` FROM `snapshotSourceReleases`;--> statement-breakpoint
DROP TABLE `snapshotSourceReleases`;--> statement-breakpoint
ALTER TABLE `__new_snapshotSourceReleases` RENAME TO `snapshotSourceReleases`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_snapshotRecipeInputs` (
	`snapshotRecipeId` text NOT NULL,
	`datasetId` text NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`anchorDatasetId` text,
	`maxLagDays` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`selectionPolicyJson` text NOT NULL,
	CONSTRAINT `snapshotAssemblySources_pk` PRIMARY KEY(`snapshotRecipeId`, `datasetId`, `role`),
	CONSTRAINT `fk_snapshotAssemblySources_snapshotAssemblyId_snapshotAssembly_id_fk` FOREIGN KEY (`snapshotRecipeId`) REFERENCES `snapshotRecipes`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotAssemblySources_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_snapshotAssemblySources_anchorDatasetId_datasets_id_fk` FOREIGN KEY (`anchorDatasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
INSERT INTO `__new_snapshotRecipeInputs`(`snapshotRecipeId`, `datasetId`, `role`, `isRequired`, `anchorDatasetId`, `maxLagDays`, `priority`, `selectionPolicyJson`) SELECT `snapshotRecipeId`, `datasetId`, `role`, `isRequired`, `anchorDatasetId`, `maxLagDays`, `priority`, `selectionPolicyJson` FROM `snapshotRecipeInputs`;--> statement-breakpoint
DROP TABLE `snapshotRecipeInputs`;--> statement-breakpoint
ALTER TABLE `__new_snapshotRecipeInputs` RENAME TO `snapshotRecipeInputs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshotAssemblyRuns_snapshotId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshotAssembly_resourceType_status_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshotSources_datasetId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `snapshotSources_resourceReleaseId_idx`;--> statement-breakpoint
CREATE INDEX `snapshotSourceReleases_datasetId_idx` ON `snapshotSourceReleases` (`datasetId`);--> statement-breakpoint
CREATE INDEX `snapshotSourceReleases_resourceReleaseId_idx` ON `snapshotSourceReleases` (`resourceReleaseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshotAssemblies_snapshotId_idx` ON `snapshotAssemblies` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `snapshotDependencies_dependencySnapshotId_idx` ON `snapshotDependencies` (`dependencySnapshotId`);--> statement-breakpoint
CREATE INDEX `snapshotRecipes_resourceType_status_idx` ON `snapshotRecipes` (`resourceType`,`status`);