ALTER TABLE `apiFieldProvenance` ADD `inputs` text NOT NULL;--> statement-breakpoint
ALTER TABLE `apiFieldProvenance` ADD `resolverRules` text NOT NULL;--> statement-breakpoint
DROP INDEX IF EXISTS `apiFieldProvenance_release_field_source_unique_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `apiFieldProvenance_release_field_inputs_unique_idx` ON `apiFieldProvenance` (`apiReleaseSetId`,`apiField`,`variant`,`sourceDatasetId`,`inputs`,`contributionType`,`priority`);--> statement-breakpoint
ALTER TABLE `apiFieldProvenance` DROP COLUMN `sourceFieldPath`;