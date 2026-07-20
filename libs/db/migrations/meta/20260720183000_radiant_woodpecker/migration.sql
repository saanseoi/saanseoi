DROP INDEX IF EXISTS `apiFieldProvenance_release_field_source_unique_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `apiFieldProvenance_release_field_source_unique_idx` ON `apiFieldProvenance` (`apiReleaseSetId`,`apiField`,`variant`,`sourceDatasetId`,`sourceFieldPath`,`contributionType`,`priority`);
