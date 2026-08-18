CREATE TABLE `statsSeries` (
	`id` text NOT NULL,
	`datasetCode` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`sourceFeatureId` text NOT NULL,
	`divisionId` text,
	`referencePeriodCode` text NOT NULL,
	`referencePeriodStart` text,
	`referencePeriodEnd` text,
	`referencePeriodGranularity` text NOT NULL,
	`geographyCohortId` text,
	`versionHash` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsSeries_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsSeriesDimensions` (
	`seriesId` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`valueCode` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsSeriesDimensions_pk` PRIMARY KEY(`seriesId`, `dimensionCode`, `valueCode`, `versionHash`)
);
--> statement-breakpoint
ALTER TABLE `statsObservations` ADD `seriesId` text NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `statsObservations_dataset_period_measure_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `statsObservations_division_period_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `statsObservations_source_release_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `statsObservationDimensions_observation_idx`;--> statement-breakpoint
CREATE INDEX `statsObservations_series_measure_idx` ON `statsObservations` (`seriesId`,`measureCode`);--> statement-breakpoint
CREATE INDEX `statsSeries_current_lookup_idx` ON `statsSeries` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `statsSeries_dataset_period_idx` ON `statsSeries` (`datasetCode`,`referencePeriodCode`);--> statement-breakpoint
CREATE INDEX `statsSeries_division_period_idx` ON `statsSeries` (`divisionId`,`referencePeriodCode`);--> statement-breakpoint
CREATE INDEX `statsSeries_source_release_idx` ON `statsSeries` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `statsSeriesDimensions_series_idx` ON `statsSeriesDimensions` (`seriesId`,`isCurrent`);--> statement-breakpoint
DROP TABLE `statsObservationDimensions`;--> statement-breakpoint
ALTER TABLE `statsObservations` DROP COLUMN `datasetCode`;--> statement-breakpoint
ALTER TABLE `statsObservations` DROP COLUMN `sourceFeatureId`;--> statement-breakpoint
ALTER TABLE `statsObservations` DROP COLUMN `divisionId`;--> statement-breakpoint
ALTER TABLE `statsObservations` DROP COLUMN `referencePeriodCode`;--> statement-breakpoint
ALTER TABLE `statsObservations` DROP COLUMN `referencePeriodStart`;--> statement-breakpoint
ALTER TABLE `statsObservations` DROP COLUMN `referencePeriodEnd`;--> statement-breakpoint
ALTER TABLE `statsObservations` DROP COLUMN `referencePeriodGranularity`;--> statement-breakpoint
ALTER TABLE `statsObservations` DROP COLUMN `geographyCohortId`;