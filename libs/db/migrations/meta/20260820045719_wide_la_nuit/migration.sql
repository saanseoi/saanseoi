CREATE TABLE `statsDimensions` (
	`datasetCode` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsDimensions_pk` PRIMARY KEY(`sourceReleaseId`, `datasetCode`, `dimensionCode`)
);
--> statement-breakpoint
CREATE TABLE `statsMeasures` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`sourceField` text NOT NULL,
	`sourceNullOption` text,
	`statisticKind` text DEFAULT 'unreviewed' NOT NULL,
	`aggregation` text DEFAULT 'unreviewed' NOT NULL,
	`denominatorMeasureCode` text,
	`valueKind` text NOT NULL,
	`unitCode` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasures_pk` PRIMARY KEY(`sourceReleaseId`, `datasetCode`, `measureCode`)
);
--> statement-breakpoint
CREATE TABLE `statsMeasuresI18n` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`isTranslationVerified` integer DEFAULT true NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasuresI18n_pk` PRIMARY KEY(`sourceReleaseId`, `datasetCode`, `measureCode`, `locale`)
);
--> statement-breakpoint
CREATE TABLE `statsValues` (
	`datasetCode` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`valueCode` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsValues_pk` PRIMARY KEY(`sourceReleaseId`, `datasetCode`, `dimensionCode`, `valueCode`)
);
--> statement-breakpoint
CREATE TABLE `statsValuesI18n` (
	`datasetCode` text NOT NULL,
	`dimensionCode` text NOT NULL,
	`valueCode` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsValuesI18n_pk` PRIMARY KEY(`sourceReleaseId`, `datasetCode`, `dimensionCode`, `valueCode`, `locale`)
);
--> statement-breakpoint
CREATE INDEX `statsMeasures_dataset_release_idx` ON `statsMeasures` (`datasetCode`,`sourceReleaseId`);