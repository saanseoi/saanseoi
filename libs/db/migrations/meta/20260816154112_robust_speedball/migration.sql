PRAGMA foreign_keys = OFF;
--> statement-breakpoint
CREATE TABLE `sourceReleases` (
	`id` text PRIMARY KEY,
	`datasetId` text NOT NULL,
	`code` text NOT NULL UNIQUE,
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
	`supersededBySourceReleaseId` text,
	`processingRules` text,
	`ingestedAt` text,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT `fk_sourceReleases_datasetId_datasets_id_fk` FOREIGN KEY (`datasetId`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT,
	CONSTRAINT `sourceReleases_supersededBySourceReleaseId_sourceReleases_id_fk` FOREIGN KEY (`supersededBySourceReleaseId`) REFERENCES `sourceReleases`(`id`) ON DELETE SET NULL
);
--> statement-breakpoint
-- One upstream artefact is represented by one source release. Prefer the
-- primary division materialisation when copying the shared source metadata.
WITH rankedResourceReleases AS (
	SELECT
		`releases`.*,
		ROW_NUMBER() OVER (
			PARTITION BY `datasetId`, `sourceVersion`
			ORDER BY CASE WHEN `resourceType` = 'division' THEN 0 ELSE 1 END, `code`
		) AS `sourceRank`
	FROM `releases`
)
INSERT INTO `sourceReleases` (
	`id`, `datasetId`, `code`, `sourceVersion`, `sourceSchemaVersion`,
	`publicationDate`, `cohortKey`, `rawObjectKey`, `originalFileName`,
	`releaseNotesUrl`, `notes`, `status`, `revokedAt`, `revocationReason`,
	`supersededBySourceReleaseId`, `processingRules`, `ingestedAt`, `createdAt`, `updatedAt`
)
SELECT
	lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-5' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
	`datasetId`,
	'dr-' || substr((SELECT `code` FROM `datasets` WHERE `datasets`.`id` = `rankedResourceReleases`.`datasetId`), 4) || '-' || `sourceVersion`,
	`sourceVersion`, `sourceSchemaVersion`, `publicationDate`, `cohortKey`,
	`rawObjectKey`, `originalFileName`, `releaseNotesUrl`, `notes`, `status`,
	`revokedAt`, `revocationReason`, NULL, `processingRules`, `ingestedAt`, `createdAt`, `updatedAt`
FROM rankedResourceReleases
WHERE `sourceRank` = 1;
--> statement-breakpoint
UPDATE `sourceReleases`
SET `supersededBySourceReleaseId` = (
	SELECT successorSourceRelease.`id`
	FROM `releases` AS predecessorResourceRelease
	INNER JOIN `releases` AS successorResourceRelease
		ON successorResourceRelease.`id` = predecessorResourceRelease.`supersededByReleaseId`
	INNER JOIN `sourceReleases` AS successorSourceRelease
		ON successorSourceRelease.`datasetId` = successorResourceRelease.`datasetId`
		AND successorSourceRelease.`sourceVersion` = successorResourceRelease.`sourceVersion`
	WHERE predecessorResourceRelease.`datasetId` = `sourceReleases`.`datasetId`
		AND predecessorResourceRelease.`sourceVersion` = `sourceReleases`.`sourceVersion`
	ORDER BY CASE WHEN predecessorResourceRelease.`resourceType` = 'division' THEN 0 ELSE 1 END, predecessorResourceRelease.`code`
	LIMIT 1
);
--> statement-breakpoint
-- Do not rebuild `releases`: Cloudflare D1 ignores PRAGMA foreign_keys while
-- a table recreation can still cascade-delete its dependent operational data.
-- Every existing row is backfilled immediately; new writes supply this field.
ALTER TABLE `releases` ADD `sourceReleaseId` text REFERENCES sourceReleases(id) ON DELETE RESTRICT;
--> statement-breakpoint
UPDATE `releases`
SET `sourceReleaseId` = (
	SELECT `sourceReleases`.`id`
	FROM `sourceReleases`
	WHERE `sourceReleases`.`datasetId` = `releases`.`datasetId`
		AND `sourceReleases`.`sourceVersion` = `releases`.`sourceVersion`
);
--> statement-breakpoint
CREATE INDEX `releases_sourceReleaseId_idx` ON `releases` (`sourceReleaseId`);
--> statement-breakpoint
CREATE UNIQUE INDEX `sourceReleases_datasetId_sourceVersion_unique_idx` ON `sourceReleases` (`datasetId`,`sourceVersion`);
--> statement-breakpoint
CREATE UNIQUE INDEX `sourceReleases_id_datasetId_unique_idx` ON `sourceReleases` (`id`,`datasetId`);
--> statement-breakpoint
CREATE INDEX `sourceReleases_status_idx` ON `sourceReleases` (`status`);
--> statement-breakpoint
CREATE INDEX `sourceReleases_supersededBySourceReleaseId_idx` ON `sourceReleases` (`supersededBySourceReleaseId`);
--> statement-breakpoint
PRAGMA foreign_keys = ON;
