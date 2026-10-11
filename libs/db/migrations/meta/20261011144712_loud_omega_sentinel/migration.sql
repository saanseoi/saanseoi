CREATE TABLE `publishers` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`url` text,
	`contactUrl` text,
	`contactEmail` text,
	`contactPhone` text,
	`parentPublisherId` text,
	`i18n` text DEFAULT '{}' NOT NULL,
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
CREATE TABLE `units` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`dimension` text NOT NULL,
	`symbol` text NOT NULL,
	`i18n` text DEFAULT '{}' NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
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
	CONSTRAINT `datasetTransforms_pk` PRIMARY KEY(`datasetId`, `code`, `sourceVersion`),
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
	`resourceTypes` text DEFAULT '[]' NOT NULL,
	`kind` text,
	`sourceVariant` text DEFAULT 'default' NOT NULL,
	`sourceCrs` text,
	`sourceUrl` text,
	`schemaURL` text,
	`licenseId` text,
	`category` text,
	`attribution` text,
	`tags` text,
	`processingRules` text,
	`i18n` text DEFAULT '{}' NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_datasets_publisherId_publishers_id_fk` FOREIGN KEY (`publisherId`) REFERENCES `publishers`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_datasets_licenseId_licenses_id_fk` FOREIGN KEY (`licenseId`) REFERENCES `licenses`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `processingRuleDefinitions` (
	`id` text PRIMARY KEY,
	`definition` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resourceReleases` (
	`id` text PRIMARY KEY,
	`sourceReleaseId` text NOT NULL,
	`datasetId` text NOT NULL,
	`code` text NOT NULL UNIQUE,
	`resourceType` text NOT NULL,
	`sourceVersion` text NOT NULL,
	`sourceSchemaVersion` text,
	`publicationDate` text,
	`cohortKey` text,
	`geometryStatus` text,
	`releaseNotesUrl` text,
	`status` text NOT NULL,
	`processingRules` text,
	`ingestedAt` text,
	`revokedAt` text,
	`revocationReason` text,
	`supersededByResourceReleaseId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_resourceReleases_sourceReleaseId_sourceReleases_id_fk` FOREIGN KEY (`sourceReleaseId`) REFERENCES `sourceReleases`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_resourceReleases_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `resourceReleases_supersededByResourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`supersededByResourceReleaseId`) REFERENCES `resourceReleases`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `sourceReleases` (
	`id` text PRIMARY KEY,
	`datasetId` text NOT NULL,
	`code` text NOT NULL UNIQUE,
	`sourceVersion` text NOT NULL,
	`expectedResourceTypes` text DEFAULT '[]' NOT NULL,
	`sourceSchemaVersion` text,
	`publicationDate` text,
	`cohortKey` text,
	`releaseNotesUrl` text,
	`notes` text,
	`status` text NOT NULL,
	`processingRules` text,
	`ingestedAt` text,
	`revokedAt` text,
	`revocationReason` text,
	`supersededBySourceReleaseId` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_sourceReleases_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `sourceReleases_supersededBySourceReleaseId_sourceReleases_id_fk` FOREIGN KEY (`supersededBySourceReleaseId`) REFERENCES `sourceReleases`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `apiCatalogRevisionReleaseSets` (
	`apiCatalogRevisionId` text NOT NULL,
	`apiVersionReleaseSetId` text NOT NULL,
	`domainCode` text NOT NULL,
	`cohortKey` text NOT NULL,
	`isDefault` integer DEFAULT false NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `apiCatalogRevisionReleaseSets_pk` PRIMARY KEY(`apiCatalogRevisionId`, `domainCode`, `cohortKey`),
	CONSTRAINT `fk_apiCatalogRevisionReleaseSets_apiCatalogRevisionId_apiCatalogRevisions_id_fk` FOREIGN KEY (`apiCatalogRevisionId`) REFERENCES `apiCatalogRevisions`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apiCatalogRevisionReleaseSets_apiVersionReleaseSetId_apiVersionReleaseSets_id_fk` FOREIGN KEY (`apiVersionReleaseSetId`) REFERENCES `apiVersionReleaseSets`(`id`) ON DELETE CASCADE
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
	`versionHash` text NOT NULL,
	`publishedAt` text NOT NULL,
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
	`status` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_apiComposition_apiVersionId_apiVersions_id_fk` FOREIGN KEY (`apiVersionId`) REFERENCES `apiVersions`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `apiCompositionMembers` (
	`apiCompositionId` text NOT NULL,
	`i18n` text DEFAULT '{}' NOT NULL,
	`domainCode` text DEFAULT 'default' NOT NULL,
	`resourceType` text NOT NULL,
	`variant` text DEFAULT 'default' NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`cohortMatchingMode` text NOT NULL,
	`anchorResourceType` text,
	`maxLagDays` integer,
	`priority` integer DEFAULT 0 NOT NULL,
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
	`apiReleaseSetId` text PRIMARY KEY,
	`definitionId` text NOT NULL,
	`binding` text,
	CONSTRAINT `fk_apiFieldProvenance_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apiFieldProvenance_definitionId_fieldLineageDefinitions_id_fk` FOREIGN KEY (`definitionId`) REFERENCES `fieldLineageDefinitions`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `apiLifecycleJournal` (
	`id` text PRIMARY KEY,
	`apiVersionId` text NOT NULL,
	`statusFrom` text,
	`statusTo` text NOT NULL,
	`reason` text,
	`metadataJson` text,
	`occurredAt` text NOT NULL,
	CONSTRAINT `fk_apiLifecycleJournal_apiVersionId_apiVersions_id_fk` FOREIGN KEY (`apiVersionId`) REFERENCES `apiVersions`(`id`) ON DELETE CASCADE
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
	`code` text NOT NULL,
	`regionCode` text,
	`domainCode` text DEFAULT 'default' NOT NULL,
	`cohortKey` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`effectiveFrom` text,
	`schemaVersion` text NOT NULL,
	`rulesetVersion` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `apiVersionReleaseSets` (
	`id` text PRIMARY KEY,
	`apiVersionId` text NOT NULL,
	`apiReleaseSetId` text NOT NULL,
	`apiCompositionId` text,
	`supersedesApiReleaseSetId` text,
	`status` text NOT NULL,
	`publishedAt` text,
	`validFrom` text,
	`validTo` text,
	`notes` text,
	`guide` text,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_apiVersionReleaseSets_apiVersionId_apiVersions_id_fk` FOREIGN KEY (`apiVersionId`) REFERENCES `apiVersions`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_apiVersionReleaseSets_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_apiVersionReleaseSets_apiCompositionId_apiComposition_id_fk` FOREIGN KEY (`apiCompositionId`) REFERENCES `apiComposition`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_apiVersionReleaseSets_supersedesApiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`supersedesApiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `apiVersions` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`familyType` text NOT NULL,
	`version` text NOT NULL,
	`status` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `fieldLineageDefinitions` (
	`id` text PRIMARY KEY,
	`schemaVersion` integer NOT NULL,
	`manifestHash` text NOT NULL,
	`manifestByteLength` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `releaseSetLifecycleJournal` (
	`id` text PRIMARY KEY,
	`resourceReleaseId` text NOT NULL,
	`relatedResourceReleaseId` text,
	`snapshotId` text,
	`apiVersionReleaseSetId` text,
	`action` text NOT NULL,
	`statusFrom` text,
	`statusTo` text,
	`metadataJson` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_releaseSetLifecycleJournal_resourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`resourceReleaseId`) REFERENCES `resourceReleases`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_releaseSetLifecycleJournal_relatedResourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`relatedResourceReleaseId`) REFERENCES `resourceReleases`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_releaseSetLifecycleJournal_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_releaseSetLifecycleJournal_apiVersionReleaseSetId_apiVersionReleaseSets_id_fk` FOREIGN KEY (`apiVersionReleaseSetId`) REFERENCES `apiVersionReleaseSets`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
CREATE TABLE `snapshotAssemblies` (
	`id` text PRIMARY KEY,
	`snapshotId` text NOT NULL,
	`snapshotRecipeId` text NOT NULL,
	`anchorReleaseId` text,
	`anchorCohortKey` text,
	`status` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_snapshotAssemblies_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotAssemblies_snapshotRecipeId_snapshotRecipes_id_fk` FOREIGN KEY (`snapshotRecipeId`) REFERENCES `snapshotRecipes`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `snapshotDependencies` (
	`snapshotId` text NOT NULL,
	`dependencySnapshotId` text NOT NULL,
	`role` text NOT NULL,
	CONSTRAINT `snapshotDependencies_pk` PRIMARY KEY(`snapshotId`, `role`),
	CONSTRAINT `fk_snapshotDependencies_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotDependencies_dependencySnapshotId_snapshots_id_fk` FOREIGN KEY (`dependencySnapshotId`) REFERENCES `snapshots`(`id`) ON DELETE RESTRICT
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
CREATE TABLE `snapshotRecipeInputs` (
	`snapshotRecipeId` text NOT NULL,
	`datasetId` text NOT NULL,
	`role` text NOT NULL,
	`isRequired` integer NOT NULL,
	`anchorDatasetId` text,
	`maxLagDays` integer,
	`priority` integer DEFAULT 0 NOT NULL,
	`selectionPolicyJson` text NOT NULL,
	CONSTRAINT `snapshotRecipeInputs_pk` PRIMARY KEY(`snapshotRecipeId`, `datasetId`, `role`),
	CONSTRAINT `fk_snapshotRecipeInputs_snapshotRecipeId_snapshotRecipes_id_fk` FOREIGN KEY (`snapshotRecipeId`) REFERENCES `snapshotRecipes`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotRecipeInputs_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_snapshotRecipeInputs_anchorDatasetId_datasets_id_fk` FOREIGN KEY (`anchorDatasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `snapshotRecipes` (
	`id` text PRIMARY KEY,
	`code` text NOT NULL UNIQUE,
	`resourceType` text NOT NULL,
	`version` integer NOT NULL,
	`processingRules` text,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshotResourceReleases` (
	`snapshotId` text NOT NULL,
	`datasetId` text NOT NULL,
	`resourceReleaseId` text NOT NULL,
	`role` text NOT NULL,
	`selectedByRule` text,
	`selectionMode` text,
	`anchorReleaseId` text,
	`sourceCohortKey` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `snapshotResourceReleases_pk` PRIMARY KEY(`snapshotId`, `resourceReleaseId`),
	CONSTRAINT `fk_snapshotResourceReleases_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_snapshotResourceReleases_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `snapshotResourceReleases_resourceReleaseId_datasetId_resourceReleases_id_datasetId_fk` FOREIGN KEY (`resourceReleaseId`,`datasetId`) REFERENCES `resourceReleases`(`id`,`datasetId`) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY,
	`snapshotLineageId` text,
	`parentSnapshotId` text,
	`resourceType` text NOT NULL,
	`code` text NOT NULL,
	`cohortKey` text NOT NULL,
	`geometryStatus` text,
	`revision` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`publishedAt` text,
	`validFrom` text,
	`validTo` text,
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
CREATE TABLE `releaseShardAssignments` (
	`resourceReleaseId` text NOT NULL,
	`dataShardId` text NOT NULL,
	CONSTRAINT `releaseShardAssignments_pk` PRIMARY KEY(`resourceReleaseId`, `dataShardId`),
	CONSTRAINT `fk_releaseShardAssignments_resourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`resourceReleaseId`) REFERENCES `resourceReleases`(`id`) ON DELETE CASCADE,
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
CREATE TABLE `processingRuns` (
	`runId` text PRIMARY KEY,
	`resourceReleaseId` text,
	`snapshotId` text,
	`apiReleaseSetId` text,
	`stage` text NOT NULL,
	`phase` text NOT NULL,
	`checkpoint` text,
	`attempt` integer DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`results` text,
	`error` text,
	`startedAt` text NOT NULL,
	`finishedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_processingRuns_resourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`resourceReleaseId`) REFERENCES `resourceReleases`(`id`),
	CONSTRAINT `fk_processingRuns_snapshotId_snapshots_id_fk` FOREIGN KEY (`snapshotId`) REFERENCES `snapshots`(`id`),
	CONSTRAINT `fk_processingRuns_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`),
	CONSTRAINT "processingRuns_owner_chk" CHECK(("resourceReleaseId" IS NOT NULL) + ("snapshotId" IS NOT NULL) + ("apiReleaseSetId" IS NOT NULL) = 1)
);
--> statement-breakpoint
CREATE TABLE `stats` (
	`id` text PRIMARY KEY,
	`resourceReleaseId` text,
	`apiReleaseSetId` text,
	`category` text NOT NULL,
	`measure` text NOT NULL,
	`unit` text NOT NULL,
	`value` real NOT NULL,
	`dimension` text,
	`dimensionValue` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_stats_resourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`resourceReleaseId`) REFERENCES `resourceReleases`(`id`),
	CONSTRAINT `fk_stats_apiReleaseSetId_apiReleaseSets_id_fk` FOREIGN KEY (`apiReleaseSetId`) REFERENCES `apiReleaseSets`(`id`) ON DELETE CASCADE,
	CONSTRAINT "stats_owner_chk" CHECK(("resourceReleaseId" IS NOT NULL) != ("apiReleaseSetId" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY,
	`issuer` text,
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
CREATE TABLE `apiKey` (
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
	CONSTRAINT `fk_apiKey_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `apiKeyOriginPolicy` (
	`api_key_id` text NOT NULL,
	`hostname` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
	CONSTRAINT `apiKeyOriginPolicy_pk` PRIMARY KEY(`api_key_id`, `hostname`),
	CONSTRAINT `fk_apiKeyOriginPolicy_api_key_id_apiKey_id_fk` FOREIGN KEY (`api_key_id`) REFERENCES `apiKey`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `apiKeyUsage` (
	`api_key_id` text NOT NULL,
	`window` text NOT NULL,
	`window_started_at` integer NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`soft_limit_notified_at` integer,
	CONSTRAINT `apiKeyUsage_pk` PRIMARY KEY(`api_key_id`, `window`, `window_started_at`),
	CONSTRAINT `fk_apiKeyUsage_api_key_id_apiKey_id_fk` FOREIGN KEY (`api_key_id`) REFERENCES `apiKey`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `apiKeyUsageRollup` (
	`id` text PRIMARY KEY,
	`datasets` text NOT NULL,
	`revision` text NOT NULL,
	`completed_through` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `facebookDeletionRequest` (
	`confirmationCodeHash` text PRIMARY KEY,
	`completedAt` integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
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
CREATE TABLE `passkey` (
	`id` text PRIMARY KEY,
	`name` text,
	`publicKey` text NOT NULL,
	`userId` text NOT NULL,
	`credentialID` text NOT NULL,
	`counter` integer NOT NULL,
	`deviceType` text NOT NULL,
	`backedUp` integer NOT NULL,
	`transports` text,
	`createdAt` integer,
	`aaguid` text,
	CONSTRAINT `fk_passkey_userId_user_id_fk` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE CASCADE
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
CREATE TABLE `divisionCodes` (
	`domainCode` text NOT NULL,
	`divisionCode` text NOT NULL,
	`divisionClass` text DEFAULT '' NOT NULL,
	`canonicalId` text NOT NULL,
	`versionHash` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `divisionCodes_pk` PRIMARY KEY(`domainCode`, `divisionClass`, `divisionCode`),
	CONSTRAINT "divisionCodes_geographic_class" CHECK("domainCode" <> 'geographic' OR "divisionClass" IN ('country', 'sar', 'area', 'district', 'city', 'town', 'rural_area', 'village', 'hamlet', 'macrohood', 'neighbourhood', 'microhood', 'major_island', 'minor_island', 'islet', 'island_group'))
);
--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY,
	`datasetId` text,
	`resourceReleaseId` text,
	`sourceReleaseId` text,
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
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`sourceAssetId` text,
	CONSTRAINT `fk_assets_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `fk_assets_resourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`resourceReleaseId`) REFERENCES `resourceReleases`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_assets_sourceReleaseId_sourceReleases_id_fk` FOREIGN KEY (`sourceReleaseId`) REFERENCES `sourceReleases`(`id`) ON DELETE SET NULL,
	CONSTRAINT `fk_assets_sourceAssetId_assets_id_fk` FOREIGN KEY (`sourceAssetId`) REFERENCES `assets`(`id`) ON DELETE SET NULL,
	CONSTRAINT "assets_archive_owner_check" CHECK(("role" != 'releaseSourceArchive' OR "resourceReleaseId" IS NULL) AND ("role" != 'resourceSourceArchive' OR ("resourceReleaseId" IS NOT NULL AND "sourceReleaseId" IS NULL AND "mediaType" = 'application/vnd.apache.parquet')) AND "role" != 'sourceArchive')
);
--> statement-breakpoint
CREATE TABLE `processingAudits` (
	`resourceReleaseId` text NOT NULL,
	`stage` text NOT NULL,
	`ownerId` text NOT NULL,
	`manifestHash` text NOT NULL,
	`byteLength` integer NOT NULL,
	`applicationCount` integer NOT NULL,
	`attemptStatus` text NOT NULL,
	CONSTRAINT `processingAudits_pk` PRIMARY KEY(`resourceReleaseId`, `stage`, `ownerId`),
	CONSTRAINT `fk_processingAudits_resourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`resourceReleaseId`) REFERENCES `resourceReleases`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `releaseProvenance` (
	`resourceReleaseId` text PRIMARY KEY,
	`manifestHash` text NOT NULL,
	`byteLength` integer NOT NULL,
	`applicationCount` integer NOT NULL,
	`attemptStatus` text DEFAULT 'completed' NOT NULL,
	CONSTRAINT `fk_releaseProvenance_resourceReleaseId_resourceReleases_id_fk` FOREIGN KEY (`resourceReleaseId`) REFERENCES `resourceReleases`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `accessAnalyticsDaily` (
	`day` text NOT NULL,
	`scope` text NOT NULL,
	`entityId` text NOT NULL,
	`metrics` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `accessAnalyticsDaily_pk` PRIMARY KEY(`day`, `scope`, `entityId`)
);
--> statement-breakpoint
CREATE TABLE `accessAnalyticsRollups` (
	`period` text NOT NULL,
	`scope` text NOT NULL,
	`entityId` text NOT NULL,
	`metrics` text NOT NULL,
	`asOf` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `accessAnalyticsRollups_pk` PRIMARY KEY(`period`, `scope`, `entityId`)
);
--> statement-breakpoint
CREATE INDEX `publishers_parentPublisherId_idx` ON `publishers` (`parentPublisherId`);--> statement-breakpoint
CREATE INDEX `datasetTransforms_resourceType_idx` ON `datasetTransforms` (`resourceType`);--> statement-breakpoint
CREATE UNIQUE INDEX `datasets_publisherId_code_unique_idx` ON `datasets` (`publisherId`,`code`);--> statement-breakpoint
CREATE INDEX `datasets_region_theme_idx` ON `datasets` (`regionCode`,`theme`);--> statement-breakpoint
CREATE INDEX `resourceReleases_sourceReleaseId_idx` ON `resourceReleases` (`sourceReleaseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `resourceReleases_datasetId_resourceType_sourceVersion_unique_idx` ON `resourceReleases` (`datasetId`,`resourceType`,`sourceVersion`);--> statement-breakpoint
CREATE UNIQUE INDEX `resourceReleases_id_datasetId_unique_idx` ON `resourceReleases` (`id`,`datasetId`);--> statement-breakpoint
CREATE INDEX `resourceReleases_status_idx` ON `resourceReleases` (`status`);--> statement-breakpoint
CREATE INDEX `resourceReleases_supersededByResourceReleaseId_idx` ON `resourceReleases` (`supersededByResourceReleaseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `sourceReleases_datasetId_sourceVersion_unique_idx` ON `sourceReleases` (`datasetId`,`sourceVersion`);--> statement-breakpoint
CREATE UNIQUE INDEX `sourceReleases_id_datasetId_unique_idx` ON `sourceReleases` (`id`,`datasetId`);--> statement-breakpoint
CREATE INDEX `sourceReleases_status_idx` ON `sourceReleases` (`status`);--> statement-breakpoint
CREATE INDEX `sourceReleases_supersededBySourceReleaseId_idx` ON `sourceReleases` (`supersededBySourceReleaseId`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiCatalogRevisionReleaseSets_release_unique_idx` ON `apiCatalogRevisionReleaseSets` (`apiCatalogRevisionId`,`apiVersionReleaseSetId`);--> statement-breakpoint
CREATE INDEX `apiCatalogRevisionReleaseSets_release_idx` ON `apiCatalogRevisionReleaseSets` (`apiVersionReleaseSetId`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiCatalogRevisions_scope_publication_revision_unique_idx` ON `apiCatalogRevisions` (`apiVersionId`,`regionCode`,`publicationDate`,`revision`);--> statement-breakpoint
CREATE INDEX `apiCatalogRevisions_scope_published_idx` ON `apiCatalogRevisions` (`apiVersionId`,`regionCode`,`publishedAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiComposition_apiVersionId_version_unique_idx` ON `apiComposition` (`apiVersionId`,`version`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiEndpoints_apiVersion_method_path_unique_idx` ON `apiEndpoints` (`apiVersionId`,`method`,`path`);--> statement-breakpoint
CREATE INDEX `apiLifecycleJournal_apiVersionId_occurredAt_idx` ON `apiLifecycleJournal` (`apiVersionId`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `apiLifecycleJournal_statusTo_idx` ON `apiLifecycleJournal` (`statusTo`);--> statement-breakpoint
CREATE INDEX `apiReleaseSetSnapshots_snapshotId_idx` ON `apiReleaseSetSnapshots` (`snapshotId`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiReleaseSets_code_schema_ruleset_unique_idx` ON `apiReleaseSets` (`code`,`schemaVersion`,`rulesetVersion`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiReleaseSets_domain_cohort_revision_unique_idx` ON `apiReleaseSets` (`regionCode`,`domainCode`,`cohortKey`,`revision`,`schemaVersion`,`rulesetVersion`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiVersionReleaseSets_version_release_unique_idx` ON `apiVersionReleaseSets` (`apiVersionId`,`apiReleaseSetId`);--> statement-breakpoint
CREATE INDEX `apiVersionReleaseSets_version_status_idx` ON `apiVersionReleaseSets` (`apiVersionId`,`status`);--> statement-breakpoint
CREATE INDEX `apiVersionReleaseSets_release_idx` ON `apiVersionReleaseSets` (`apiReleaseSetId`);--> statement-breakpoint
CREATE INDEX `apiVersions_familyType_status_idx` ON `apiVersions` (`familyType`,`status`);--> statement-breakpoint
CREATE INDEX `releaseSetLifecycleJournal_resourceReleaseId_idx` ON `releaseSetLifecycleJournal` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `releaseSetLifecycleJournal_relatedReleaseId_idx` ON `releaseSetLifecycleJournal` (`relatedResourceReleaseId`);--> statement-breakpoint
CREATE INDEX `releaseSetLifecycleJournal_action_idx` ON `releaseSetLifecycleJournal` (`action`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshotAssemblies_snapshotId_idx` ON `snapshotAssemblies` (`snapshotId`);--> statement-breakpoint
CREATE INDEX `snapshotDependencies_dependencySnapshotId_idx` ON `snapshotDependencies` (`dependencySnapshotId`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshotLineages_primaryDataset_resourceType_variant_unique_idx` ON `snapshotLineages` (`primaryDatasetId`,`resourceType`,`variant`);--> statement-breakpoint
CREATE INDEX `snapshotLineages_region_resource_variant_idx` ON `snapshotLineages` (`regionCode`,`resourceType`,`variant`);--> statement-breakpoint
CREATE INDEX `snapshotRecipes_resourceType_idx` ON `snapshotRecipes` (`resourceType`);--> statement-breakpoint
CREATE INDEX `snapshotResourceReleases_datasetId_idx` ON `snapshotResourceReleases` (`datasetId`);--> statement-breakpoint
CREATE INDEX `snapshotResourceReleases_resourceReleaseId_idx` ON `snapshotResourceReleases` (`resourceReleaseId`);--> statement-breakpoint
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
CREATE INDEX `snapshotShardAssignments_dataShardId_idx` ON `snapshotShardAssignments` (`dataShardId`);--> statement-breakpoint
CREATE UNIQUE INDEX `entityAliases_entityType_aliasValue_unique_idx` ON `entityAliases` (`entityType`,`aliasValue`);--> statement-breakpoint
CREATE INDEX `entityAliases_canonical_lookup_idx` ON `entityAliases` (`entityType`,`canonicalId`);--> statement-breakpoint
CREATE UNIQUE INDEX `processingRuns_snapshot_phase_unique_idx` ON `processingRuns` (`snapshotId`,`phase`);--> statement-breakpoint
CREATE UNIQUE INDEX `processingRuns_composition_phase_unique_idx` ON `processingRuns` (`apiReleaseSetId`,`phase`);--> statement-breakpoint
CREATE UNIQUE INDEX `processingRuns_release_phase_unique_idx` ON `processingRuns` (`resourceReleaseId`,`phase`);--> statement-breakpoint
CREATE INDEX `stats_resourceReleaseId_idx` ON `stats` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `stats_apiReleaseSetId_idx` ON `stats` (`apiReleaseSetId`);--> statement-breakpoint
CREATE INDEX `stats_dimension_idx` ON `stats` (`category`,`measure`,`dimension`,`dimensionValue`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_providerId_accountId_uidx` ON `account` (`provider_id`,`account_id`);--> statement-breakpoint
CREATE INDEX `account_userId_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `api_key_userId_idx` ON `apiKey` (`user_id`);--> statement-breakpoint
CREATE INDEX `api_key_userId_revokedAt_idx` ON `apiKey` (`user_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `newsletterSubscription_status_idx` ON `newsletterSubscription` (`status`);--> statement-breakpoint
CREATE INDEX `passkey_userId_idx` ON `passkey` (`userId`);--> statement-breakpoint
CREATE INDEX `passkey_credentialID_idx` ON `passkey` (`credentialID`);--> statement-breakpoint
CREATE INDEX `session_userId_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `divisionCodes_canonical_idx` ON `divisionCodes` (`domainCode`,`canonicalId`);--> statement-breakpoint
CREATE UNIQUE INDEX `divisionCodes_geographic_administrative_code` ON `divisionCodes` (`divisionCode`) WHERE "divisionCodes"."domainCode" = 'geographic' AND "divisionCodes"."divisionClass" IN ('country', 'sar', 'area', 'district');--> statement-breakpoint
CREATE UNIQUE INDEX `divisionCodes_geographic_locality_code` ON `divisionCodes` (`divisionCode`) WHERE "divisionCodes"."domainCode" = 'geographic' AND "divisionCodes"."divisionClass" IN ('city', 'town', 'rural_area', 'village', 'hamlet');--> statement-breakpoint
CREATE UNIQUE INDEX `divisionCodes_geographic_hood_code` ON `divisionCodes` (`divisionCode`) WHERE "divisionCodes"."domainCode" = 'geographic' AND "divisionCodes"."divisionClass" IN ('macrohood', 'neighbourhood', 'microhood');--> statement-breakpoint
CREATE UNIQUE INDEX `divisionCodes_geographic_landform_code` ON `divisionCodes` (`divisionCode`) WHERE "divisionCodes"."domainCode" = 'geographic' AND "divisionCodes"."divisionClass" IN ('major_island', 'minor_island', 'islet', 'island_group');--> statement-breakpoint
CREATE UNIQUE INDEX `assets_assetKey_unique_idx` ON `assets` (`assetKey`);--> statement-breakpoint
CREATE INDEX `assets_contentHash_idx` ON `assets` (`contentHash`);--> statement-breakpoint
CREATE INDEX `assets_datasetId_idx` ON `assets` (`datasetId`);--> statement-breakpoint
CREATE INDEX `assets_resourceReleaseId_idx` ON `assets` (`resourceReleaseId`);--> statement-breakpoint
CREATE INDEX `assets_sourceReleaseId_idx` ON `assets` (`sourceReleaseId`);--> statement-breakpoint
CREATE INDEX `assets_sourceRecordId_idx` ON `assets` (`sourceRecordId`);--> statement-breakpoint
CREATE INDEX `assets_sourceAssetId_idx` ON `assets` (`sourceAssetId`);--> statement-breakpoint
CREATE INDEX `processingAudits_owner_idx` ON `processingAudits` (`stage`,`ownerId`);--> statement-breakpoint
CREATE INDEX `accessAnalyticsDaily_entityId_idx` ON `accessAnalyticsDaily` (`entityId`);--> statement-breakpoint
CREATE INDEX `accessAnalyticsRollups_entityId_idx` ON `accessAnalyticsRollups` (`entityId`);