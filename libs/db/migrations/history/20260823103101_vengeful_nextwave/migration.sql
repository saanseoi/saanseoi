CREATE TABLE `statsMeasures` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasures_pk` PRIMARY KEY(`datasetCode`, `measureCode`, `sourceReleaseId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `statsMeasuresI18n` (
	`datasetCode` text NOT NULL,
	`measureCode` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`isTranslationVerified` integer DEFAULT true NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsMeasuresI18n_pk` PRIMARY KEY(`datasetCode`, `measureCode`, `locale`, `sourceReleaseId`, `versionHash`)
);
--> statement-breakpoint
ALTER TABLE `statsFields` ADD `measureCode` text NOT NULL;--> statement-breakpoint
CREATE INDEX `statsMeasures_current_lookup_idx` ON `statsMeasures` (`datasetCode`,`measureCode`,`isCurrent`);