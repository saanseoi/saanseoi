CREATE TABLE `publisherI18n` (
	`publisherId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
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
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `publishers_parentPublisherId_publishers_id_fk` FOREIGN KEY (`parentPublisherId`) REFERENCES `publishers`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `licenses` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`name` text NOT NULL,
	`url` text,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `datasetI18n` (
	`datasetId` text NOT NULL,
	`locale` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `datasetI18n_pk` PRIMARY KEY(`datasetId`, `locale`),
	CONSTRAINT `fk_datasetI18n_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `datasetResourceTypes` (
	`datasetId` text NOT NULL,
	`resourceType` text NOT NULL,
	CONSTRAINT `datasetResourceTypes_pk` PRIMARY KEY(`datasetId`, `resourceType`),
	CONSTRAINT `fk_datasetResourceTypes_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `datasetTransforms` (
	`datasetId` text NOT NULL,
	`code` text NOT NULL,
	`resourceType` text NOT NULL,
	`sourceVersion` text NOT NULL,
	`outputVariant` text NOT NULL,
	`derivation` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `datasetTransforms_pk` PRIMARY KEY(`datasetId`, `code`),
	CONSTRAINT `fk_datasetTransforms_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE CASCADE
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
	`sourceVariant` text DEFAULT 'default' NOT NULL,
	`sourceCrs` text,
	`sourceUrl` text,
	`licenseId` text,
	`category` text,
	`attribution` text,
	`tags` text,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_datasets_publisherId_publishers_id_fk` FOREIGN KEY (`publisherId`) REFERENCES `publishers`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_datasets_licenseId_licenses_id_fk` FOREIGN KEY (`licenseId`) REFERENCES `licenses`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `releases` (
	`id` text PRIMARY KEY,
	`datasetId` text NOT NULL,
	`code` text NOT NULL UNIQUE,
	`resourceType` text NOT NULL,
	`sourceVersion` text NOT NULL,
	`sourceSchemaVersion` text,
	`publicationDate` text,
	`cohortKey` text,
	`rawObjectKey` text,
	`originalFileName` text,
	`releaseNotesUrl` text,
	`notes` text,
	`status` text NOT NULL,
	`revokedAt` text,
	`revocationReason` text,
	`supersededByReleaseId` text,
	`ingestedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_releases_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `releases_supersededByReleaseId_releases_id_fk` FOREIGN KEY (`supersededByReleaseId`) REFERENCES `releases`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `apiCatalogRevisionReleaseSets` (
	`apiCatalogRevisionId` text NOT NULL,
	`apiReleaseSetId` text NOT NULL,
	`domainCode` text NOT NULL,
	`cohortKey` text NOT NULL,
	`isDefault` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `apiCatalogRevisionReleaseSets_pk` PRIMARY KEY(`apiCatalogRevisionId`, `domainCode`, `cohortKey`),
	CONSTRAINT `fk_apiCatalogRevisionReleaseSets_apiCatalogRevisionId_apiCatalogRevisions_id_fk` FOREIGN KEY (`apiCatalogRevisionId`) REFERENCES `apiCatalogRevisions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apiCatalogRevisionReleaseSets_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `apiCatalogRevisions` (
	`id` text PRIMARY KEY,
	`apiVersionId` text NOT NULL,
	`code` text NOT NULL UNIQUE,
	`regionCode` text NOT NULL,
	`publicationDate` text NOT NULL,
	`revision` integer NOT NULL,
	`defaultDomainCode` text,
	`status` text NOT NULL,
	`publishedAt` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_apiCatalogRevisions_apiVersionId_apiVersions_id_fk` FOREIGN KEY (`apiVersionId`) REFERENCES `apiVersions`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `apiComposition` (
	`id` text PRIMARY KEY,
	`apiVersionId` text NOT NULL,
	`code` text NOT NULL UNIQUE,
	`version` integer NOT NULL,
	`primaryResourceType` text NOT NULL,
	`defaultDomainCode` text,
	`i18n` text,
	`status` text NOT NULL,
	`notes` text,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_apiComposition_apiVersionId_apiVersions_id_fk` FOREIGN KEY (`apiVersionId`) REFERENCES `apiVersions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `apiCompositionMembers` (
	`apiCompositionId` text NOT NULL,
	`domainCode` text DEFAULT 'default' NOT NULL,
	`resourceType` text NOT NULL,
	`variant` text DEFAULT 'default' NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`cohortMatchingMode` text NOT NULL,
	`anchorResourceType` text,
	`maxLagDays` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`configJson` text,
	CONSTRAINT `apiCompositionMembers_pk` PRIMARY KEY(`apiCompositionId`, `domainCode`, `resourceType`, `variant`),
	CONSTRAINT `fk_apiCompositionMembers_apiCompositionId_apiComposition_id_fk` FOREIGN KEY (`apiCompositionId`) REFERENCES `apiComposition`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `apiEndpoints` (
	`id` text PRIMARY KEY,
	`apiVersionId` text NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`operationId` text NOT NULL UNIQUE,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_apiEndpoints_apiVersionId_apiVersions_id_fk` FOREIGN KEY (`apiVersionId`) REFERENCES `apiVersions`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `apiFieldProvenance` (
	`id` text PRIMARY KEY,
	`apiReleaseSetId` text NOT NULL,
	`apiField` text NOT NULL,
	`variant` text,
	`sourceDatasetId` text NOT NULL,
	`sourceFieldPath` text NOT NULL,
	`resolverCode` text NOT NULL,
	`contributionType` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`confidence` real,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_apiFieldProvenance_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apiFieldProvenance_sourceDatasetId_datasets_id_fk` FOREIGN KEY (`sourceDatasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `apiReleaseSetSnapshots` (
	`apiReleaseSetId` text NOT NULL,
	`snapshotId` text NOT NULL,
	`variant` text DEFAULT 'default' NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`cohortMatchingMode` text NOT NULL,
	`anchorSnapshotId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `apiReleaseSetSnapshots_pk` PRIMARY KEY(`apiReleaseSetId`, `snapshotId`, `variant`),
	CONSTRAINT `fk_apiReleaseSetSnapshots_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apiReleaseSetSnapshots_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_apiReleaseSetSnapshots_anchorSnapshotId_snapshots_id_fk` FOREIGN KEY (`anchorSnapshotId`) REFERENCES `snapshots`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `apiReleaseSets` (
	`id` text PRIMARY KEY,
	`apiVersionId` text NOT NULL,
	`apiCompositionId` text,
	`code` text NOT NULL,
	`regionCode` text,
	`domainCode` text DEFAULT 'default' NOT NULL,
	`cohortKey` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`effectiveFrom` text,
	`effectiveTo` text,
	`supersedesApiReleaseSetId` text,
	`schemaVersion` text NOT NULL,
	`rulesetVersion` text NOT NULL,
	`status` text NOT NULL,
	`publishedAt` text,
	`validFrom` text,
	`validTo` text,
	`notes` text,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_apiReleaseSets_apiVersionId_apiVersions_id_fk` FOREIGN KEY (`apiVersionId`) REFERENCES `apiVersions`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_apiReleaseSets_apiCompositionId_apiComposition_id_fk` FOREIGN KEY (`apiCompositionId`) REFERENCES `apiComposition`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `apiVersions` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`familyType` text NOT NULL,
	`version` text NOT NULL,
	`status` text NOT NULL,
	`publishedAt` text,
	`deprecatedAt` text,
	`retiredAt` text,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `publishedDataJournal` (
	`id` text PRIMARY KEY,
	`releaseId` text NOT NULL,
	`relatedReleaseId` text,
	`snapshotId` text,
	`apiReleaseSetId` text,
	`action` text NOT NULL,
	`statusFrom` text,
	`statusTo` text,
	`reason` text,
	`metadataJson` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_publishedDataJournal_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_publishedDataJournal_relatedReleaseId_releases_id_fk` FOREIGN KEY (`relatedReleaseId`) REFERENCES `releases`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_publishedDataJournal_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_publishedDataJournal_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `snapshotAssembly` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`resourceType` text NOT NULL,
	`version` integer NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshotAssemblyRuns` (
	`id` text PRIMARY KEY,
	`snapshotId` text NOT NULL,
	`snapshotAssemblyId` text NOT NULL,
	`anchorReleaseId` text,
	`anchorCohortKey` text,
	`status` text NOT NULL,
	`selectionSummaryJson` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_snapshotAssemblyRuns_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotAssemblyRuns_snapshotAssemblyId_snapshotAssembly_id_fk` FOREIGN KEY (`snapshotAssemblyId`) REFERENCES `snapshotAssembly`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `snapshotAssemblySources` (
	`snapshotAssemblyId` text NOT NULL,
	`datasetId` text NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`selectorType` text NOT NULL,
	`anchorDatasetId` text,
	`maxLagDays` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`configJson` text,
	CONSTRAINT `snapshotAssemblySources_pk` PRIMARY KEY(`snapshotAssemblyId`, `datasetId`, `role`),
	CONSTRAINT `fk_snapshotAssemblySources_snapshotAssemblyId_snapshotAssembly_id_fk` FOREIGN KEY (`snapshotAssemblyId`) REFERENCES `snapshotAssembly`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotAssemblySources_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_snapshotAssemblySources_anchorDatasetId_datasets_id_fk` FOREIGN KEY (`anchorDatasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `snapshotLineages` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`regionCode` text NOT NULL,
	`resourceType` text NOT NULL,
	`variant` text DEFAULT 'default' NOT NULL,
	`identityMode` text NOT NULL,
	`primaryDatasetId` text,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_snapshotLineages_primaryDatasetId_datasets_id_fk` FOREIGN KEY (`primaryDatasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `snapshotSources` (
	`snapshotId` text NOT NULL,
	`datasetId` text NOT NULL,
	`sourceReleaseId` text NOT NULL,
	`role` text NOT NULL,
	`selectedByRule` text,
	`selectionMode` text,
	`anchorReleaseId` text,
	`sourceCohortKey` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `snapshotSources_pk` PRIMARY KEY(`snapshotId`, `sourceReleaseId`),
	CONSTRAINT `fk_snapshotSources_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotSources_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `snapshotSources_sourceReleaseId_datasetId_releases_id_datasetId_fk` FOREIGN KEY (`sourceReleaseId`,`datasetId`) REFERENCES `releases`(`id`,`datasetId`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY,
	`snapshotLineageId` text,
	`parentSnapshotId` text,
	`resourceType` text NOT NULL,
	`code` text NOT NULL,
	`cohortKey` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`publishedAt` text,
	`validFrom` text,
	`validTo` text,
	`notes` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_snapshots_snapshotLineageId_snapshotLineages_id_fk` FOREIGN KEY (`snapshotLineageId`) REFERENCES `snapshotLineages`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `dataShards` (
	`id` text PRIMARY KEY,
	`shardType` text NOT NULL,
	`regionCode` text,
	`year` text,
	`environment` text NOT NULL,
	`databaseName` text NOT NULL,
	`databaseId` text NOT NULL,
	`bindingName` text NOT NULL UNIQUE,
	`status` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `releaseSetShardAssignments` (
	`apiReleaseSetId` text NOT NULL,
	`dataShardId` text NOT NULL,
	CONSTRAINT `releaseSetShardAssignments_pk` PRIMARY KEY(`apiReleaseSetId`, `dataShardId`),
	CONSTRAINT `fk_releaseSetShardAssignments_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_releaseSetShardAssignments_dataShardId_dataShards_id_fk` FOREIGN KEY (`dataShardId`) REFERENCES `dataShards`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `releaseShardAssignments` (
	`releaseId` text NOT NULL,
	`dataShardId` text NOT NULL,
	CONSTRAINT `releaseShardAssignments_pk` PRIMARY KEY(`releaseId`, `dataShardId`),
	CONSTRAINT `fk_releaseShardAssignments_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_releaseShardAssignments_dataShardId_dataShards_id_fk` FOREIGN KEY (`dataShardId`) REFERENCES `dataShards`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `snapshotShardAssignments` (
	`snapshotId` text NOT NULL,
	`dataShardId` text NOT NULL,
	CONSTRAINT `snapshotShardAssignments_pk` PRIMARY KEY(`snapshotId`, `dataShardId`),
	CONSTRAINT `fk_snapshotShardAssignments_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotShardAssignments_dataShardId_dataShards_id_fk` FOREIGN KEY (`dataShardId`) REFERENCES `dataShards`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `entityAliases` (
	`aliasId` text PRIMARY KEY,
	`entityType` text NOT NULL,
	`aliasValue` text NOT NULL,
	`canonicalId` text NOT NULL,
	`sourceSystem` text NOT NULL,
	`isCurrent` integer NOT NULL,
	`notes` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
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
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_ingestRuns_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`)
);
--> statement-breakpoint
CREATE TABLE `releaseProcessingActions` (
	`id` text PRIMARY KEY,
	`releaseId` text NOT NULL,
	`action` text NOT NULL,
	`mode` text NOT NULL,
	`summary` text NOT NULL,
	`affectedRecordCount` integer NOT NULL,
	`evidence` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_releaseProcessingActions_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `stats` (
	`id` text PRIMARY KEY,
	`type` text NOT NULL,
	`releaseId` text,
	`snapshotId` text,
	`apiReleaseSetId` text,
	`dimension` text NOT NULL,
	`metric` text NOT NULL,
	`metricUnit` text NOT NULL,
	`value` real NOT NULL,
	`groupBy` text,
	`groupValue` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_stats_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`),
	CONSTRAINT `fk_stats_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_stats_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT "stats_owner_chk" CHECK("releaseId" IS NOT NULL OR "snapshotId" IS NOT NULL OR "apiReleaseSetId" IS NOT NULL)
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
CREATE TABLE `api_key` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`key_digest` text NOT NULL UNIQUE,
	`requests_per_minute` integer,
	`requests_per_day` integer,
	`requests_per_month` integer,
	`last_used_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `fk_api_key_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `api_key_usage` (
	`api_key_id` text NOT NULL,
	`window` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`soft_limit_notified_at` integer,
	CONSTRAINT `api_key_usage_pk` PRIMARY KEY(`api_key_id`, `window`, `window_started_at`),
	CONSTRAINT `fk_api_key_usage_api_key_id_api_key_id_fk` FOREIGN KEY (`api_key_id`) REFERENCES `api_key`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `newsletterSubscription` (
	`email` text PRIMARY KEY,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_error` text,
	`subscribed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
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
	`locale` text,
	`role` text DEFAULT 'user' NOT NULL,
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
CREATE TABLE `identifierBridges` (
	`resourceType` text NOT NULL,
	`cohortKey` text NOT NULL,
	`domain` text NOT NULL,
	`authority` text NOT NULL,
	`externalId` text NOT NULL,
	`externalCode` text,
	`canonicalId` text NOT NULL,
	`sourceDatasetCode` text NOT NULL,
	`sourceReleaseCode` text NOT NULL,
	`mappingMethod` text NOT NULL,
	`reviewStatus` text NOT NULL,
	`identifiers` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `identifierBridges_pk` PRIMARY KEY(`resourceType`, `cohortKey`, `domain`, `authority`, `externalId`)
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY,
	`datasetId` text,
	`releaseId` text,
	`sourceRecordId` text,
	`assetKey` text NOT NULL,
	`contentHash` text NOT NULL,
	`byteLength` integer NOT NULL,
	`mediaType` text NOT NULL,
	`role` text NOT NULL,
	`originalUrl` text,
	`sourcePageLocale` text,
	`sourcePageUrl` text,
	`retrievedAt` text NOT NULL,
	`manifest` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_assets_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_assets_releaseId_releases_id_fk` FOREIGN KEY (`releaseId`) REFERENCES `releases`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX `publisherI18n_locale_idx` ON `publisherI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `publishers_parentPublisherId_idx` ON `publishers` (`parentPublisherId`);--> statement-breakpoint
CREATE INDEX `datasetI18n_locale_idx` ON `datasetI18n` (`locale`);--> statement-breakpoint
CREATE INDEX `datasetResourceTypes_resourceType_idx` ON `datasetResourceTypes` (`resourceType`);--> statement-breakpoint
CREATE UNIQUE INDEX `datasetTransforms_outputVariant_unique_idx` ON `datasetTransforms` (`outputVariant`);--> statement-breakpoint
CREATE INDEX `datasetTransforms_resourceType_idx` ON `datasetTransforms` (`resourceType`);--> statement-breakpoint
CREATE UNIQUE INDEX `datasets_publisherId_code_unique_idx` ON `datasets` (`publisherId`,`code`);--> statement-breakpoint
CREATE INDEX `datasets_region_theme_idx` ON `datasets` (`regionCode`,`theme`);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_datasetId_resourceType_sourceVersion_unique_idx` ON `releases` (`datasetId`,`resourceType`,`sourceVersion`);--> statement-breakpoint
CREATE UNIQUE INDEX `releases_id_datasetId_unique_idx` ON `releases` (`id`,`datasetId`);--> statement-breakpoint
CREATE INDEX `releases_status_idx` ON `releases` (`status`);--> statement-breakpoint
CREATE INDEX `releases_supersededByReleaseId_idx` ON `releases` (`supersededByReleaseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiCatalogRevisionReleaseSets_release_unique_idx` ON `apiCatalogRevisionReleaseSets` (`apiCatalogRevisionId`,`apiReleaseSetId`);--> statement-breakpoint
CREATE INDEX `apiCatalogRevisionReleaseSets_release_idx` ON `apiCatalogRevisionReleaseSets` (`apiReleaseSetId`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiCatalogRevisions_scope_publication_revision_unique_idx` ON `apiCatalogRevisions` (`apiVersionId`,`regionCode`,`publicationDate`,`revision`);--> statement-breakpoint
CREATE INDEX `apiCatalogRevisions_scope_published_idx` ON `apiCatalogRevisions` (`apiVersionId`,`regionCode`,`publishedAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiComposition_apiVersionId_version_unique_idx` ON `apiComposition` (`apiVersionId`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiEndpoints_apiVersion_method_path_unique_idx` ON `apiEndpoints` (`apiVersionId`,`method`,`path`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiFieldProvenance_release_field_source_unique_idx` ON `apiFieldProvenance` (`apiReleaseSetId`,`apiField`,`variant`,`sourceDatasetId`,`sourceFieldPath`,`contributionType`,`priority`);--> statement-breakpoint
CREATE INDEX `apiFieldProvenance_release_field_idx` ON `apiFieldProvenance` (`apiReleaseSetId`,`apiField`);--> statement-breakpoint
CREATE INDEX `apiReleaseSetSnapshots_snapshotId_idx` ON `apiReleaseSetSnapshots` (`snapshotId`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiReleaseSets_apiVersionId_code_unique_idx` ON `apiReleaseSets` (`apiVersionId`,`code`);--> statement-breakpoint
CREATE INDEX `apiReleaseSets_status_idx` ON `apiReleaseSets` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiReleaseSets_domain_cohort_revision_unique_idx` ON `apiReleaseSets` (`apiVersionId`,`regionCode`,`domainCode`,`cohortKey`,`revision`);--> statement-breakpoint
CREATE INDEX `apiVersions_familyType_status_idx` ON `apiVersions` (`familyType`,`status`);--> statement-breakpoint
CREATE INDEX `publishedDataJournal_releaseId_idx` ON `publishedDataJournal` (`releaseId`);--> statement-breakpoint
CREATE INDEX `publishedDataJournal_relatedReleaseId_idx` ON `publishedDataJournal` (`relatedReleaseId`);--> statement-breakpoint
CREATE INDEX `publishedDataJournal_action_idx` ON `publishedDataJournal` (`action`);--> statement-breakpoint
CREATE INDEX `snapshotAssembly_resourceType_status_idx` ON `snapshotAssembly` (`resourceType`,`status`);--> statement-breakpoint
CREATE INDEX `snapshotAssemblyRuns_snapshotId_idx` ON `snapshotAssemblyRuns` (`snapshotId`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshotLineages_primaryDataset_resourceType_variant_unique_idx` ON `snapshotLineages` (`primaryDatasetId`,`resourceType`,`variant`);--> statement-breakpoint
CREATE INDEX `snapshotLineages_region_resource_variant_idx` ON `snapshotLineages` (`regionCode`,`resourceType`,`variant`);--> statement-breakpoint
CREATE INDEX `snapshotSources_datasetId_idx` ON `snapshotSources` (`datasetId`);--> statement-breakpoint
CREATE INDEX `snapshotSources_sourceReleaseId_idx` ON `snapshotSources` (`sourceReleaseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_resourceType_code_unique_idx` ON `snapshots` (`resourceType`,`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_id_resourceType_unique_idx` ON `snapshots` (`id`,`resourceType`);--> statement-breakpoint
CREATE INDEX `snapshots_resourceType_status_idx` ON `snapshots` (`resourceType`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_lineage_cohort_revision_unique_idx` ON `snapshots` (`snapshotLineageId`,`cohortKey`,`revision`);--> statement-breakpoint
CREATE INDEX `snapshots_parentSnapshotId_idx` ON `snapshots` (`parentSnapshotId`);--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_shardType_region_year_env_unique_idx` ON `dataShards` (`shardType`,`regionCode`,`year`,`environment`);--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_shardType_env_unscoped_unique_idx` ON `dataShards` (`shardType`,`environment`) WHERE "dataShards"."regionCode" is null and "dataShards"."year" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_shardType_region_env_unique_idx` ON `dataShards` (`shardType`,`regionCode`,`environment`) WHERE "dataShards"."regionCode" is not null and "dataShards"."year" is null;--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_shardType_year_env_unique_idx` ON `dataShards` (`shardType`,`year`,`environment`) WHERE "dataShards"."regionCode" is null and "dataShards"."year" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX `dataShards_shardType_region_year_env_scoped_unique_idx` ON `dataShards` (`shardType`,`regionCode`,`year`,`environment`) WHERE "dataShards"."regionCode" is not null and "dataShards"."year" is not null;--> statement-breakpoint
CREATE INDEX `releaseSetShardAssignments_dataShardId_idx` ON `releaseSetShardAssignments` (`dataShardId`);--> statement-breakpoint
CREATE INDEX `snapshotShardAssignments_dataShardId_idx` ON `snapshotShardAssignments` (`dataShardId`);--> statement-breakpoint
CREATE UNIQUE INDEX `entityAliases_entityType_aliasValue_unique_idx` ON `entityAliases` (`entityType`,`aliasValue`);--> statement-breakpoint
CREATE INDEX `entityAliases_canonical_lookup_idx` ON `entityAliases` (`entityType`,`canonicalId`);--> statement-breakpoint
CREATE UNIQUE INDEX `ingestRuns_release_phase_unique_idx` ON `ingestRuns` (`releaseId`,`phase`);--> statement-breakpoint
CREATE INDEX `releaseProcessingActions_releaseId_idx` ON `releaseProcessingActions` (`releaseId`);--> statement-breakpoint
CREATE INDEX `releaseProcessingActions_action_idx` ON `releaseProcessingActions` (`action`,`mode`);--> statement-breakpoint
CREATE INDEX `stats_releaseId_idx` ON `stats` (`releaseId`);--> statement-breakpoint
CREATE INDEX `stats_snapshotId_idx` ON `stats` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `stats_apiReleaseSetId_idx` ON `stats` (`apiReleaseSetId`);--> statement-breakpoint
CREATE INDEX `stats_dimension_idx` ON `stats` (`type`,`dimension`,`metric`,`groupBy`,`groupValue`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `api_key_userId_idx` ON `api_key` (`user_id`);--> statement-breakpoint
CREATE INDEX `api_key_userId_revokedAt_idx` ON `api_key` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `newsletterSubscription_status_idx` ON `newsletterSubscription` (`status`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `identifierBridges_canonicalId_idx` ON `identifierBridges` (`canonicalId`);--> statement-breakpoint
CREATE INDEX `identifierBridges_sourceReleaseCode_idx` ON `identifierBridges` (`sourceReleaseCode`);--> statement-breakpoint
CREATE UNIQUE INDEX `assets_assetKey_unique_idx` ON `assets` (`assetKey`);--> statement-breakpoint
CREATE INDEX `assets_contentHash_idx` ON `assets` (`contentHash`);--> statement-breakpoint
CREATE INDEX `assets_datasetId_idx` ON `assets` (`datasetId`);--> statement-breakpoint
CREATE INDEX `assets_releaseId_idx` ON `assets` (`releaseId`);--> statement-breakpoint
CREATE INDEX `assets_sourceRecordId_idx` ON `assets` (`sourceRecordId`);