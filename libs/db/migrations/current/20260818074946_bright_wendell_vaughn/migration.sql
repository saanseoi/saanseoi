CREATE TABLE `statsDimensions` (
	`datasetCode` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsDimensions_pk` PRIMARY KEY(`datasetCode`, `dimensionCode`)
);
--> statement-breakpoint
CREATE TABLE `statsMeasures` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`sourceField` text NOT NULL,
	`valueKind` text NOT NULL,
	`unitCode` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasures_pk` PRIMARY KEY(`datasetCode`, `measureCode`)
);
--> statement-breakpoint
CREATE TABLE `statsMeasuresI18n` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasuresI18n_pk` PRIMARY KEY(`datasetCode`, `measureCode`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `statsObservationDimensions` (
	`observationId` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`valueCode` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsObservationDimensions_pk` PRIMARY KEY(`observationId`, `dimensionCode`, `valueCode`)
);
--> statement-breakpoint
CREATE TABLE `statsObservations` (
	`id` text PRIMARY KEY NOT NULL,
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
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `statsValues` (
	`datasetCode` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`valueCode` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsValues_pk` PRIMARY KEY(`datasetCode`, `dimensionCode`, `valueCode`)
);
--> statement-breakpoint
CREATE TABLE `statsValuesI18n` (
	`datasetCode` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`valueCode` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsValuesI18n_pk` PRIMARY KEY(`datasetCode`, `dimensionCode`, `valueCode`, `locale`)
);
--> statement-breakpoint
CREATE INDEX `statsObservationDimensions_observation_idx` ON `statsObservationDimensions` (`observationId`);--> statement-breakpoint
CREATE INDEX `statsObservations_dataset_period_measure_idx` ON `statsObservations` (`datasetCode`,`referencePeriodCode`,`measureCode`);--> statement-breakpoint
CREATE INDEX `statsObservations_division_period_idx` ON `statsObservations` (`divisionId`,`referencePeriodCode`);