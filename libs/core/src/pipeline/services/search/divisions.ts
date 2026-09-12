import {
  buildSearchSyncSql,
  type SearchIndexDefinition,
  type SearchScope,
} from './incrementalIndex'

export const divisionSearchDomains = [
  'geographic',
  'hkgov-censtatd-hma',
  'hkgov-pland-pu',
  'hkgov-pland-new-town',
  'hkgov-landsd',
] as const

export const divisionSearchIndex: SearchIndexDefinition = {
  label: 'Division',
  resourceType: 'division',
  domainCode: 'geographic',
  domainCodes: divisionSearchDomains,
  table: 'divisionSearchFts',
  scopesTable: 'divisionSearchScopes',
  tokenizer: 'trigram',
  fields: [
    'scopeId',
    'divisionId',
    'locale',
    'nameText',
    'aliasText',
    'codeText',
    'ancestorText',
  ],
  unindexed: ['scopeId', 'divisionId', 'locale'],
  selectSql: `SELECT s.scopeId, d.id AS divisionId, COALESCE(i.locale, 'und') AS locale,
    COALESCE(i.name, '') AS nameText,
    TRIM(REPLACE(COALESCE(i.nameAlts, ''), '|', ' ') || ' ' ||
      COALESCE((SELECT group_concat(DISTINCT json_extract(value, '$.value')
        ORDER BY json_extract(value, '$.value')) FROM json_each(i.nameRules)), '')) AS aliasText,
    COALESCE(d.divisionCode, '') AS codeText,
    COALESCE((SELECT group_concat(DISTINCT value ORDER BY value)
      FROM json_tree(d.hierarchies) WHERE key = 'name' AND type = 'text'), '') AS ancestorText
    FROM selected s
    JOIN divisionPublicationState publication ON publication.snapshotId = s.snapshotId
      AND publication.status = 'current' AND publication.preparedAt IS NOT NULL
      AND publication.publicationToken <> ''
    JOIN divisions d ON d.snapshotId = publication.scopeId
    LEFT JOIN divisionsI18n i ON i.snapshotId = d.snapshotId AND i.divisionId = d.id`,
}

export const buildDivisionSearchSyncSql = (scopes: readonly SearchScope[]) =>
  buildSearchSyncSql(divisionSearchIndex, scopes)
