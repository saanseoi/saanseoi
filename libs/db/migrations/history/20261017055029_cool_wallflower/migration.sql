ALTER TABLE `places` ADD `addressRole` text;--> statement-breakpoint
DROP TABLE `placeDivisionDefinitions`;--> statement-breakpoint
ALTER TABLE `places` DROP COLUMN `addressSnapshotId`;--> statement-breakpoint
ALTER TABLE `places` DROP COLUMN `divisionDefinitionSetId`;