import { getTableColumns } from 'drizzle-orm'
import { getViewConfig, SQLiteSyncDialect } from 'drizzle-orm/sqlite-core'
import {
  metaResourceReleases,
  metaResourceReleaseDetails,
  metaSourceReleases,
} from '@repo/db/metaSchema'

/** Minimal release tables for focused query tests. Migration tests exercise constraints. */
export function releaseFixtureSchemaSql() {
  const tables = [metaSourceReleases, metaResourceReleases].map((table, index) => {
    const name = index === 0 ? 'sourceReleases' : 'resourceReleases'
    const columns = Object.values(getTableColumns(table)).map(
      column =>
        `"${column.name}" ${column.getSQLType()}${column.name === 'id' ? ' PRIMARY KEY' : ''}`,
    )
    return `CREATE TABLE ${name} (${columns.join(', ')});`
  })
  const query = getViewConfig(metaResourceReleaseDetails).query!
  const view = new SQLiteSyncDialect().sqlToQuery(query).sql
  const membershipView =
    'SELECT m.*, r.datasetId FROM snapshotResourceReleases m JOIN resourceReleaseDetails r ON r.id = m.resourceReleaseId'
  return `${tables.join('\n')}\nCREATE VIEW resourceReleaseDetails AS ${view};\nCREATE VIEW snapshotResourceReleaseDetails AS ${membershipView};`
}

export function insertReleaseFixture(
  db: import('bun:sqlite').Database,
  row: {
    id: string
    datasetId: string
    sourceVersion: string
    sourceReleaseId?: string
    code?: string
    resourceType?: string
    status?: string
    cohortKey?: string | null
    sourceSchemaVersion?: string | null
    publicationDate?: string | null
    releaseNotesUrl?: string | null
    [key: string]: unknown
  },
) {
  const {
    datasetId,
    sourceVersion,
    sourceSchemaVersion,
    publicationDate,
    cohortKey,
    releaseNotesUrl,
    ...resource
  } = row
  const sourceReleaseId = row.sourceReleaseId ?? `source-${row.id}`
  const insert = (table: string, values: Record<string, unknown>, ignore = false) => {
    const entries = Object.entries(values).filter(([, value]) => value !== undefined)
    db.query(
      `INSERT ${ignore ? 'OR IGNORE ' : ''}INTO ${table} (${entries.map(([key]) => key).join(',')}) VALUES (${entries.map(() => '?').join(',')})`,
    ).run(...entries.map(([, value]) => value as string | number | null))
  }
  insert(
    'sourceReleases',
    {
      id: sourceReleaseId,
      datasetId: row.datasetId,
      code: `source-${row.code ?? row.id}`,
      sourceVersion,
      sourceSchemaVersion,
      publicationDate,
      cohortKey,
      releaseNotesUrl,
      status: row.status ?? 'current',
    },
    true,
  )
  insert('resourceReleases', {
    code: row.id,
    resourceType: 'division',
    status: 'current',
    ...resource,
    sourceReleaseId,
  })
}
