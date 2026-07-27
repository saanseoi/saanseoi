CREATE TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` (
	`sourceRecordId` text NOT NULL,
	`districtCode` integer NOT NULL,
	`referenceYear` text NOT NULL,
	`landAreaSqKm` real NOT NULL,
	`midYearPopulationThousands` real NOT NULL,
	`midYearPopulationDensityPerSqKm` integer NOT NULL,
	`sourceCrs` text NOT NULL,
	`sourceGeometry` text NOT NULL,
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
	CONSTRAINT `hkgovCenstatdDistrictLandAreaPopulationDensities_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`)
);
--> statement-breakpoint
CREATE TABLE `hkgovCenstatdDistrictLandAreaPopulationDensityI18n` (
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
	CONSTRAINT `hkgovCenstatdDistrictLandAreaPopulationDensityI18n_pk` PRIMARY KEY(`sourceRecordId`, `versionHash`, `locale`)
);
--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_releaseId_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_sourceRecordId_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_current_lookup_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_release_validity_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_districtCode_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`districtCode`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_referenceYear_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`referenceYear`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensityI18n_releaseId_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensityI18n` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensityI18n_sourceRecordId_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensityI18n` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensityI18n_current_lookup_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensityI18n` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensityI18n_release_validity_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensityI18n` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensityI18n_locale_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensityI18n` (`locale`);--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDivisionAreas` DROP COLUMN `sourceCrs`;