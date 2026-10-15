import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay'
import { historyDeletionSql } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { restoreSnapshotProjection } from '../../commands/rollback/projection'
import type { ResolvedSqlCandidates } from '../local/resolvedSqlPlan.ts'
import { decodeStoredGeoJsonGeometry } from './processLocalDivisionGeometrySqlUploadStatistics.ts'

type Row = Record<string, SQLQueryBindings>
const metadata = new Set([
  'operation',
  'versionHash',
  'sourceReleaseId',
  'snapshotId',
  'isCurrent',
  'createdAt',
  'updatedAt',
])
const jsonColumns = new Set([
  'geometry',
  'hierarchies',
  'identifiers',
  'cartography',
  'sources',
  'nameVariant',
  'nameRules',
])
const policies = [
  {
    table: 'divisions',
    recordType: 'division',
    id: 'id',
    identity: ['id'],
    primary: ['id', 'snapshotId'],
  },
  {
    table: 'divisionsI18n',
    recordType: 'divisionI18n',
    id: 'divisionId',
    identity: ['divisionId', 'locale'],
    primary: ['divisionId', 'snapshotId', 'locale'],
  },
] as const
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`
const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  )
function withoutPublicationVersion(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPublicationVersion)
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'sourceVersion')
        .map(([key, item]) => [key, withoutPublicationVersion(item)]),
    )
  return value
}
function semantic(row: Row) {
  return canonical(
    Object.fromEntries(
      Object.entries(row)
        .filter(([name]) => !metadata.has(name))
        .map(([name, value]) => {
          let parsed: unknown = value
          if (name === 'geometry' && value !== null)
            parsed = decodeStoredGeoJsonGeometry(value)
          else if (jsonColumns.has(name) && typeof value === 'string')
            parsed = JSON.parse(value)
          if (name === 'sources') parsed = withoutPublicationVersion(parsed)
          return [name, parsed]
        }),
    ),
  )
}
function lookup(db: Database, table: string, columns: readonly string[], row: Row) {
  return db
    .query<Row, SQLQueryBindings[]>(
      `SELECT * FROM ${quote(table)} WHERE ${columns.map(column => `${quote(column)} IS ?`).join(' AND ')}`,
    )
    .all(...columns.map(column => row[column] ?? null))
}
function replace(db: Database, table: string, primary: readonly string[], row: Row) {
  const columns = Object.keys(row)
  db.query(`INSERT INTO ${quote(table)}(${columns.map(quote).join(',')}) VALUES(${columns.map(() => '?').join(',')})
    ON CONFLICT(${primary.map(quote).join(',')}) DO UPDATE SET ${columns
      .filter(column => !primary.includes(column))
      .map(column => `${quote(column)}=excluded.${quote(column)}`)
      .join(',')}`).run(...columns.map(column => row[column] ?? null))
}

/**
 * Division adapters produce a complete current candidate and version journals.
 * Compare only scoped base/locale components, preserving unchanged canonical rows
 * and their original journal owner. Source assertions inherit along explicit ancestry.
 * No family hash or published content is rewritten to manufacture a new identity.
 */
export async function coalesceDivisionHistory(input: {
  candidates: ResolvedSqlCandidates
  files: Record<string, string>
  historyBinding: string
}) {
  const baselines = new Map(
    Object.entries(input.files)
      .filter(
        ([binding]) => binding === 'DB_CURRENT' || binding.startsWith('DB_HISTORY'),
      )
      .map(([binding, path]) => [
        binding,
        new Database(path, { readonly: true, create: false }),
      ]),
  )
  const baseline = baselines.get('DB_CURRENT')
  const current = input.candidates.DB_CURRENT?.db
  const history = input.candidates[input.historyBinding]?.db
  if (!baseline || !current || !history)
    throw new Error(
      'Division history coalescing requires complete current/history mirrors.',
    )
  const replayBaselines: Database[] = []
  try {
    for (const receipt of current
      .query<
        {
          scopeId: string
          snapshotId: string
          publicationToken: string
          preparedAt: string | null
          updatedAt: string
        },
        []
      >('SELECT * FROM divisionPublicationState')
      .all()) {
      const previous = baseline
        .query<typeof receipt, [string]>(
          'SELECT * FROM divisionPublicationState WHERE scopeId=?',
        )
        .get(receipt.scopeId)
      if (canonical(previous) === canonical(receipt)) continue
      if (!receipt.preparedAt)
        throw new Error('Cannot coalesce an incomplete Division publication.')
      const meta = input.candidates.DB_META?.drizzle
      if (previous?.snapshotId && !meta)
        throw new Error('Division history replay requires the metadata mirror.')
      const parent = input.candidates.DB_META?.db
        .query<{ parentSnapshotId: string | null }, [string]>(
          'SELECT parentSnapshotId FROM snapshots WHERE id=?',
        )
        .get(receipt.snapshotId)
      const parentSnapshotId = parent?.parentSnapshotId ?? previous?.snapshotId
      const selectedBaseline = new Database(':memory:')
      for (const table of ['divisions', 'divisionsI18n']) {
        const schema = baseline
          .query<{ sql: string }, [string]>(
            "SELECT sql FROM sqlite_master WHERE name=? AND type='table'",
          )
          .get(table)!
        selectedBaseline.exec(schema.sql)
      }
      replayBaselines.push(selectedBaseline)
      if (parentSnapshotId && parentSnapshotId !== previous?.snapshotId) {
        await restoreSnapshotProjection({
          current: selectedBaseline,
          metaDb: meta as never,
          historyTargets: [...baselines]
            .filter(([binding]) => binding.startsWith('DB_HISTORY'))
            .map(([bindingName, db]) => ({
              bindingName,
              db: drizzle({ client: db }) as never,
            })),
          snapshotId: parentSnapshotId,
          scopeId: receipt.scopeId,
          resourceType: 'division',
          deferForeignKeyValidation: true,
        })
      } else {
        for (const table of ['divisions', 'divisionsI18n'])
          for (const row of baseline
            .query<Row, [string]>(`SELECT * FROM ${quote(table)} WHERE scopeId=?`)
            .iterate(receipt.scopeId))
            replace(
              selectedBaseline,
              table,
              table === 'divisions'
                ? ['scopeId', 'id']
                : ['scopeId', 'divisionId', 'locale'],
              row,
            )
      }
      const previousPlan = parentSnapshotId
        ? await resolveSnapshotReplayPlan(meta as never, parentSnapshotId)
        : []
      const namedBaselines = new Map(
        [...baselines]
          .filter(([binding]) => binding.startsWith('DB_HISTORY'))
          .map(([bindingName, db]) => [
            bindingName,
            { bindingName, db: drizzle({ client: db }) as never },
          ]),
      )
      const previousVersions = await resolveSnapshotVersionState(
        previousPlan,
        namedBaselines,
        policies.map(policy => policy.recordType),
      )
      for (const policy of policies) {
        const priorRows = new Map<string, Row>()
        for (const version of previousVersions.values()) {
          if (version.recordType !== policy.recordType) continue
          const db = baselines.get(version.shard.bindingName)
          if (!db)
            throw new Error(
              `Missing Division parent binding ${version.shard.bindingName}.`,
            )
          const row = lookup(db, policy.table, policy.primary, {
            [policy.id]: version.recordId,
            locale: version.locale,
            snapshotId: version.snapshotId,
          })[0]
          if (row?.operation !== 'upsert' || row.versionHash !== version.versionHash)
            throw new Error(
              `Missing exact Division parent ${version.recordId}/${version.locale}.`,
            )
          priorRows.set(canonical(policy.identity.map(key => row[key])), row)
        }
        if (parentSnapshotId && parentSnapshotId === previous?.snapshotId) {
          for (const row of selectedBaseline
            .query<Row, [string]>(
              `SELECT * FROM ${quote(policy.table)} WHERE scopeId=?`,
            )
            .all(receipt.scopeId)) {
            if (!priorRows.has(canonical(policy.identity.map(key => row[key]))))
              throw new Error(
                `Missing exact Division parent ${row[policy.id]}/${row.locale ?? ''}.`,
              )
          }
        }
        for (const [binding, candidate] of Object.entries(input.candidates)) {
          if (!binding.startsWith('DB_HISTORY')) continue
          for (const row of candidate.db
            .query<Row, [string]>(
              `SELECT * FROM ${quote(policy.table)} WHERE snapshotId=? AND operation='upsert'`,
            )
            .all(receipt.snapshotId)) {
            const prior = priorRows.get(canonical(policy.identity.map(key => row[key])))
            if (prior && semantic(prior) === semantic(row)) {
              if (policy.table === 'divisions')
                current
                  .query(
                    'UPDATE divisions SET sources=? WHERE scopeId=? AND id=? AND sources IS NOT ?',
                  )
                  .run(
                    prior.sources ?? null,
                    receipt.scopeId,
                    row.id ?? null,
                    prior.sources ?? null,
                  )
              candidate.db
                .query(
                  `DELETE FROM ${quote(policy.table)} WHERE ${policy.primary.map(key => `${quote(key)} IS ?`).join(' AND ')}`,
                )
                .run(...policy.primary.map(key => row[key] ?? null))
            }
          }
        }
        for (const row of priorRows.values()) {
          const present = current
            .query(
              `SELECT 1 FROM ${quote(policy.table)} WHERE scopeId=? AND ${policy.identity.map(key => `${quote(key)} IS ?`).join(' AND ')}`,
            )
            .get(receipt.scopeId, ...policy.identity.map(key => row[key] ?? null))
          if (!present)
            history.exec(
              historyDeletionSql({
                snapshotId: receipt.snapshotId,
                recordType: policy.recordType,
                recordId: String(row[policy.id]),
                locale: policy.table === 'divisionsI18n' ? String(row.locale) : '',

                createdAt: receipt.updatedAt,
              }),
            )
        }
      }
    }
  } finally {
    for (const db of replayBaselines) db.close()
    for (const db of baselines.values()) db.close()
  }
}
