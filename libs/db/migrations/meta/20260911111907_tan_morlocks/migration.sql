ALTER TABLE `apiFieldProvenance` ADD `resourceType` text NOT NULL;--> statement-breakpoint
ALTER TABLE `apiReleaseSets` ADD `publisherFields` text;--> statement-breakpoint
DROP INDEX IF EXISTS `apiFieldProvenance_release_field_inputs_unique_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `apiFieldProvenance_release_resource_field_inputs_unique_idx` ON `apiFieldProvenance` (`apiReleaseSetId`,`resourceType`,`apiField`,`variant`,`sourceDatasetId`,`inputs`,`contributionType`,`priority`);