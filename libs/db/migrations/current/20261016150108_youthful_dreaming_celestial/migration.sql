PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_statsRecords` (
	`id` text PRIMARY KEY NOT NULL,
	`datasetCode` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`sourceFeatureRef` text NOT NULL,
	`divisionId` text,
	`referencePeriodCode` text NOT NULL,
	`referencePeriodStart` text,
	`referencePeriodEnd` text,
	`referencePeriodGranularity` text NOT NULL,
	`referencePeriodEndYear` text NOT NULL,
	`geography` text NOT NULL,
	`fieldSources` text DEFAULT '[]' NOT NULL,
	`definitionSetId` text NOT NULL,
	`values` text NOT NULL,
	`versionHash` text DEFAULT '' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_statsRecords`(`id`, `datasetCode`, `sourceReleaseId`, `sourceFeatureRef`, `divisionId`, `referencePeriodCode`, `referencePeriodStart`, `referencePeriodEnd`, `referencePeriodGranularity`, `referencePeriodEndYear`, `geography`, `fieldSources`, `definitionSetId`, `values`, `versionHash`, `createdAt`) SELECT `id`, `datasetCode`, `sourceReleaseId`, `sourceFeatureRef`, `divisionId`, `referencePeriodCode`, `referencePeriodStart`, `referencePeriodEnd`, `referencePeriodGranularity`, `referencePeriodEndYear`, `geography`, `fieldSources`, `definitionSetId`, `values`, `versionHash`, `createdAt` FROM `statsRecords`;--> statement-breakpoint
DROP TABLE `statsRecords`;--> statement-breakpoint
ALTER TABLE `__new_statsRecords` RENAME TO `statsRecords`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `statsRecords_dataset_period_idx` ON `statsRecords` (`datasetCode`,`referencePeriodCode`);--> statement-breakpoint
CREATE INDEX `statsRecords_division_period_idx` ON `statsRecords` (`divisionId`,`referencePeriodCode`);--> statement-breakpoint
CREATE INDEX `statsRecords_source_release_idx` ON `statsRecords` (`sourceReleaseId`);