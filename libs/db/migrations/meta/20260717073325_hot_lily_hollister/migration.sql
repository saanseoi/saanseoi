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
ALTER TABLE `apiReleaseSets` ADD `apiCompositionId` text REFERENCES apiComposition(id);--> statement-breakpoint
ALTER TABLE `apiReleaseSets` ADD `regionCode` text;--> statement-breakpoint
ALTER TABLE `apiReleaseSets` ADD `cohortKey` text;--> statement-breakpoint
ALTER TABLE `apiReleaseSets` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `apiReleaseSets` ADD `effectiveFrom` text;--> statement-breakpoint
ALTER TABLE `apiReleaseSets` ADD `effectiveTo` text;--> statement-breakpoint
ALTER TABLE `apiReleaseSets` ADD `supersedesApiReleaseSetId` text;--> statement-breakpoint
ALTER TABLE `snapshots` ADD `snapshotLineageId` text REFERENCES snapshotLineages(id);--> statement-breakpoint
ALTER TABLE `snapshots` ADD `revision` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `snapshotLineages` (
	`id`, `code`, `regionCode`, `resourceType`, `variant`, `identityMode`,
	`primaryDatasetId`, `versionHash`, `createdAt`, `updatedAt`
)
SELECT
	'legacy-' || d.`id`,
	'sl-' || d.`code`,
	d.`regionCode`,
	s.`resourceType`,
	CASE
		WHEN d.`code` LIKE '%-pu' THEN 'hkgov-pland-pu'
		WHEN d.`code` LIKE '%-new-town' THEN 'hkgov-pland-new-town'
		ELSE p.`code`
	END,
	CASE WHEN d.`code` LIKE '%-new-town' THEN 'cohort_scoped' ELSE 'persistent' END,
	d.`id`,
	'legacy:' || d.`id`,
	MIN(s.`createdAt`),
	MAX(s.`updatedAt`)
FROM `snapshots` s
INNER JOIN `snapshotSources` ss ON ss.`snapshotId` = s.`id`
INNER JOIN `datasets` d ON d.`id` = ss.`datasetId`
INNER JOIN `publishers` p ON p.`id` = d.`publisherId`
WHERE ss.`role` = 'primary'
GROUP BY d.`id`, d.`code`, d.`regionCode`, s.`resourceType`, p.`code`;--> statement-breakpoint
UPDATE `snapshots`
SET `snapshotLineageId` = (
	SELECT 'legacy-' || ss.`datasetId`
	FROM `snapshotSources` ss
	WHERE ss.`snapshotId` = `snapshots`.`id` AND ss.`role` = 'primary'
	ORDER BY ss.`createdAt`
	LIMIT 1
)
WHERE `snapshotLineageId` IS NULL;--> statement-breakpoint
UPDATE `apiReleaseSets`
SET `regionCode` = substr(`code`, 6, instr(substr(`code`, 6), '-') - 1)
WHERE `regionCode` IS NULL AND `code` LIKE 'data-%';--> statement-breakpoint
UPDATE `apiReleaseSets`
SET `revision` = CAST(substr(
	CASE WHEN instr(`code`, '--') > 0 THEN substr(`code`, 1, instr(`code`, '--') - 1) ELSE `code` END,
	length(rtrim(CASE WHEN instr(`code`, '--') > 0 THEN substr(`code`, 1, instr(`code`, '--') - 1) ELSE `code` END, '0123456789')) + 1
) AS integer)
WHERE `code` LIKE 'data-%';--> statement-breakpoint
UPDATE `apiReleaseSets`
SET `cohortKey` = substr(
	CASE WHEN instr(`code`, '--') > 0 THEN substr(`code`, 1, instr(`code`, '--') - 1) ELSE `code` END,
	length('data-' || `regionCode` || '-' || (
		SELECT av.`familyType` FROM `apiVersions` av WHERE av.`id` = `apiReleaseSets`.`apiVersionId`
	) || '-') + 1,
	length(rtrim(CASE WHEN instr(`code`, '--') > 0 THEN substr(`code`, 1, instr(`code`, '--') - 1) ELSE `code` END, '0123456789')) - 1 -
	length('data-' || `regionCode` || '-' || (
		SELECT av.`familyType` FROM `apiVersions` av WHERE av.`id` = `apiReleaseSets`.`apiVersionId`
	) || '-')
)
WHERE `cohortKey` IS NULL AND `code` LIKE 'data-%';--> statement-breakpoint
UPDATE `apiReleaseSets`
SET `effectiveFrom` = CASE
	WHEN `cohortKey` GLOB '20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]*'
		THEN substr(`cohortKey`, 1, 10) || 'T00:00:00.000Z'
	WHEN `cohortKey` GLOB '20[0-9][0-9]-[0-9][0-9]*'
		THEN substr(`cohortKey`, 1, 7) || '-01T00:00:00.000Z'
	WHEN `cohortKey` GLOB '20[0-9][0-9]*'
		THEN substr(`cohortKey`, 1, 4) || '-01-01T00:00:00.000Z'
	ELSE NULL
