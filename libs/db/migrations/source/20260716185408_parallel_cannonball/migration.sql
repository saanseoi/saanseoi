CREATE TABLE `hkgovPlandDivisionI18n` (
	`sourceRecordId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`isLocaleInferred` integer DEFAULT false NOT NULL,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovPlandDivisionI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
ALTER TABLE `hkgovPlandDivisions` ADD `newTownId` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovPlandDivisions` (
	`sourceRecordId` text NOT NULL,
	`planningLevel` text NOT NULL,
	`ppuCode` text,
	`spuCode` text,
	`tpuCode` text,
	`subunitCode` text,
	`newTownId` text,
	`sourceCellIds` text NOT NULL,
	`sourceCrs` text NOT NULL,
	`geometry` text,
	`bbox` text,
	`sources` text,
	`rawProperties` text,
	`version` integer,
	`versionHash` text NOT NULL,
	`releaseId` text NOT NULL,
	`validFromRelease` text NOT NULL,
	`validToRelease` text,
	`isCurrent` integer NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `hkgovPlandDivisions_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
INSERT INTO `__new_hkgovPlandDivisions`(`sourceRecordId`, `planningLevel`, `ppuCode`, `spuCode`, `tpuCode`, `subunitCode`, `sourceCellIds`, `sourceCrs`, `geometry`, `bbox`, `sources`, `rawProperties`, `version`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `planningLevel`, `ppuCode`, `spuCode`, `tpuCode`, `subunitCode`, `sourceCellIds`, `sourceCrs`, `geometry`, `bbox`, `sources`, `rawProperties`, `version`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt` FROM `hkgovPlandDivisions`;--> statement-breakpoint
DROP TABLE `hkgovPlandDivisions`;--> statement-breakpoint
ALTER TABLE `__new_hkgovPlandDivisions` RENAME TO `hkgovPlandDivisions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_releaseId_idx` ON `hkgovPlandDivisions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_sourceRecordId_idx` ON `hkgovPlandDivisions` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_current_lookup_idx` ON `hkgovPlandDivisions` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_release_validity_idx` ON `hkgovPlandDivisions` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_planningLevel_idx` ON `hkgovPlandDivisions` (`planningLevel`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_tpuCode_idx` ON `hkgovPlandDivisions` (`tpuCode`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisions_newTownId_idx` ON `hkgovPlandDivisions` (`newTownId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionI18n_releaseId_idx` ON `hkgovPlandDivisionI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionI18n_sourceRecordId_idx` ON `hkgovPlandDivisionI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionI18n_current_lookup_idx` ON `hkgovPlandDivisionI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionI18n_release_validity_idx` ON `hkgovPlandDivisionI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovPlandDivisionI18n_locale_idx` ON `hkgovPlandDivisionI18n` (`locale`);