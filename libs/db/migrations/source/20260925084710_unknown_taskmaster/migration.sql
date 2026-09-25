ALTER TABLE `overtureDivisionAreas` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `overtureDivisionBoundaries` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `overtureDivisions` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `overturePlaces` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `protomapsIslandFeatures` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovAlsAddresses2d` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovAlsAddresses3d` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdPlaceNames` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdRoadCentrelines` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetBaselineRecords` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNoticeApplications` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdStreetNotices` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovHydSensitiveStreets` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovHydStrategicStreets` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovHydStreetNamePlates` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovTdPedestrianStreets` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovHadDivisionAreas` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDivisionAreaDerivatives` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDivisionAreas` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovPlandNewTowns` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
ALTER TABLE `hkgovPlandPlanningCells` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
DROP INDEX IF EXISTS `overtureDivisionAreas_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overtureDivisionBoundaries_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overtureDivisions_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overturePlaces_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `protomapsIslandFeatures_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovAlsAddresses2d_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovAlsAddresses3d_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdPlaceNames_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdRoadCentrelines_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetBaselineRecords_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetNoticeApplications_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetNotices_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHydSensitiveStreets_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHydStrategicStreets_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHydStreetNamePlates_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovTdPedestrianStreets_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHadDivisionAreas_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDistrictLandAreaPopulationDensities_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDivisionAreaDerivatives_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDivisionAreas_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdStatistics_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovPlandNewTowns_releaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovPlandPlanningCells_releaseId_idx`;--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_resourceReleaseId_idx` ON `overtureDivisionAreas` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_resourceReleaseId_idx` ON `overtureDivisionBoundaries` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `overtureDivisions_resourceReleaseId_idx` ON `overtureDivisions` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `overturePlaces_resourceReleaseId_idx` ON `overturePlaces` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `protomapsIslandFeatures_resourceReleaseId_idx` ON `protomapsIslandFeatures` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_resourceReleaseId_idx` ON `hkgovAlsAddresses2d` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses3d_resourceReleaseId_idx` ON `hkgovAlsAddresses3d` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_resourceReleaseId_idx` ON `hkgovLandsdPlaceNames` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_resourceReleaseId_idx` ON `hkgovLandsdRoadCentrelines` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_resourceReleaseId_idx` ON `hkgovLandsdStreetBaselineRecords` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_resourceReleaseId_idx` ON `hkgovLandsdStreetNoticeApplications` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_resourceReleaseId_idx` ON `hkgovLandsdStreetNotices` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHydSensitiveStreets_resourceReleaseId_idx` ON `hkgovHydSensitiveStreets` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHydStrategicStreets_resourceReleaseId_idx` ON `hkgovHydStrategicStreets` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_resourceReleaseId_idx` ON `hkgovHydStreetNamePlates` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_resourceReleaseId_idx` ON `hkgovTdPedestrianStreets` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_resourceReleaseId_idx` ON `hkgovHadDivisionAreas` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_resourceReleaseId_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_resourceReleaseId_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_resourceReleaseId_idx` ON `hkgovCenstatdDivisionAreas` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_resourceReleaseId_idx` ON `hkgovCenstatdStatistics` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTowns_resourceReleaseId_idx` ON `hkgovPlandNewTowns` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_resourceReleaseId_idx` ON `hkgovPlandPlanningCells` (`resourceReleaseId`);