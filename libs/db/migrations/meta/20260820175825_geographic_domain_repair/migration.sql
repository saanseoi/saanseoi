-- The pre-release Divisions API called its default Geographic domain
-- "overture". Rename existing catalogue memberships before their release
-- sets so the catalogue primary key remains valid throughout the repair.
UPDATE `apiCatalogRevisionReleaseSets`
SET `domainCode` = 'geographic'
WHERE `domainCode` = 'overture'
  AND `apiReleaseSetId` IN (
    SELECT `apiReleaseSets`.`id`
    FROM `apiReleaseSets`
    INNER JOIN `apiComposition`
      ON `apiComposition`.`id` = `apiReleaseSets`.`apiCompositionId`
    WHERE `apiComposition`.`code` = 'comp-divisions-v1'
  );
--> statement-breakpoint
UPDATE `apiReleaseSets`
SET
  `domainCode` = 'geographic',
  `updatedAt` = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE `domainCode` = 'overture'
  AND `apiCompositionId` = (
    SELECT `id`
    FROM `apiComposition`
    WHERE `code` = 'comp-divisions-v1'
  );
