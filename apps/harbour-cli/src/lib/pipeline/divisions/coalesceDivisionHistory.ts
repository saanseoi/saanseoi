import { Database, type SQLQueryBindings } from 'bun:sqlite'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import { resolveSnapshotSourceResolutions } from '@repo/core/pipeline/db/sourceResolutionReplay'
import { decodeStoredGeoJsonGeometry } from './processLocalDivisionGeometrySqlUploadStatistics.ts'
import type { ResolvedSqlCandidates } from '../local/resolvedSqlPlan.ts'

type Row = Record<string, SQLQueryBindings>
const metadata = new Set([
  'versionHash',
  'sourceReleaseId',
  'snapshotId',
  'isCurrent',
  'createdAt',
  'updatedAt',
])
const jsonColumns = new Set([
  'geometry',
  'bbox',
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
    primary: ['id', 'versionHash'],
  },
  {
    table: 'divisionsI18n',
    recordType: 'divisionI18n',
    id: 'divisionId',
    identity: ['divisionId', 'locale'],
    primary: ['divisionId', 'versionHash', 'locale'],
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
function lookup(
  db: Database,
  table: string,
  columns: readonly string[],
  row: Row,
  current = false,
) {
  return db
    .query<Row, SQLQueryBindings[]>(
      `SELECT * FROM ${quote(table)} WHERE ${columns.map(column => `${quote(column)} IS ?`).join(' AND ')}${current ? ' AND isCurrent=1' : ''}`,
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
      const owned = (id: SQLQueryBindings) =>
        Boolean(
          baseline
            .query('SELECT 1 FROM divisions WHERE snapshotId=? AND id=?')
            .get(receipt.scopeId, id) ||
            current
              .query('SELECT 1 FROM divisions WHERE snapshotId=? AND id=?')
              .get(receipt.scopeId, id),
        )
      for (const policy of policies) {
        const previousComponent = (identity: Row) => {
          if (
            !baseline
              .query('SELECT 1 FROM divisions WHERE snapshotId=? AND id=?')
              .get(receipt.scopeId, identity[policy.id] ?? null)
          )
            return undefined
          const found: Array<{ binding: string; row: Row }> = []
          for (const [binding, db] of baselines) {
            if (binding === 'DB_CURRENT') continue
            for (const row of lookup(db, policy.table, policy.identity, identity, true))
              found.push({ binding, row })
          }
          if (found.length > 1)
            throw new Error(
              `Ambiguous current Division component ${policy.table}/${identity[policy.id]}.`,
            )
          return found[0]
        }
        for (const [binding, candidate] of Object.entries(input.candidates)) {
          if (!binding.startsWith('DB_HISTORY')) continue
          const baselineDb = baselines.get(binding)
          if (!baselineDb)
            throw new Error(`Missing Division history baseline ${binding}.`)
          const journal = candidate.db
            .query<Row, [string, string]>(
              "SELECT * FROM snapshotVersionChanges WHERE snapshotId=? AND recordType=? AND operation='upsert'",
            )
            .all(receipt.snapshotId, policy.recordType)
          for (const change of journal) {
            if (!owned(change.recordId ?? null))
              throw new Error('Division journal contains an unowned component.')
            const identity: Row = {
              [policy.id]: change.recordId ?? null,
              locale: change.locale ?? '',
              versionHash: change.versionHash ?? null,
            }
            const row = lookup(candidate.db, policy.table, policy.primary, identity)[0]
            if (!row)
              throw new Error(
                'Division journal references unavailable component content.',
              )
            const prior = previousComponent(identity)
            const original = lookup(
              baselineDb,
              policy.table,
              policy.primary,
              identity,
            )[0]
            if (prior && semantic(prior.row) === semantic(row)) {
              if (original)
                replace(candidate.db, policy.table, policy.primary, original)
              else
                candidate.db
                  .query(
                    `DELETE FROM ${quote(policy.table)} WHERE ${policy.primary.map(column => `${quote(column)} IS ?`).join(' AND ')}`,
                  )
                  .run(...policy.primary.map(column => row[column] ?? null))
              const owner = input.candidates[prior.binding]
              if (!owner)
                throw new Error(`Missing Division history owner ${prior.binding}.`)
              replace(owner.db, policy.table, policy.primary, prior.row)
              candidate.db
                .query(
                  'DELETE FROM snapshotVersionChanges WHERE snapshotId=? AND recordType=? AND recordId=? AND locale=?',
                )
                .run(
                  receipt.snapshotId,
                  policy.recordType,
                  change.recordId ?? null,
                  change.locale ?? '',
                )
              if (policy.table === 'divisions')
                current
                  .query('UPDATE divisions SET sources=? WHERE snapshotId=? AND id=?')
                  .run(
                    prior.row.sources ?? null,
                    receipt.scopeId,
                    change.recordId ?? null,
                  )
            } else {
              if (original) {
                if (semantic(original) !== semantic(row))
                  throw new Error('Division component content hash collision.')
                replace(candidate.db, policy.table, policy.primary, {
                  ...original,
                  isCurrent: 1,
                  updatedAt: receipt.updatedAt,
                })
              }
              if (prior)
                input.candidates[prior.binding]?.db
                  .query(
                    `UPDATE ${quote(policy.table)} SET isCurrent=0,updatedAt=? WHERE ${policy.primary.map(column => `${quote(column)} IS ?`).join(' AND ')} AND isCurrent=1`,
                  )
                  .run(
                    receipt.updatedAt,
                    ...policy.primary.map(column => prior.row[column] ?? null),
                  )
            }
          }
        }
        for (const identity of baseline
          .query<Row, [string]>(
            `SELECT ${policy.identity.map(quote).join(',')} FROM ${quote(policy.table)} WHERE snapshotId=?`,
          )
          .iterate(receipt.scopeId)) {
          const present = current
            .query(
              `SELECT 1 FROM ${quote(policy.table)} WHERE snapshotId=? AND ${policy.identity.map(column => `${quote(column)} IS ?`).join(' AND ')}`,
            )
            .get(
              receipt.scopeId,
              ...policy.identity.map(column => identity[column] ?? null),
            )
          if (present) continue
          const prior = previousComponent(identity)
          if (!prior) throw new Error('Missing retired Division component history.')
          input.candidates[prior.binding]?.db
            .query(
              `UPDATE ${quote(policy.table)} SET isCurrent=0,updatedAt=? WHERE ${policy.primary.map(column => `${quote(column)} IS ?`).join(' AND ')} AND isCurrent=1`,
            )
            .run(
              receipt.updatedAt,
              ...policy.primary.map(column => prior.row[column] ?? null),
            )
          history
            .query(`INSERT INTO snapshotVersionChanges(snapshotId,recordType,recordId,locale,versionHash,operation,sourceReleaseId,createdAt,updatedAt)
            VALUES(?,?,?,?,NULL,'delete',?,?,?) ON CONFLICT(snapshotId,recordType,recordId,locale) DO NOTHING`)
            .run(
              receipt.snapshotId,
              policy.recordType,
              identity[policy.id] ?? null,
              policy.table === 'divisionsI18n' ? (identity.locale ?? '') : '',
              receipt.publicationToken,
              receipt.updatedAt,
              receipt.updatedAt,
            )
        }
      }
      if (previous?.snapshotId) {
        const meta = input.candidates.DB_META?.drizzle
        if (!meta)
          throw new Error('Division provenance replay requires the metadata mirror.')
        const plan = await resolveSnapshotReplayPlan(meta as never, previous.snapshotId)
        const prior = await resolveSnapshotSourceResolutions(
          plan,
          new Map(
            [...baselines]
              .filter(([binding]) => binding.startsWith('DB_HISTORY'))
              .map(([bindingName, db]) => [
                bindingName,
                { bindingName, db: drizzle({ client: db }) as never },
              ]),
          ),
        )
        for (const [binding, candidate] of Object.entries(input.candidates)) {
          if (!binding.startsWith('DB_HISTORY')) continue
          for (const row of candidate.db
            .query<
              {
                sourceRecordId: string
                sourceReleaseId: string
                sourceVersionHash: string
                resolutions: string
              },
              [string]
            >(
              'SELECT sourceRecordId,sourceReleaseId,sourceVersionHash,resolutions FROM sourceResolutions WHERE snapshotId=?',
            )
            .all(receipt.snapshotId)) {
            const previous = prior.get(row.sourceRecordId)
            if (
              previous?.sourceVersionHash === row.sourceVersionHash &&
              canonical(previous.resolutions) === canonical(JSON.parse(row.resolutions))
            )
              candidate.db
                .query(
                  'DELETE FROM sourceResolutions WHERE scopeId=? AND sourceReleaseId=? AND sourceRecordId=? AND sourceVersionHash=?',
                )
                .run(
                  `snapshot:${receipt.snapshotId}`,
                  row.sourceReleaseId,
                  row.sourceRecordId,
                  row.sourceVersionHash,
                )
          }
        }
      }
    }
  } finally {
    for (const db of baselines.values()) db.close()
  }
}
