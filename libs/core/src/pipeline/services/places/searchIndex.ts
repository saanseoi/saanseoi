import {
  buildSearchContentSql,
  buildSearchSyncSql,
  type SearchIndexDefinition,
  type SearchScope,
} from '../search/incrementalIndex'
export const placeSearchIndex: SearchIndexDefinition = {
  label: 'Place',
  resourceType: 'place',
  domainCode: 'overture',
  table: 'placeSearchFts',
  scopesTable: 'placeSearchScopes',
  retiredTable: 'placesFts',
  fields: [
    'scopeId',
    'placeId',
    'locale',
    'nameText',
    'brandText',
    'taxonomyText',
    'addressText',
    'divisionText',
    'streetText',
  ],
  unindexed: ['scopeId', 'placeId', 'locale'],
  selectSql: `SELECT
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
FROM selected s JOIN "places" p ON p."snapshotId" = s."snapshotId"
JOIN "placesI18n" pi
  ON pi."snapshotId" = p."snapshotId"
 AND pi."placeId" = p."id"
LEFT JOIN "address2dI18n" a2
  ON a2."snapshotId" = p."addressSnapshotId"
 AND a2."addressId" = p."address2dId"
 AND a2."locale" = pi."locale"
LEFT JOIN "address3dI18n" a3
  ON a3."snapshotId" = p."addressSnapshotId"
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
  a3unit.value`,
}
export const buildPlaceSearchSyncSql = (scopes: readonly SearchScope[]) =>
  buildSearchSyncSql(placeSearchIndex, scopes)
export const buildPlaceSearchContentSql = (selection?: string) =>
  buildSearchContentSql(placeSearchIndex, selection)
