import { Database } from 'bun:sqlite'
import type { ResolvedSnapshotVersion } from '@repo/core/pipeline/db/snapshotReplay'
import { buildAddressBaseHashInput } from '@repo/core/pipeline/services/addresses/normalisation'

type Row = Record<string, string | number | null>
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`
const policies = [
  {
    table: 'address2d',
    identity: ['id'],
    primary: ['id', 'snapshotId'],
    recordType: 'address2d',
    id: 'id',
  },
  {
    table: 'address2dI18n',
    identity: ['addressId', 'locale'],
    primary: ['addressId', 'snapshotId', 'locale'],
    recordType: 'address2dI18n',
    id: 'addressId',
  },
  {
    table: 'address2dBuildingNumberLookup',
    identity: ['addressId', 'buildingNumber'],
    primary: ['addressId', 'snapshotId', 'buildingNumber'],
    recordType: 'address2dBuildingNumberLookup',
    id: 'addressId',
  },
] as const
const metadata = new Set([
  'operation',
  'versionHash',
  'sourceReleaseId',
  'snapshotId',
  'isCurrent',
  'createdAt',
  'updatedAt',
])
const identity = (row: Row, columns: readonly string[]) =>
  JSON.stringify(columns.map(column => row[column]))
const semantic = (row: Row) => {
  if ('id' in row) {
    const parsed = { ...row }
    for (const column of ['geometry', 'identifiers', 'sources'])
      if (typeof parsed[column] === 'string')
        parsed[column] = JSON.parse(parsed[column] as string)
    return JSON.stringify(
      buildAddressBaseHashInput(
        parsed as unknown as Parameters<typeof buildAddressBaseHashInput>[0],
      ),
    )
  }
  return JSON.stringify(
    Object.entries(row)
      .filter(([key]) => !metadata.has(key))
      .sort(([a], [b]) => a.localeCompare(b)),
  )
}

/** Remove redundant draft events by comparing only the selected parent branch. */
export function coalesceAddressHistory(input: {
  candidates: Record<string, { db: Database }>
  files: Record<string, string>
  historyBinding: string
  snapshotId: string
  scopeId: string
  now: string
  prior: readonly ResolvedSnapshotVersion[]
}) {
  const target = input.candidates[input.historyBinding]!.db
  const baselines = new Map<string, Database>()
  try {
    for (const [binding, path] of Object.entries(input.files))
      if (binding.startsWith('DB_HISTORY_'))
        baselines.set(binding, new Database(path, { readonly: true, create: false }))
    for (const policy of policies) {
      const previous = new Map<string, { binding: string; row: Row }>()
      for (const version of input.prior) {
        if (version.recordType !== policy.recordType) continue
        const db = baselines.get(version.shard.bindingName)
        if (!db)
          throw new Error(`Missing parent HISTORY shard ${version.shard.bindingName}.`)
        const values =
          policy.table === 'address2dBuildingNumberLookup'
            ? (JSON.parse(version.recordId) as string[])
            : [
                version.recordId,
                ...(policy.table === 'address2dI18n' ? [version.locale] : []),
              ]
        const row = db
          .query<Row, Array<string>>(
            `SELECT * FROM ${quote(policy.table)} WHERE ${policy.identity.map(key => `${quote(key)}=?`).join(' AND ')} AND snapshotId=? AND operation='upsert'`,
          )
          .get(...values, version.snapshotId)
        if (!row || row.versionHash !== version.versionHash)
          throw new Error(`Missing exact parent ${policy.table}/${version.recordId}.`)
        previous.set(identity(row, policy.identity), {
          binding: version.shard.bindingName,
          row,
        })
      }
      const rows = target
        .query<Row, [string]>(
          `SELECT * FROM ${quote(policy.table)} WHERE snapshotId=? AND operation='upsert'`,
        )
        .all(input.snapshotId)
      for (const row of rows) {
        const prior = previous.get(identity(row, policy.identity))
        if (!prior || semantic(prior.row) !== semantic(row)) continue
        target
          .query(
            `DELETE FROM ${quote(policy.table)} WHERE ${policy.primary.map(key => `${quote(key)}=?`).join(' AND ')}`,
          )
          .run(...policy.primary.map(key => row[key]!))
        if (policy.table === 'address2d')
          input.candidates
            .DB_CURRENT!.db.query(
              'UPDATE address2d SET sources=? WHERE scopeId=? AND id=?',
            )
            .run(prior.row.sources ?? null, input.scopeId, row.id!)
      }
    }
  } finally {
    for (const db of baselines.values()) db.close()
  }
}
