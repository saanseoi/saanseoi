PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_statsFields` (
	`datasetCode` text NOT NULL,
	`fieldName` text NOT NULL,
	`sourceField` text NOT NULL,
	`dimensions` text NOT NULL,
	`comparability` text,
	`sourceNullOption` text,
	`statisticKind` text DEFAULT 'unreviewed' NOT NULL,
	`aggregation` text DEFAULT 'unreviewed' NOT NULL,
	`aggregationPercentile` real,
	`denominatorFieldName` text,
	`valueKind` text NOT NULL,
	`unitCode` text NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsFields_pk` PRIMARY KEY(`datasetCode`, `fieldName`, `sourceReleaseId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_statsFields`(`datasetCode`, `fieldName`, `sourceField`, `dimensions`, `comparability`, `sourceNullOption`, `statisticKind`, `aggregation`, `aggregationPercentile`, `denominatorFieldName`, `valueKind`, `unitCode`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt`, `updatedAt`) SELECT `datasetCode`, `fieldName`, `sourceField`, `dimensions`, `comparability`, `sourceNullOption`, `statisticKind`, `aggregation`, `aggregationPercentile`, `denominatorFieldName`, `valueKind`, `unitCode`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt`, `updatedAt` FROM `statsFields`;--> statement-breakpoint
DROP TABLE `statsFields`;--> statement-breakpoint
ALTER TABLE `__new_statsFields` RENAME TO `statsFields`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_statsFieldsI18n` (
	`datasetCode` text NOT NULL,
	`fieldName` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`isTranslationVerified` integer DEFAULT true NOT NULL,
	`versionHash` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `statsFieldsI18n_pk` PRIMARY KEY(`datasetCode`, `fieldName`, `locale`, `sourceReleaseId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_statsFieldsI18n`(`datasetCode`, `fieldName`, `locale`, `name`, `description`, `isTranslationVerified`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt`, `updatedAt`) SELECT `datasetCode`, `fieldName`, `locale`, `name`, `description`, `isTranslationVerified`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt`, `updatedAt` FROM `statsFieldsI18n`;--> statement-breakpoint
DROP TABLE `statsFieldsI18n`;--> statement-breakpoint
ALTER TABLE `__new_statsFieldsI18n` RENAME TO `statsFieldsI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_statsValuesI18n` (
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
	CONSTRAINT `statsValuesI18n_pk` PRIMARY KEY(`datasetCode`, `dimensionCode`, `valueCode`, `locale`, `sourceReleaseId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_statsValuesI18n`(`datasetCode`, `dimensionCode`, `valueCode`, `locale`, `name`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt`, `updatedAt`) SELECT `datasetCode`, `dimensionCode`, `valueCode`, `locale`, `name`, `versionHash`, `sourceReleaseId`, `isCurrent`, `createdAt`, `updatedAt` FROM `statsValuesI18n`;--> statement-breakpoint
DROP TABLE `statsValuesI18n`;--> statement-breakpoint
ALTER TABLE `__new_statsValuesI18n` RENAME TO `statsValuesI18n`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `statsFields_current_lookup_idx` ON `statsFields` (`datasetCode`,`fieldName`,`isCurrent`);