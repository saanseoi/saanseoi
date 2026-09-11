SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM placeSearchScopes selected WHERE NOT EXISTS (SELECT 1 FROM placePublicationState publication WHERE publication.snapshotId = selected.snapshotId AND publication.status = 'current' AND publication.preparedAt IS NOT NULL AND publication.publicationToken <> '')) THEN 1 ELSE abs(-9223372036854775808) END;

CREATE VIRTUAL TABLE IF NOT EXISTS placeSearchFts USING fts5(
    scopeId UNINDEXED, placeId UNINDEXED, locale UNINDEXED, nameText, brandText, taxonomyText, addressText, divisionText, streetText
  );

WITH selected AS (SELECT scopeId, snapshotId FROM placeSearchScopes), desired AS (SELECT
  s."scopeId" AS "scopeId",
  p."id" AS "placeId",
  pi."locale" AS "locale",
  TRIM(COALESCE(pi."name", '') || ' ' || COALESCE(pi."nameAlts", '')) AS "nameText",
  TRIM(COALESCE(pi."brandName", '') || ' ' || COALESCE(pi."brandNameAlts", '')) AS "brandText",
  TRIM(
    COALESCE(p."basicCategory", '') || ' ' ||
    COALESCE(p."taxonomyPrimary", '') || ' ' ||
    COALESCE(p."taxonomyHierarchy", '')
  ) AS "taxonomyText",
  TRIM(
    COALESCE(a2."formattedAddress", '') || ' ' ||
    COALESCE(
      json_extract(a3unit.value, '$.formattedAddressPart'),
      CASE WHEN pi."locale" = 'zh-hant' THEN
        COALESCE(json_extract(a3unit.value, '$.floorExpression'), '') ||
        COALESCE(json_extract(a3unit.value, '$.unitExpression'), '')
      ELSE
        COALESCE(json_extract(a3unit.value, '$.unitExpression'), '') || ' ' ||
        COALESCE(json_extract(a3unit.value, '$.floorExpression'), '')
      END,
      ''
    )
  ) AS "addressText",
  COALESCE(GROUP_CONCAT(DISTINCT di."name" ORDER BY di."name"), '') AS "divisionText",
  COALESCE(MAX(si."name"), '') AS "streetText"
FROM selected s
JOIN "placePublicationState" publication ON publication."snapshotId" = s."snapshotId"
 AND publication."status" = 'current' AND publication."preparedAt" IS NOT NULL
 AND publication."publicationToken" <> ''
JOIN "places" p ON p."snapshotId" = publication."scopeId"
JOIN "placesI18n" pi
  ON pi."snapshotId" = p."snapshotId"
 AND pi."placeId" = p."id"
LEFT JOIN "addressPublicationState" addressScope
  ON addressScope."scopeId" = p."addressSnapshotId"
 AND addressScope."status" = 'current' AND addressScope."preparedAt" IS NOT NULL
LEFT JOIN "address2dI18n" a2
  ON a2."snapshotId" = addressScope."scopeId"
 AND a2."addressId" = p."address2dId"
 AND a2."locale" = pi."locale"
LEFT JOIN "address3dI18n" a3
  ON a3."snapshotId" = addressScope."scopeId"
 AND a3."address3dId" = p."address3dId"
 AND a3."locale" = pi."locale"
LEFT JOIN json_each(a3."units") a3unit
  ON a3unit.key = p."address3dUnitId"
LEFT JOIN "streetsAddress" sa
  ON sa."addressSnapshotId" = p."addressSnapshotId"
 AND sa."addressId" = p."address2dId"
LEFT JOIN "streetsI18n" si
  ON si."snapshotId" = sa."streetSnapshotId"
 AND si."streetId" = sa."streetId"
 AND si."locale" = pi."locale"
LEFT JOIN "placesDivision" pcd
  ON pcd."placeSnapshotId" = p."snapshotId"
 AND pcd."placeId" = p."id"
LEFT JOIN "divisionsI18n" di
  ON di."snapshotId" = pcd."divisionSnapshotId"
 AND di."divisionId" = pcd."divisionId"
 AND di."locale" = pi."locale"
GROUP BY
  s."scopeId",
  p."id",
  pi."locale",
  pi."name",
  pi."nameAlts",
  pi."brandName",
  pi."brandNameAlts",
  p."basicCategory",
  p."taxonomyPrimary",
  p."taxonomyHierarchy",
  a2."formattedAddress",
  a3unit.value), removed AS (
      SELECT scopeId, placeId, locale, nameText, brandText, taxonomyText, addressText, divisionText, streetText FROM placeSearchFts EXCEPT SELECT scopeId, placeId, locale, nameText, brandText, taxonomyText, addressText, divisionText, streetText FROM desired
    ) DELETE FROM placeSearchFts WHERE rowid IN (
      SELECT f.rowid FROM placeSearchFts f JOIN removed r ON
      f.scopeId IS r.scopeId AND f.placeId IS r.placeId AND f.locale IS r.locale AND f.nameText IS r.nameText AND f.brandText IS r.brandText AND f.taxonomyText IS r.taxonomyText AND f.addressText IS r.addressText AND f.divisionText IS r.divisionText AND f.streetText IS r.streetText
    );

