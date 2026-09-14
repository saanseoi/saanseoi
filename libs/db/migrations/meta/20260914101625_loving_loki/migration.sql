ALTER TABLE `releases` RENAME COLUMN `geometryStatus` TO `legacyGeometryStatus`;--> statement-breakpoint
ALTER TABLE `releases` ADD `geometryStatus` text;--> statement-breakpoint
UPDATE `releases`
SET `geometryStatus` = `legacyGeometryStatus`
WHERE `resourceType` IN ('divisionArea', 'divisionBoundary');--> statement-breakpoint
ALTER TABLE `snapshots` RENAME COLUMN `geometryStatus` TO `legacyGeometryStatus`;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `geometryStatus` text;--> statement-breakpoint
UPDATE `snapshots`
SET `geometryStatus` = `legacyGeometryStatus`
WHERE `resourceType` IN ('divisionArea', 'divisionBoundary');--> statement-breakpoint
ALTER TABLE `sourceReleases` RENAME COLUMN `geometryStatus` TO `legacyGeometryStatus`;
