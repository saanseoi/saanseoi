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
  COALESCE(json_extract(pi."searchDependencyText", '$.addressText'), '') AS "addressText",
  COALESCE(json_extract(pi."searchDependencyText", '$.divisionText'), '') AS "divisionText",
  COALESCE(json_extract(pi."searchDependencyText", '$.streetText'), '') AS "streetText"
FROM selected s
JOIN "placePublicationState" publication ON publication."snapshotId" = s."snapshotId"
 AND publication."status" = 'current' AND publication."preparedAt" IS NOT NULL
 AND publication."publicationToken" <> ''
JOIN "places" p ON p."snapshotId" = publication."scopeId"
JOIN "placesI18n" pi
  ON pi."snapshotId" = p."snapshotId"
 AND pi."placeId" = p."id"), removed AS (
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
  COALESCE(json_extract(pi."searchDependencyText", '$.addressText'), '') AS "addressText",
  COALESCE(json_extract(pi."searchDependencyText", '$.divisionText'), '') AS "divisionText",
  COALESCE(json_extract(pi."searchDependencyText", '$.streetText'), '') AS "streetText"
FROM selected s
JOIN "placePublicationState" publication ON publication."snapshotId" = s."snapshotId"
 AND publication."status" = 'current' AND publication."preparedAt" IS NOT NULL
 AND publication."publicationToken" <> ''
JOIN "places" p ON p."snapshotId" = publication."scopeId"
JOIN "placesI18n" pi
  ON pi."snapshotId" = p."snapshotId"
 AND pi."placeId" = p."id") INSERT INTO placeSearchFts (scopeId, placeId, locale, nameText, brandText, taxonomyText, addressText, divisionText, streetText)
      SELECT scopeId, placeId, locale, nameText, brandText, taxonomyText, addressText, divisionText, streetText FROM desired EXCEPT SELECT scopeId, placeId, locale, nameText, brandText, taxonomyText, addressText, divisionText, streetText FROM placeSearchFts;
