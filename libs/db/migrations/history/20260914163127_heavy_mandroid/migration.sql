CREATE TABLE `statsDefinitionSets` (
	`id` text PRIMARY KEY,
	`fieldDefinitionHashes` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `statsRecords` ADD `definitionSetId` text NOT NULL;--> statement-breakpoint
ALTER TABLE `statsRecords` DROP COLUMN `fieldDefinitionHashes`;