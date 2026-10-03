DROP INDEX IF EXISTS `snapshotRecipes_resourceType_status_idx`;--> statement-breakpoint
CREATE INDEX `snapshotRecipes_resourceType_idx` ON `snapshotRecipes` (`resourceType`);--> statement-breakpoint
ALTER TABLE `snapshotRecipes` DROP COLUMN `status`;--> statement-breakpoint
ALTER TABLE `snapshotRecipes` DROP COLUMN `notes`;