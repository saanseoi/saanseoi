ALTER TABLE `hkgovCenstatdDivisionAreas` ADD `sourceCrs` text NOT NULL;--> statement-breakpoint
ALTER TABLE `hkgovHadDivisionAreas` DROP COLUMN `sourceCrs`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` DROP COLUMN `sourceCrs`;--> statement-breakpoint
ALTER TABLE `hkgovPlandDivisionAreas` DROP COLUMN `sourceCrs`;--> statement-breakpoint
ALTER TABLE `hkgovPlandDivisions` DROP COLUMN `sourceCrs`;--> statement-breakpoint
ALTER TABLE `hkgovPlandNewTownDivisionAreas` DROP COLUMN `sourceCrs`;--> statement-breakpoint
ALTER TABLE `hkgovPlandPlanningCells` DROP COLUMN `sourceCrs`;