ALTER TABLE `datasets` ADD `resourceTypes` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `datasetResourceTypes_resourceType_idx`;--> statement-breakpoint
DROP TABLE `datasetResourceTypes`;