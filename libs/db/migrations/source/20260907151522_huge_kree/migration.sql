DROP INDEX IF EXISTS `overtureDivisionAreas_subtype_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overtureDivisionAreas_class_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overtureDivisionBoundaries_subtype_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overtureDivisionBoundaries_class_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overtureDivisions_adminLevel_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overtureDivisions_subtype_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overtureDivisions_class_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overturePlaces_basicCategory_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `overturePlaces_taxonomyPrimary_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovAlsAddresses2d_identifiers_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdPlaceNames_geoNameId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdPlaceNames_placeClass_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdPlaceNames_district_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovLandsdRoadCentrelines_objectId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHydSensitiveStreets_streetName_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHydStrategicStreets_streetName_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHydStreetNamePlates_snpId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHydStreetNamePlates_roadName_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovTdPedestrianStreets_kind_object_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHadDivisionAreas_areaId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHadDivisionAreas_areaCode_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovHadDivisionAreas_divisionId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDistrictLandAreaPopulationDensities_districtCode_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDistrictLandAreaPopulationDensities_referencePeriod_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDivisionAreas_districtClass_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDivisionAreas_districtCode_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdDivisionAreas_censusYear_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdStatistics_dataset_layer_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdStatistics_referencePeriod_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovPlandNewTowns_newTownId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovPlandPlanningCells_tpuCode_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovPlandPlanningCells_spuCode_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovPlandPlanningCells_ppuCode_idx`;--> statement-breakpoint
ALTER TABLE `overtureDivisionAreas` DROP COLUMN `subtype`;--> statement-breakpoint
ALTER TABLE `overtureDivisionAreas` DROP COLUMN `class`;--> statement-breakpoint
ALTER TABLE `overtureDivisionAreas` DROP COLUMN `isLand`;--> statement-breakpoint
ALTER TABLE `overtureDivisionAreas` DROP COLUMN `isTerritorial`;--> statement-breakpoint
ALTER TABLE `overtureDivisionBoundaries` DROP COLUMN `subtype`;--> statement-breakpoint
ALTER TABLE `overtureDivisionBoundaries` DROP COLUMN `class`;--> statement-breakpoint
ALTER TABLE `overtureDivisionBoundaries` DROP COLUMN `isLand`;--> statement-breakpoint
ALTER TABLE `overtureDivisionBoundaries` DROP COLUMN `isTerritorial`;--> statement-breakpoint
ALTER TABLE `overtureDivisions` DROP COLUMN `names`;--> statement-breakpoint
ALTER TABLE `overtureDivisions` DROP COLUMN `admin_level`;--> statement-breakpoint
ALTER TABLE `overtureDivisions` DROP COLUMN `subtype`;--> statement-breakpoint
ALTER TABLE `overtureDivisions` DROP COLUMN `class`;--> statement-breakpoint
ALTER TABLE `overtureDivisions` DROP COLUMN `wikidata`;--> statement-breakpoint
ALTER TABLE `overtureDivisions` DROP COLUMN `hierarchies`;--> statement-breakpoint
ALTER TABLE `overtureDivisions` DROP COLUMN `cartography`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `names`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `lng`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `lat`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `bbox`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `operatingStatus`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `basicCategory`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `taxonomyPrimary`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `taxonomyHierarchy`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `taxonomyAlternates`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `wikidataId`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `brandNames`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `websites`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `socials`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `emails`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `phones`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `addresses`;--> statement-breakpoint
ALTER TABLE `overturePlaces` DROP COLUMN `confidence`;--> statement-breakpoint
ALTER TABLE `hkgovAlsAddresses2d` DROP COLUMN `identifiers`;--> statement-breakpoint
ALTER TABLE `hkgovAlsAddresses2d` DROP COLUMN `easting`;--> statement-breakpoint
ALTER TABLE `hkgovAlsAddresses2d` DROP COLUMN `northing`;--> statement-breakpoint
ALTER TABLE `hkgovAlsAddresses2d` DROP COLUMN `geometry`;--> statement-breakpoint
ALTER TABLE `hkgovAlsAddresses2d` DROP COLUMN `addressEn`;--> statement-breakpoint
ALTER TABLE `hkgovAlsAddresses2d` DROP COLUMN `addressZhHant`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdPlaceNames` DROP COLUMN `geoNameId`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdPlaceNames` DROP COLUMN `placeClass`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdPlaceNames` DROP COLUMN `placeType`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdPlaceNames` DROP COLUMN `district`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdRoadCentrelines` DROP COLUMN `objectId`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdRoadCentrelines` DROP COLUMN `streetCode`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdRoadCentrelines` DROP COLUMN `streetType`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdRoadCentrelines` DROP COLUMN `nameEn`;--> statement-breakpoint
ALTER TABLE `hkgovLandsdRoadCentrelines` DROP COLUMN `nameZhHant`;--> statement-breakpoint
ALTER TABLE `hkgovHydSensitiveStreets` DROP COLUMN `level`;--> statement-breakpoint
ALTER TABLE `hkgovHydSensitiveStreets` DROP COLUMN `sectionBetween`;--> statement-breakpoint
ALTER TABLE `hkgovHydSensitiveStreets` DROP COLUMN `streetName`;--> statement-breakpoint
ALTER TABLE `hkgovHydStrategicStreets` DROP COLUMN `level`;--> statement-breakpoint
ALTER TABLE `hkgovHydStrategicStreets` DROP COLUMN `sectionBetween`;--> statement-breakpoint
ALTER TABLE `hkgovHydStrategicStreets` DROP COLUMN `streetName`;--> statement-breakpoint
ALTER TABLE `hkgovHydStreetNamePlates` DROP COLUMN `snpId`;--> statement-breakpoint
ALTER TABLE `hkgovHydStreetNamePlates` DROP COLUMN `level`;--> statement-breakpoint
ALTER TABLE `hkgovHydStreetNamePlates` DROP COLUMN `roadName`;--> statement-breakpoint
ALTER TABLE `hkgovTdPedestrianStreets` DROP COLUMN `objectId`;--> statement-breakpoint
ALTER TABLE `hkgovTdPedestrianStreets` DROP COLUMN `startTime`;--> statement-breakpoint
ALTER TABLE `hkgovTdPedestrianStreets` DROP COLUMN `endTime`;--> statement-breakpoint
ALTER TABLE `hkgovTdPedestrianStreets` DROP COLUMN `descriptionEn`;--> statement-breakpoint
ALTER TABLE `hkgovTdPedestrianStreets` DROP COLUMN `descriptionZhHant`;--> statement-breakpoint
ALTER TABLE `hkgovTdPedestrianStreets` DROP COLUMN `descriptionZhHans`;--> statement-breakpoint
ALTER TABLE `hkgovHadDivisionAreas` DROP COLUMN `objectId`;--> statement-breakpoint
ALTER TABLE `hkgovHadDivisionAreas` DROP COLUMN `cdsiAdminAreaId`;--> statement-breakpoint
ALTER TABLE `hkgovHadDivisionAreas` DROP COLUMN `areaType`;--> statement-breakpoint
ALTER TABLE `hkgovHadDivisionAreas` DROP COLUMN `areaId`;--> statement-breakpoint
ALTER TABLE `hkgovHadDivisionAreas` DROP COLUMN `divisionId`;--> statement-breakpoint
ALTER TABLE `hkgovHadDivisionAreas` DROP COLUMN `areaCode`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` DROP COLUMN `districtCode`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` DROP COLUMN `districtEn`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` DROP COLUMN `districtZhHant`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` DROP COLUMN `referencePeriodCode`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` DROP COLUMN `referencePeriodStart`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` DROP COLUMN `referencePeriodEnd`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` DROP COLUMN `referencePeriodGranularity`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` DROP COLUMN `referencePeriodEndYear`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` DROP COLUMN `landAreaSqKm`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` DROP COLUMN `midYearPopulation`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDistrictLandAreaPopulationDensities` DROP COLUMN `midYearPopulationDensityPerSqKm`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDivisionAreas` DROP COLUMN `districtClass`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDivisionAreas` DROP COLUMN `districtCode`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDivisionAreas` DROP COLUMN `districtEn`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdDivisionAreas` DROP COLUMN `districtZhHant`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` DROP COLUMN `datasetCode`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` DROP COLUMN `layerName`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` DROP COLUMN `referencePeriodCode`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` DROP COLUMN `referencePeriodStart`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` DROP COLUMN `referencePeriodEnd`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` DROP COLUMN `referencePeriodGranularity`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` DROP COLUMN `referencePeriodEndYear`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdStatistics` DROP COLUMN `featureId`;--> statement-breakpoint
ALTER TABLE `hkgovPlandNewTowns` DROP COLUMN `newTownId`;--> statement-breakpoint
ALTER TABLE `hkgovPlandNewTowns` DROP COLUMN `nameEn`;--> statement-breakpoint
ALTER TABLE `hkgovPlandNewTowns` DROP COLUMN `nameZhHant`;--> statement-breakpoint
ALTER TABLE `hkgovPlandNewTowns` DROP COLUMN `nameZhHans`;--> statement-breakpoint
ALTER TABLE `hkgovPlandPlanningCells` DROP COLUMN `ppuCode`;--> statement-breakpoint
ALTER TABLE `hkgovPlandPlanningCells` DROP COLUMN `spuCode`;--> statement-breakpoint
ALTER TABLE `hkgovPlandPlanningCells` DROP COLUMN `tpuCode`;--> statement-breakpoint
ALTER TABLE `hkgovPlandPlanningCells` DROP COLUMN `subunitCode`;