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
 AND pi."placeId" = p."id"`,
}
export const buildPlaceSearchSyncSql = (scopes: readonly SearchScope[]) =>
  buildSearchSyncSql(placeSearchIndex, scopes)
export const buildPlaceSearchContentSql = (selection?: string) =>
  buildSearchContentSql(placeSearchIndex, selection)
