DROP INDEX IF EXISTS `overtureDivisionAreas_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overtureDivisionAreas_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overtureDivisionBoundaries_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overtureDivisionBoundaries_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overtureDivisions_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overtureDivisions_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overturePlaces_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overturePlaces_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `protomapsIslandFeatures_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `protomapsIslandFeatures_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovAlsAddresses2d_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovAlsAddresses2d_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovAlsAddresses3d_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovAlsAddresses3d_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdPlaceNames_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdPlaceNames_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdRoadCentrelines_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdRoadCentrelines_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetBaselineRecords_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetBaselineRecords_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetNoticeApplications_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetNoticeApplications_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetNotices_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdStreetNotices_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHydSensitiveStreets_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHydSensitiveStreets_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHydStrategicStreets_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHydStrategicStreets_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHydStreetNamePlates_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHydStreetNamePlates_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovTdPedestrianStreets_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovTdPedestrianStreets_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHadDivisionAreas_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHadDivisionAreas_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDistrictLandAreaPopulationDensities_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDistrictLandAreaPopulationDensities_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDivisionAreaDerivatives_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDivisionAreaDerivatives_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDivisionAreaDerivatives_input_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDivisionAreas_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDivisionAreas_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdStatistics_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdStatistics_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovPlandNewTowns_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovPlandNewTowns_current_lookup_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovPlandPlanningCells_sourceRecordId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovPlandPlanningCells_current_lookup_idx`;--> statement-breakpoint
CREATE INDEX `overtureDivisionAreas_open_records_idx` ON `overtureDivisionAreas` (`sourceRecordId`) WHERE "overtureDivisionAreas"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `overtureDivisionBoundaries_open_records_idx` ON `overtureDivisionBoundaries` (`sourceRecordId`) WHERE "overtureDivisionBoundaries"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `overtureDivisions_open_records_idx` ON `overtureDivisions` (`sourceRecordId`) WHERE "overtureDivisions"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `overturePlaces_open_records_idx` ON `overturePlaces` (`sourceRecordId`) WHERE "overturePlaces"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `protomapsIslandFeatures_open_records_idx` ON `protomapsIslandFeatures` (`sourceRecordId`) WHERE "protomapsIslandFeatures"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses2d_open_records_idx` ON `hkgovAlsAddresses2d` (`sourceRecordId`) WHERE "hkgovAlsAddresses2d"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovAlsAddresses3d_open_records_idx` ON `hkgovAlsAddresses3d` (`sourceRecordId`) WHERE "hkgovAlsAddresses3d"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovLandsdPlaceNames_open_records_idx` ON `hkgovLandsdPlaceNames` (`sourceRecordId`) WHERE "hkgovLandsdPlaceNames"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovLandsdRoadCentrelines_open_records_idx` ON `hkgovLandsdRoadCentrelines` (`sourceRecordId`) WHERE "hkgovLandsdRoadCentrelines"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetBaselineRecords_open_records_idx` ON `hkgovLandsdStreetBaselineRecords` (`sourceRecordId`) WHERE "hkgovLandsdStreetBaselineRecords"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNoticeApplications_open_records_idx` ON `hkgovLandsdStreetNoticeApplications` (`sourceRecordId`) WHERE "hkgovLandsdStreetNoticeApplications"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovLandsdStreetNotices_open_records_idx` ON `hkgovLandsdStreetNotices` (`sourceRecordId`) WHERE "hkgovLandsdStreetNotices"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovHydSensitiveStreets_open_records_idx` ON `hkgovHydSensitiveStreets` (`sourceRecordId`) WHERE "hkgovHydSensitiveStreets"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovHydStrategicStreets_open_records_idx` ON `hkgovHydStrategicStreets` (`sourceRecordId`) WHERE "hkgovHydStrategicStreets"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovHydStreetNamePlates_open_records_idx` ON `hkgovHydStreetNamePlates` (`sourceRecordId`) WHERE "hkgovHydStreetNamePlates"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovTdPedestrianStreets_open_records_idx` ON `hkgovTdPedestrianStreets` (`sourceRecordId`) WHERE "hkgovTdPedestrianStreets"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovHadDivisionAreas_open_records_idx` ON `hkgovHadDivisionAreas` (`sourceRecordId`) WHERE "hkgovHadDivisionAreas"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDistrictLandAreaPopulationDensities_open_records_idx` ON `hkgovCenstatdDistrictLandAreaPopulationDensities` (`sourceRecordId`) WHERE "hkgovCenstatdDistrictLandAreaPopulationDensities"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreaDerivatives_open_records_idx` ON `hkgovCenstatdDivisionAreaDerivatives` (`sourceRecordId`) WHERE "hkgovCenstatdDivisionAreaDerivatives"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovCenstatdDivisionAreas_open_records_idx` ON `hkgovCenstatdDivisionAreas` (`sourceRecordId`) WHERE "hkgovCenstatdDivisionAreas"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_open_records_idx` ON `hkgovCenstatdStatistics` (`sourceRecordId`) WHERE "hkgovCenstatdStatistics"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovPlandNewTowns_open_records_idx` ON `hkgovPlandNewTowns` (`sourceRecordId`) WHERE "hkgovPlandNewTowns"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovPlandPlanningCells_open_records_idx` ON `hkgovPlandPlanningCells` (`sourceRecordId`) WHERE "hkgovPlandPlanningCells"."isCurrent" = 1;