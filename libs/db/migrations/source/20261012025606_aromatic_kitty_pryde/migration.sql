ALTER TABLE `hkgovCenstatdFeatures` RENAME TO `hkgovCenstatdStatistics`;--> statement-breakpoint
ALTER TABLE `hkgovCenstatdFeatureReleases` RENAME TO `hkgovCenstatdStatisticsReleaseMemberships`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdFeatures_resourceReleaseId_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdFeatures_open_records_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdFeatures_release_validity_idx`;--> statement-breakpoint
DROP INDEX IF EXISTS `hkgovCenstatdFeatureReleases_resourceReleaseId_idx`;--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_resourceReleaseId_idx` ON `hkgovCenstatdStatistics` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_open_records_idx` ON `hkgovCenstatdStatistics` (`sourceRecordId`) WHERE "hkgovCenstatdStatistics"."isCurrent" = 1;--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatistics_release_validity_idx` ON `hkgovCenstatdStatistics` (`validFromRelease`,`validToRelease`);--> statement-breakpoint
CREATE INDEX `hkgovCenstatdStatisticsReleaseMemberships_resourceReleaseId_idx` ON `hkgovCenstatdStatisticsReleaseMemberships` (`resourceReleaseId`);