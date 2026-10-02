ALTER TABLE `assets` ADD `sourceAssetId` text REFERENCES assets(id) ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX `assets_sourceAssetId_idx` ON `assets` (`sourceAssetId`);--> statement-breakpoint
ALTER TABLE `assets` DROP COLUMN `manifest`;