WITH selected AS (SELECT scopeId, snapshotId FROM placeSearchScopes), desired AS (SELECT
  s."scopeId" AS "scopeId",
  p."id" AS "placeId",
  pi."locale" AS "locale",
  TRIM(COALESCE(pi."name", '') || ' ' || COALESCE(pi."nameAlts", '')) AS "nameText",
  TRIM(COALESCE(pi."brandName", '') || ' ' || COALESCE(pi."brandNameAlts", '')) AS "brandText",
  TRIM(
    COALESCE(p."basicCategory", '') || ' ' ||
    COALESCE(p."taxonomyPrimary", '') || ' ' ||
    COALESCE(p."taxonomyHierarchy", '')
  ) AS "taxonomyText",
  TRIM(
    COALESCE(a2."formattedAddress", '') || ' ' ||
    COALESCE(
      json_extract(a3unit.value, '$.formattedAddressPart'),
      CASE WHEN pi."locale" = 'zh-hant' THEN
        COALESCE(json_extract(a3unit.value, '$.floorExpression'), '') ||
        COALESCE(json_extract(a3unit.value, '$.unitExpression'), '')
      ELSE
        COALESCE(json_extract(a3unit.value, '$.unitExpression'), '') || ' ' ||
        COALESCE(json_extract(a3unit.value, '$.floorExpression'), '')
      END,
      ''
    )
  ) AS "addressText",
  COALESCE(GROUP_CONCAT(DISTINCT di."name" ORDER BY di."name"), '') AS "divisionText",
  COALESCE(MAX(si."name"), '') AS "streetText"
FROM selected s
JOIN "placePublicationState" publication ON publication."snapshotId" = s."snapshotId"
 AND publication."status" = 'current' AND publication."preparedAt" IS NOT NULL
 AND publication."publicationToken" <> ''
JOIN "places" p ON p."snapshotId" = publication."scopeId"
JOIN "placesI18n" pi
  ON pi."snapshotId" = p."snapshotId"
 AND pi."placeId" = p."id"
LEFT JOIN "addressPublicationState" addressScope
  ON addressScope."scopeId" = p."addressSnapshotId"
 AND addressScope."status" = 'current' AND addressScope."preparedAt" IS NOT NULL
LEFT JOIN "address2dI18n" a2
  ON a2."snapshotId" = addressScope."scopeId"
 AND a2."addressId" = p."address2dId"
 AND a2."locale" = pi."locale"
LEFT JOIN "address3dI18n" a3
  ON a3."snapshotId" = addressScope."scopeId"
 AND a3."address3dId" = p."address3dId"
 AND a3."locale" = pi."locale"
LEFT JOIN json_each(a3."units") a3unit
  ON a3unit.key = p."address3dUnitId"
LEFT JOIN "streetsAddress" sa
  ON sa."addressSnapshotId" = p."addressSnapshotId"
 AND sa."addressId" = p."address2dId"
LEFT JOIN "streetsI18n" si
  ON si."snapshotId" = sa."streetSnapshotId"
 AND si."streetId" = sa."streetId"
 AND si."locale" = pi."locale"
LEFT JOIN "placesDivision" pcd
  ON pcd."placeSnapshotId" = p."snapshotId"
 AND pcd."placeId" = p."id"
LEFT JOIN "divisionsI18n" di
  ON di."snapshotId" = pcd."divisionSnapshotId"
 AND di."divisionId" = pcd."divisionId"
 AND di."locale" = pi."locale"
GROUP BY
  s."scopeId",
  p."id",
  pi."locale",
  pi."name",
  pi."nameAlts",
  pi."brandName",
  pi."brandNameAlts",
  p."basicCategory",
  p."taxonomyPrimary",
  p."taxonomyHierarchy",
  a2."formattedAddress",
  a3unit.value) INSERT INTO placeSearchFts (scopeId, placeId, locale, nameText, brandText, taxonomyText, addressText, divisionText, streetText)
      SELECT scopeId, placeId, locale, nameText, brandText, taxonomyText, addressText, divisionText, streetText FROM desired EXCEPT SELECT scopeId, placeId, locale, nameText, brandText, taxonomyText, addressText, divisionText, streetText FROM placeSearchFts;
