import {
  buildSearchContentSql,
  buildSearchSyncSql,
  createSearchFtsSql,
  type SearchIndexDefinition,
  type SearchScope,
} from '../search/incrementalIndex'
// Keep source text for display and append a punctuation-free key for FTS matching.
const punctuationSearchSql = (expression: string) => {
  const punctuation =
    `!"#$%&'()*+,-./:;<=>?@[\\]^_` +
    '`' +
    `{|}~·…“”‘’「」『』（）［］｛｝！？、。，：；＇＂～＿－＋＝＠＃＆％＊／＼｜`
  const normalized = [...punctuation].reduce(
    (value, character) => `replace(${value}, '${character.replaceAll("'", "''")}', '')`,
    `lower(${expression})`,
  )
  return `TRIM(COALESCE(${expression}, '')) || char(31) || TRIM(${normalized})`
}

export const placeSearchIndex: SearchIndexDefinition = {
  label: 'Place',
  resourceType: 'place',
  domainCode: 'overture',
  table: 'placeSearchFts',
  tokenizer: 'trigram',
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
  ${punctuationSearchSql("COALESCE(pi.\"name\", '') || ' ' || COALESCE(pi.\"nameAlts\", '')")} AS "nameText",
  ${punctuationSearchSql("COALESCE(pi.\"brandName\", '') || ' ' || COALESCE(pi.\"brandNameAlts\", '')")} AS "brandText",
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
JOIN "places" p ON p.scopeId = publication."scopeId"
JOIN "placesI18n" pi
  ON pi.scopeId = p.scopeId
 AND pi."placeId" = p."id"`,
}
export const buildPlaceSearchSyncSql = (scopes: readonly SearchScope[]) =>
  buildSearchSyncSql(placeSearchIndex, scopes)
export const buildPlaceSearchContentSql = (selection?: string) =>
  buildSearchContentSql(placeSearchIndex, selection)

/** Upgrade a retained word-token index without changing its publication selection.
 * @returns Statements to execute together in one transaction or D1 batch.
 * @remarks This is derived-index maintenance, independent of schema migrations.
 * Keep row IDs and all dependency text; append missing punctuation keys for names.
 */
export function buildPlaceSearchTrigramUpgradeSql(): string[] {
  const columns = placeSearchIndex.fields.join(', ')
  const temporary = 'placeSearchTrigramUpgrade'
  const fields = placeSearchIndex.fields
    .map(field =>
      field === 'nameText' || field === 'brandText'
        ? `CASE WHEN instr(${field}, char(31)) > 0 THEN ${field} ELSE ${punctuationSearchSql(field)} END`
        : field,
    )
    .join(', ')
  return [
    createSearchFtsSql({ ...placeSearchIndex, table: temporary }),
    `INSERT INTO ${temporary} (rowid, ${columns}) SELECT rowid, ${fields} FROM placeSearchFts`,
    'DROP TABLE placeSearchFts',
    `ALTER TABLE ${temporary} RENAME TO placeSearchFts`,
  ]
}