END
WHERE `effectiveFrom` IS NULL;--> statement-breakpoint
UPDATE `apiReleaseSets`
SET `apiCompositionId` = (
	SELECT ac.`id`
	FROM `apiComposition` ac
	WHERE ac.`apiVersionId` = `apiReleaseSets`.`apiVersionId`
	ORDER BY ac.`version` DESC
	LIMIT 1
)
WHERE `apiCompositionId` IS NULL;--> statement-breakpoint
INSERT OR IGNORE INTO `apiCatalogRevisions` (
	`id`, `apiVersionId`, `code`, `regionCode`, `publicationDate`, `revision`,
	`defaultDomainCode`, `status`, `publishedAt`, `versionHash`, `createdAt`, `updatedAt`
)
SELECT
	'legacy-catalog-' || ars.`apiVersionId` || '-' || ars.`regionCode`,
	ars.`apiVersionId`,
	'catalog-' || ars.`regionCode` || '-' || av.`familyType` || '-v' || av.`version` || '-2026-07-17.0',
	ars.`regionCode`,
	'2026-07-17',
	0,
	(
		SELECT ac.`defaultDomainCode`
		FROM `apiComposition` ac
		WHERE ac.`apiVersionId` = ars.`apiVersionId`
		ORDER BY ac.`version` DESC
		LIMIT 1
	),
	'current',
	'2026-07-17T00:00:00.000Z',
	'legacy:' || ars.`apiVersionId` || ':' || ars.`regionCode`,
	'2026-07-17T00:00:00.000Z',
	'2026-07-17T00:00:00.000Z'
FROM `apiReleaseSets` ars
INNER JOIN `apiVersions` av ON av.`id` = ars.`apiVersionId`
WHERE ars.`status` = 'current' AND ars.`regionCode` IS NOT NULL
GROUP BY ars.`apiVersionId`, ars.`regionCode`;--> statement-breakpoint
INSERT OR IGNORE INTO `apiCatalogRevisionReleaseSets` (
	`apiCatalogRevisionId`, `apiReleaseSetId`, `domainCode`, `cohortKey`, `isDefault`, `createdAt`
)
SELECT
	'legacy-catalog-' || ars.`apiVersionId` || '-' || ars.`regionCode`,
	ars.`id`,
	ars.`domainCode`,
	ars.`cohortKey`,
	CASE WHEN NOT EXISTS (
		SELECT 1
		FROM `apiReleaseSets` newer_cohort
		WHERE newer_cohort.`apiVersionId` = ars.`apiVersionId`
			AND newer_cohort.`regionCode` = ars.`regionCode`
			AND newer_cohort.`domainCode` = ars.`domainCode`
			AND newer_cohort.`status` = 'current'
			AND newer_cohort.`cohortKey` > ars.`cohortKey`
	) THEN 1 ELSE 0 END,
	'2026-07-17T00:00:00.000Z'
FROM `apiReleaseSets` ars
WHERE ars.`status` = 'current'
	AND ars.`regionCode` IS NOT NULL
	AND ars.`cohortKey` IS NOT NULL
	AND NOT EXISTS (
		SELECT 1
		FROM `apiReleaseSets` newer_revision
		WHERE newer_revision.`apiVersionId` = ars.`apiVersionId`
			AND newer_revision.`regionCode` = ars.`regionCode`
			AND newer_revision.`domainCode` = ars.`domainCode`
			AND newer_revision.`cohortKey` = ars.`cohortKey`
			AND newer_revision.`status` = 'current'
			AND newer_revision.`revision` > ars.`revision`
	);--> statement-breakpoint
CREATE UNIQUE INDEX `apiCatalogRevisionReleaseSets_release_unique_idx` ON `apiCatalogRevisionReleaseSets` (`apiCatalogRevisionId`,`apiReleaseSetId`);--> statement-breakpoint
CREATE INDEX `apiCatalogRevisionReleaseSets_release_idx` ON `apiCatalogRevisionReleaseSets` (`apiReleaseSetId`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiCatalogRevisions_scope_publication_revision_unique_idx` ON `apiCatalogRevisions` (`apiVersionId`,`regionCode`,`publicationDate`,`revision`);--> statement-breakpoint
CREATE INDEX `apiCatalogRevisions_scope_published_idx` ON `apiCatalogRevisions` (`apiVersionId`,`regionCode`,`publishedAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `apiReleaseSets_domain_cohort_revision_unique_idx` ON `apiReleaseSets` (`apiVersionId`,`regionCode`,`domainCode`,`cohortKey`,`revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshotLineages_primaryDataset_unique_idx` ON `snapshotLineages` (`primaryDatasetId`);--> statement-breakpoint
CREATE INDEX `snapshotLineages_region_resource_variant_idx` ON `snapshotLineages` (`regionCode`,`resourceType`,`variant`);--> statement-breakpoint
CREATE UNIQUE INDEX `snapshots_lineage_cohort_revision_unique_idx` ON `snapshots` (`snapshotLineageId`,`cohortKey`,`revision`);
