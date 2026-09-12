import type { Database } from 'bun:sqlite'
import { buildPublicationAssertionSql } from '@repo/core/pipeline/services/publication/sql.ts'
import type { NetStatement } from '../pipeline/local/netSqlitePlanTypes.ts'
import { rollbackLiteral as lit } from './rollbackDelivery.ts'

/** Freeze the small metadata graph that determines rollback ownership and selection. */
export function buildRollbackMetadataGuard(
  meta: Database,
  input: {
    releaseId: string
    datasetId: string
    catalogId: string
    apiVersionId: string
    regionCode: string
    releaseSetIds: string[]
  },
): NetStatement {
  const sets = input.releaseSetIds.map(lit).join(',') || 'NULL'
  const snapshots = `SELECT snapshotId FROM apiReleaseSetSnapshots WHERE apiReleaseSetId IN (${sets})`
  const predicates = [
    `(SELECT id FROM apiCatalogRevisions WHERE apiVersionId=${lit(input.apiVersionId)} AND regionCode=${lit(input.regionCode)} AND status='current' ORDER BY publishedAt DESC,revision DESC LIMIT 1)=${lit(input.catalogId)}`,
  ]
  const params: NetStatement['params'] = []
  for (const [table, where] of [
    [
      'releases',
      `id=${lit(input.releaseId)} OR (supersededByReleaseId=${lit(input.releaseId)} AND datasetId=${lit(input.datasetId)})`,
    ],
    ['apiVersions', `id=${lit(input.apiVersionId)}`],
    ['apiCatalogRevisions', `id=${lit(input.catalogId)}`],
    ['apiCatalogRevisionReleaseSets', `apiCatalogRevisionId=${lit(input.catalogId)}`],
    ['apiReleaseSets', `id IN (${sets})`],
    ['apiReleaseSetSnapshots', `apiReleaseSetId IN (${sets})`],
    ['snapshots', `id IN (${snapshots})`],
    ['snapshotSources', `snapshotId IN (${snapshots})`],
  ]) {
    const columns = meta
      .query<{ name: string; pk: number }, []>(`PRAGMA table_info("${table}")`)
      .all()
    const quote = (name: string) => `"${name.replaceAll('"', '""')}"`
    const keys = columns.filter(column => column.pk).sort((a, b) => a.pk - b.pk)
    const query = `SELECT json_group_array(json_array(${columns.map(column => quote(column.name)).join(',')})) AS baseline FROM (SELECT * FROM "${table}" WHERE ${where} ORDER BY ${(keys.length ? keys : columns).map(column => quote(column.name)).join(',')})`
    const baseline = meta.query<{ baseline: string }, []>(query).get()!.baseline
    predicates.push(`(${query})=?`)
    params.push(baseline)
  }
  return { sql: buildPublicationAssertionSql(predicates.join(' AND ')), params }
}
