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
  TRIM(COALESCE(pi."otName", '') || ' ' || COALESCE(pi."otNameAlts", '')) AS "nameText",
  TRIM(COALESCE(pi."otBrandName", '') || ' ' || COALESCE(pi."otBrandNameAlts", '')) AS "brandText",
  TRIM(
    COALESCE(p."otBasicCategory", '') || ' ' ||
    COALESCE(p."otTaxonomyPrimary", '') || ' ' ||
    COALESCE(p."otTaxonomyHierarchyJson", '')
  ) AS "taxonomyText",
  TRIM(
    COALESCE(a2."formattedAddress", '') || ' ' ||
    COALESCE(a3."formattedAddressPart", '')
  ) AS "addressText",
  COALESCE(GROUP_CONCAT(DISTINCT di."otName"), '') AS "divisionText",
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
  pi."otName",
  pi."otNameAlts",
  pi."otBrandName",
  pi."otBrandNameAlts",
  p."otBasicCategory",
  p."otTaxonomyPrimary",
  p."otTaxonomyHierarchyJson",
  a2."formattedAddress",
  a3."formattedAddressPart";
