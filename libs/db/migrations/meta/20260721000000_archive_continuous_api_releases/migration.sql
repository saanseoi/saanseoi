UPDATE `apiReleaseSets` AS `older`
SET
  `status` = 'archived',
  `validTo` = COALESCE(`older`.`validTo`, `older`.`publishedAt`, `older`.`updatedAt`)
WHERE `older`.`status` = 'current'
  AND EXISTS (
    SELECT 1
    FROM `apiReleaseSets` AS `newer`
    WHERE `newer`.`status` = 'current'
      AND `newer`.`apiVersionId` = `older`.`apiVersionId`
      AND `newer`.`regionCode` IS `older`.`regionCode`
      AND `newer`.`domainCode` = `older`.`domainCode`
      AND (
        COALESCE(`newer`.`publishedAt`, `newer`.`createdAt`) > COALESCE(`older`.`publishedAt`, `older`.`createdAt`)
        OR (
          COALESCE(`newer`.`publishedAt`, `newer`.`createdAt`) = COALESCE(`older`.`publishedAt`, `older`.`createdAt`)
          AND `newer`.`revision` > `older`.`revision`
        )
      )
  );

DELETE FROM `apiReleaseSets`
WHERE `domainCode` = 'default'
  AND `apiVersionId` IN (
    SELECT `id`
    FROM `apiVersions`
    WHERE `familyType` = 'divisions'
  );
