ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` RENAME COLUMN `midYearPopulationThousands` TO `midYearPopulation`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_hkgovCenstatdDistrictLandAreaPopulationDensities` (
	`sourceRecordId` text NOT NULL,
	`districtCode` integer NOT NULL,
	`referenceYear` text NOT NULL,
	`landAreaSqKm` real NOT NULL,
	`midYearPopulation` integer NOT NULL,
	`midYearPopulationDensityPerSqKm` integer NOT NULL,
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
INSERT INTO `__new_hkgovCenstatdDistrictLandAreaPopulationDensities`(`sourceRecordId`, `districtCode`, `referenceYear`, `landAreaSqKm`, `midYearPopulation`, `midYearPopulationDensityPerSqKm`, `sourceGeometry`, `sources`, `rawProperties`, `version`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt`) SELECT `sourceRecordId`, `districtCode`, `referenceYear`, `landAreaSqKm`, `midYearPopulation`, `midYearPopulationDensityPerSqKm`, `sourceGeometry`, `sources`, `rawProperties`, `version`, `versionHash`, `releaseId`, `validFromRelease`, `validToRelease`, `isCurrent`, `createdAt`, `updatedAt` FROM `hkgovCenstatdDistrictLandAreaPopulationDensities`;--> statement-breakpoint
DROP TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities`;--> statement-breakpoint
ALTER TABLE `__new_hkgovCenstatdDistrictLandAreaPopulationDensities` RENAME TO `hkgovCenstatdDistrictLandAreaPopulationDensities`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_releaseId_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`releaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_sourceRecordId_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_current_lookup_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`sourceRecordId`,`isCurrent`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_release_validity_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_districtCode_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`districtCode`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_referenceYear_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`referenceYear`);