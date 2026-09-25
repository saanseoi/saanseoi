ALTER TABLE `places` RENAME COLUMN `releaseId` TO `resourceReleaseId`;--> statement-breakpoint
DROP INDEX IF EXISTS `places_releaseId_idx`;--> statement-breakpoint
CREATE INDEX `places_resourceReleaseId_idx` ON `places` (`resourceReleaseId`);