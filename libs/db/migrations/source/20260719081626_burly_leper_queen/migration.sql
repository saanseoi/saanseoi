CREATE TABLE `hkgovCenstatdDivisionAreaI18n` (
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
	CONSTRAINT `hkgovCenstatdDivisionAreaI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaI18n_releaseId_idx` ON `hkgovCenstatdDivisionAreaI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaI18n_sourceRecordId_idx` ON `hkgovCenstatdDivisionAreaI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaI18n_current_lookup_idx` ON `hkgovCenstatdDivisionAreaI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaI18n_release_validity_idx` ON `hkgovCenstatdDivisionAreaI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaI18n_locale_idx` ON `hkgovCenstatdDivisionAreaI18n` (`locale`);--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDivisionAreas` DROP COLUMN `districtNameEn`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDivisionAreas` DROP COLUMN `districtNameZhHant`;