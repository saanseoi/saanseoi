CREATE TABLE `publisherI18n` (
	`publisherId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `publisherI18n_pk` PRIMARY KEY(`publisherId`, `locale`),
	CONSTRAINT `fk_publisherI18n_publisherId_publishers_id_fk` FOREIGN KEY (`publisherId`) REFERENCES `publishers`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `publishers` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`url` text,
	`contactUrl` text,
	`contactEmail` text,
	`contactPhone` text,
	`parentPublisherId` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `publishers_parentPublisherId_publishers_id_fk` FOREIGN KEY (`parentPublisherId`) REFERENCES `publishers`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `licenses` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`url` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `datasetI18n` (
	`datasetId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `datasetI18n_pk` PRIMARY KEY(`datasetId`, `locale`),
	CONSTRAINT `fk_datasetI18n_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `datasets` (
	`id` text PRIMARY KEY,
	`publisherId` text NOT NULL,
	`code` text NOT NULL,
	`regionCode` text NOT NULL,
	`releaseType` text NOT NULL,
	`releaseFrequency` text NOT NULL,
	`theme` text NOT NULL,
	`type` text NOT NULL,
	`sourceUrl` text,
	`licenseId` text,
	`category` text,
	`attribution` text,
	`tags` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_datasets_publisherId_publishers_id_fk` FOREIGN KEY (`publisherId`) REFERENCES `publishers`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_datasets_licenseId_licenses_id_fk` FOREIGN KEY (`licenseId`) REFERENCES `licenses`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY,
	`datasetId` text NOT NULL,
	`code` text NOT NULL UNIQUE,
	`sourceVersion` text NOT NULL,
	`sourceSchemaVersion` text,
	`publicationDate` text,
	`snapshotMonth` text,
	`rawObjectKey` text,
	`originalFileName` text,
	`status` text NOT NULL,
	`revokedAt` integer,
	`revocationReason` text,
	`supersededByReleaseId` text,
	`ingestedAt` integer,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_releases_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `releases_supersededByReleaseId_releases_id_fk` FOREIGN KEY (`supersededByReleaseId`) REFERENCES `releases`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `apiEndpointDatasets` (
	`apiEndpointId` text NOT NULL,
	`datasetId` text NOT NULL,
	`usageType` text NOT NULL,
	`required` integer DEFAULT false NOT NULL,
	`notes` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `apiEndpointDatasets_pk` PRIMARY KEY(`apiEndpointId`, `datasetId`),
	CONSTRAINT `fk_apiEndpointDatasets_apiEndpointId_apiEndpoints_id_fk` FOREIGN KEY (`apiEndpointId`) REFERENCES `apiEndpoints`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apiEndpointDatasets_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `apiEndpoints` (
	`id` text PRIMARY KEY,
	`apiVersionId` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`operationId` text NOT NULL UNIQUE,
	`resourceType` text NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_apiEndpoints_apiVersionId_apiVersions_id_fk` FOREIGN KEY (`apiVersionId`) REFERENCES `apiVersions`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `apiFieldProvenance` (
	`id` text PRIMARY KEY,
	`apiReleaseSetId` text NOT NULL,
	`apiField` text NOT NULL,
	`sourceDatasetId` text NOT NULL,
	`sourceFieldPath` text NOT NULL,
	`resolverCode` text NOT NULL,
	`contributionType` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`confidence` real,
	`sourceIdentifierPaths` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_apiFieldProvenance_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apiFieldProvenance_sourceDatasetId_datasets_id_fk` FOREIGN KEY (`sourceDatasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `apiReleaseSetMembers` (
	`apiReleaseSetId` text NOT NULL,
	`datasetId` text NOT NULL,
	`releaseId` text NOT NULL,
	`role` text NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `apiReleaseSetMembers_pk` PRIMARY KEY(`apiReleaseSetId`, `releaseId`),
	CONSTRAINT `fk_apiReleaseSetMembers_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apiReleaseSetMembers_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `apiReleaseSetMembers_releaseId_datasetId_releases_id_datasetId_fk` FOREIGN KEY (`releaseId`,`datasetId`) REFERENCES `releases`(`id`,`datasetId`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `apiReleaseSets` (
	`id` text PRIMARY KEY,
	`apiVersionId` text NOT NULL,
	`code` text NOT NULL,
	`canonicalSchemaVersion` text NOT NULL,
	`canonicalLogicVersion` text NOT NULL,
	`status` text NOT NULL,
	`publishedAt` integer,
	`validFrom` integer,
	`validTo` integer,
	`notes` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_apiReleaseSets_apiVersionId_apiVersions_id_fk` FOREIGN KEY (`apiVersionId`) REFERENCES `apiVersions`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `apiVersions` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`status` text NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dataShards` (
	`id` text PRIMARY KEY,
	`kind` text NOT NULL,
	`regionCode` text,
	`year` text,
	`environment` text NOT NULL,
	`databaseName` text NOT NULL,
	`databaseId` text NOT NULL,
	`bindingName` text NOT NULL UNIQUE,
	`status` text NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `releaseSetShardAssignments` (
	`apiReleaseSetId` text NOT NULL,
	`dataShardId` text NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `releaseSetShardAssignments_pk` PRIMARY KEY(`apiReleaseSetId`, `dataShardId`),
	CONSTRAINT `fk_releaseSetShardAssignments_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_releaseSetShardAssignments_dataShardId_dataShards_id_fk` FOREIGN KEY (`dataShardId`) REFERENCES `dataShards`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `releaseShardAssignments` (
	`releaseId` text NOT NULL,
	`dataShardId` text NOT NULL,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `releaseShardAssignments_pk` PRIMARY KEY(`releaseId`, `dataShardId`),
	CONSTRAINT `fk_releaseShardAssignments_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_releaseShardAssignments_dataShardId_dataShards_id_fk` FOREIGN KEY (`dataShardId`) REFERENCES `dataShards`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `entityAliases` (
	`aliasId` text PRIMARY KEY,
	`entityType` text NOT NULL,
	`aliasValue` text NOT NULL,
	`canonicalId` text NOT NULL,
	`sourceSystem` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`validFromMonth` text,
	`validToMonth` text,
	`notes` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ingestRuns` (
	`runId` text PRIMARY KEY,
	`releaseId` text NOT NULL,
	`phase` text NOT NULL,
	`status` text NOT NULL,
	`stats` text,
	`error` text,
	`startedAt` text NOT NULL,
	`finishedAt` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_ingestRuns_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ingestRuns_release_phase_unique_idx` ON `ingestRuns` (`releaseId`,`phase`);--> statement-breakpoint
CREATE TABLE `stats` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`releaseId` text NOT NULL,
	`dimension` text NOT NULL,
	`metric` text NOT NULL,
	`metricUnit` text NOT NULL,
	`value` real NOT NULL,
	`groupBy` text,
	`groupValue` text,
	`createdAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updatedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_stats_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`)
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	CONSTRAINT `fk_account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `newsletterSubscription` (
	`email` text PRIMARY KEY,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`subscribed_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL UNIQUE,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	CONSTRAINT `fk_session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`email` text NOT NULL UNIQUE,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`substack` text,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `publisherI18n_locale_idx` ON `publisherI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `publishers_parentPublisherId_idx` ON `publishers` (`parentPublisherId`);--> statement-breakpoint
CREATE INDEX `datasetI18n_locale_idx` ON `datasetI18n` (`locale`);--> statement-breakpoint
CREATE UNIQUE INDEX `datasets_publisherId_code_unique_idx` ON `datasets` (`publisherId`,`code`);--> statement-breakpoint
CREATE INDEX `datasets_region_theme_type_idx` ON `datasets` (`regionCode`,`theme`,`type`);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_datasetId_sourceVersion_unique_idx` ON `releases` (`datasetId`,`sourceVersion`);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_id_datasetId_unique_idx` ON `releases` (`id`,`datasetId`);--> statement-breakpoint
CREATE INDEX `releases_status_idx` ON `releases` (`status`);--> statement-breakpoint
CREATE INDEX `releases_supersededByReleaseId_idx` ON `releases` (`supersededByReleaseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiEndpoints_apiVersion_method_path_unique_idx` ON `apiEndpoints` (`apiVersionId`,`method`,`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiFieldProvenance_release_field_source_unique_idx` ON `apiFieldProvenance` (`apiReleaseSetId`,`apiField`,`sourceDatasetId`,`sourceFieldPath`,`contributionType`,`priority`);--> statement-breakpoint
CREATE INDEX `apiFieldProvenance_release_field_idx` ON `apiFieldProvenance` (`apiReleaseSetId`,`apiField`);--> statement-breakpoint
CREATE INDEX `apiReleaseSetMembers_datasetId_idx` ON `apiReleaseSetMembers` (`datasetId`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiReleaseSets_apiVersionId_code_unique_idx` ON `apiReleaseSets` (`apiVersionId`,`code`);--> statement-breakpoint
CREATE INDEX `apiReleaseSets_status_idx` ON `apiReleaseSets` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_kind_region_year_env_unique_idx` ON `dataShards` (`kind`,`regionCode`,`year`,`environment`);--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_kind_env_unscoped_unique_idx` ON `dataShards` (`kind`,`environment`) WHERE "dataShards"."regionCode" is null and "dataShards"."year" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_kind_region_env_unique_idx` ON `dataShards` (`kind`,`regionCode`,`environment`) WHERE "dataShards"."regionCode" is not null and "dataShards"."year" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_kind_year_env_unique_idx` ON `dataShards` (`kind`,`year`,`environment`) WHERE "dataShards"."regionCode" is null and "dataShards"."year" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_kind_region_year_env_scoped_unique_idx` ON `dataShards` (`kind`,`regionCode`,`year`,`environment`) WHERE "dataShards"."regionCode" is not null and "dataShards"."year" is not null;--> statement-breakpoint
CREATE INDEX `releaseSetShardAssignments_dataShardId_idx` ON `releaseSetShardAssignments` (`dataShardId`);--> statement-breakpoint
CREATE UNIQUE INDEX `entityAliases_entityType_aliasValue_unique_idx` ON `entityAliases` (`entityType`,`aliasValue`);--> statement-breakpoint
CREATE INDEX `entityAliases_canonical_lookup_idx` ON `entityAliases` (`entityType`,`canonicalId`);--> statement-breakpoint
CREATE INDEX `stats_releaseId_idx` ON `stats` (`releaseId`);--> statement-breakpoint
CREATE INDEX `stats_dimension_idx` ON `stats` (`type`,`dimension`,`metric`,`groupBy`,`groupValue`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `newsletterSubscription_status_idx` ON `newsletterSubscription` (`status`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);
