import type { SearchScope } from '@repo/core/pipeline/services/search/incrementalIndex'
import { divisionSearchTerms } from '@repo/core/pipeline/services/search/divisionQuery'
import type {
  DivisionSearchQuery,
  DivisionSearchResult,
} from '../schema/divisionSearch'

export class DivisionSearchNotReady extends Error {
  constructor(options?: ErrorOptions) {
    super('Division search is not ready for the latest published releases.', options)
  }
}

/** Scope selection is a single JSON parameter, regardless of catalogue size. */
export async function searchDivisions(
  db: Pick<D1Database, 'prepare'>,
  scopes: readonly SearchScope[],
  query: DivisionSearchQuery,
): Promise<DivisionSearchResult[]> {
  if (!scopes.length) return []
  const selected = JSON.stringify(
    scopes.map(scope => ({
      ...scope,
      domain: scope.scopeId.split(':')[1],
    })),
  )
  const terms = divisionSearchTerms(query.q)
  if (!terms.length || terms.length > 8)
    throw new Error('Invalid division search terms.')
  try {
    const readReadiness = () =>
      db
        .prepare(`SELECT count(*) AS n,
        json_group_array(json_array(scopeId,snapshotId,publicationToken,updatedAt)) AS token
        FROM (SELECT s.scopeId,p.snapshotId,p.publicationToken,p.updatedAt
          FROM json_each(?) selected
          JOIN divisionSearchScopes s ON s.scopeId = json_extract(selected.value, '$.scopeId')
            AND s.snapshotId = json_extract(selected.value, '$.snapshotId')
          JOIN divisionPublicationState p ON p.snapshotId = s.snapshotId
          WHERE p.status = 'current' AND p.preparedAt IS NOT NULL AND p.publicationToken <> ''
          ORDER BY s.scopeId)`)
        .bind(selected)
        .first<{ n: number; token: string }>()
    const ready = await readReadiness()
    if (ready?.n !== scopes.length) throw new DivisionSearchNotReady()

    const parameters: (string | number)[] = [selected]
    const bind = (value: string | number) => {
      parameters.push(value)
      return '?'
    }
    const ownFields = ['nameText', 'aliasText', 'codeText']
    const fields = query.ancestors ? [...ownFields, 'ancestorText'] : ownFields
    // Separate indexed column searches let FTS5 accelerate LIKE with trigrams.
    // Shorter terms are supported too; SQLite scans the latest FTS documents.
    const matched = terms
      .map(
        term =>
          `SELECT rowid FROM (${fields
            .map(
              field =>
                `SELECT rowid FROM divisionSearchFts WHERE ${field} LIKE ${bind('%' + term + '%')}`,
            )
            .join(' UNION ')})`,
      )
      .join(' INTERSECT ')
    const ownMatch = terms
      .map(
        term =>
          '(' +
          ownFields
            .map(field => `f.${field} LIKE ${bind('%' + term + '%')}`)
            .join(' OR ') +
          ')',
      )
      .join(' AND ')
    const exact = terms.join(' ')
    const rank = `CASE WHEN f.codeText = ${bind(query.q.normalize('NFKC').trim())} COLLATE NOCASE OR f.nameText = ${bind(exact)} COLLATE NOCASE THEN 0
      WHEN f.nameText LIKE ${bind(exact + '%')} THEN 1 ELSE 2 END`
    const locale = query.locale ? `AND f.locale = ${bind(query.locale)}` : ''
    const limit = bind(query.limit)
    const result = await db
      .prepare(`
      WITH selected AS (
        SELECT json_extract(value, '$.scopeId') AS scopeId,
          json_extract(value, '$.snapshotId') AS snapshotId,
          json_extract(value, '$.domain') AS domain FROM json_each(?)
      ), matched AS (${matched}), candidates AS (
        SELECT d.id AS divisionId, s.domain, s.snapshotId, f.locale, f.nameText AS name,
          d.divisionCode, d.class, d.category, d.level,
          CASE WHEN ${ownMatch} THEN 'self' ELSE 'ancestor' END AS match,
          ${rank} AS priority
        FROM divisionSearchFts f JOIN matched m ON m.rowid = f.rowid
        JOIN divisionSearchScopes mapping ON mapping.scopeId = f.scopeId
        JOIN selected s ON s.scopeId = mapping.scopeId AND s.snapshotId = mapping.snapshotId
        JOIN divisionPublicationState publication ON publication.snapshotId = s.snapshotId
          AND publication.status = 'current' AND publication.preparedAt IS NOT NULL
          AND publication.publicationToken <> ''
        JOIN divisions d ON d.snapshotId = publication.scopeId AND d.id = f.divisionId
        WHERE true ${locale}
      ), ranked AS (
        SELECT *, row_number() OVER (
          PARTITION BY domain, divisionId
          ORDER BY CASE match WHEN 'self' THEN 0 ELSE 1 END, priority,
            CASE locale WHEN 'en' THEN 0 ELSE 1 END, locale, snapshotId
        ) AS choice FROM candidates
      )
      SELECT divisionId, domain, snapshotId, locale, name, divisionCode, class, category, level, match
      FROM ranked WHERE choice = 1
      ORDER BY CASE match WHEN 'self' THEN 0 ELSE 1 END, priority, name COLLATE NOCASE, domain, divisionId
      LIMIT ${limit}
    `)
      .bind(...parameters)
      .all<DivisionSearchResult>()
    const after = await readReadiness()
    if (after?.n !== scopes.length || after.token !== ready.token)
      throw new DivisionSearchNotReady()
    return result.results
  } catch (error) {
    if (
      error instanceof Error &&
      /no such table: division(?:Search|PublicationState)/.test(
        `${error.message} ${error.cause}`,
      )
    )
      throw new DivisionSearchNotReady({ cause: error })
    throw error
  }
}
