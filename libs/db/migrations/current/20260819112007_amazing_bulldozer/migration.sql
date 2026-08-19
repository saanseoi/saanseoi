CREATE TABLE `statsRecords` (
	`id` text PRIMARY KEY NOT NULL,
	`datasetCode` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`sourceFeatureId` text NOT NULL,
	`divisionId` text,
	`referencePeriodCode` text NOT NULL,
	`referencePeriodStart` text,
	`referencePeriodEnd` text,
	`referencePeriodGranularity` text NOT NULL,
	`geographyCohortId` text,
	`dimensions` text NOT NULL,
	`values` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
DROP INDEX IF EXISTS `statsObservations_series_measure_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `statsSeries_dataset_period_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `statsSeries_division_period_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `statsSeriesDimensions_series_idx`;--> statement-breakpoint
CREATE INDEX `statsRecords_dataset_period_idx` ON `statsRecords` (`datasetCode`,`referencePeriodCode`);--> statement-breakpoint
CREATE INDEX `statsRecords_division_period_idx` ON `statsRecords` (`divisionId`,`referencePeriodCode`);--> statement-breakpoint
CREATE INDEX `statsRecords_source_release_idx` ON `statsRecords` (`sourceReleaseId`);--> statement-breakpoint
DROP TABLE `statsObservations`;--> statement-breakpoint
DROP TABLE `statsSeries`;--> statement-breakpoint
DROP TABLE `statsSeriesDimensions`;