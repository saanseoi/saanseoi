CREATE TABLE `statsDimensions` (
	`datasetCode` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsDimensions_pk` PRIMARY KEY(`datasetCode`, `dimensionCode`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsMeasures` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`sourceField` text NOT NULL,
	`valueKind` text NOT NULL,
	`unitCode` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasures_pk` PRIMARY KEY(`datasetCode`, `measureCode`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsMeasuresI18n` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasuresI18n_pk` PRIMARY KEY(`datasetCode`, `measureCode`, `locale`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsObservationDimensions` (
	`observationId` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`valueCode` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsObservationDimensions_pk` PRIMARY KEY(`observationId`, `dimensionCode`, `valueCode`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsObservations` (
	`id` text NOT NULL,
	`datasetCode` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`sourceFeatureId` text NOT NULL,
	`sourceField` text NOT NULL,
	`divisionId` text,
	`referencePeriodCode` text NOT NULL,
	`referencePeriodStart` text,
	`referencePeriodEnd` text,
	`referencePeriodGranularity` text NOT NULL,
	`measureCode` text NOT NULL,
	`numericValue` text,
	`valueCode` text,
	`unitCode` text NOT NULL,
	`valuePrecision` text,
	`observationStatus` text NOT NULL,
	`sourceValue` text NOT NULL,
	`geographyCohortId` text,
	`versionHash` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsObservations_pk` PRIMARY KEY(`id`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsValues` (
	`datasetCode` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`valueCode` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsValues_pk` PRIMARY KEY(`datasetCode`, `dimensionCode`, `valueCode`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsValuesI18n` (
	`datasetCode` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`valueCode` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsValuesI18n_pk` PRIMARY KEY(`datasetCode`, `dimensionCode`, `valueCode`, `locale`, `versionHash`)
);
--> statement-breakpoint
CREATE INDEX `statsMeasures_current_lookup_idx` ON `statsMeasures` (`datasetCode`,`measureCode`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `statsObservationDimensions_observation_idx` ON `statsObservationDimensions` (`observationId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `statsObservations_current_lookup_idx` ON `statsObservations` (`id`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `statsObservations_dataset_period_measure_idx` ON `statsObservations` (`datasetCode`,`referencePeriodCode`,`measureCode`);--> statement-breakpoint
CREATE INDEX `statsObservations_division_period_idx` ON `statsObservations` (`divisionId`,`referencePeriodCode`);--> statement-breakpoint
CREATE INDEX `statsObservations_source_release_idx` ON `statsObservations` (`sourceReleaseId`);