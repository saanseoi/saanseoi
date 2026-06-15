CREATE VIRTUAL TABLE IF NOT EXISTS "placesFts" USING fts5(
  "placeId" UNINDEXED,
  "locale" UNINDEXED,
  "nameText",
  "brandText",
  "taxonomyText",
  "addressText",
  "divisionText",
  "streetText"
);

DELETE FROM "placesFts";

INSERT INTO "placesFts" (
  "placeId",
  "locale",
  "nameText",
  "brandText",
  "taxonomyText",
  "addressText",
  "divisionText",
  "streetText"
)
SELECT
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
    COALESCE(a3."formattedAddressPart", '')
  ) AS "addressText",
  COALESCE(GROUP_CONCAT(DISTINCT di."name"), '') AS "divisionText",
  COALESCE(MAX(si."name"), '') AS "streetText"
FROM "places" p
JOIN "placesI18n" pi
  ON pi."placeId" = p."id"
LEFT JOIN "address2dI18n" a2
  ON a2."addressId" = p."address2dId"
 AND a2."locale" = pi."locale"
LEFT JOIN "address3dI18n" a3
  ON a3."address3dId" = p."address3dId"
 AND a3."locale" = pi."locale"
LEFT JOIN "streetsAddress" sa
  ON sa."addressId" = p."address2dId"
LEFT JOIN "streetsI18n" si
  ON si."streetId" = sa."streetId"
 AND si."locale" = pi."locale"
LEFT JOIN "placesDivision" pcd
  ON pcd."placeId" = p."id"
LEFT JOIN "divisionsI18n" di
  ON di."divisionId" = pcd."divisionId"
 AND di."locale" = pi."locale"
GROUP BY
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
  a3."formattedAddressPart";
