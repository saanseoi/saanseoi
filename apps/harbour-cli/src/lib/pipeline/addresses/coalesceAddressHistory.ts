import { Database } from 'bun:sqlite'
import { buildAddressBaseHashInput } from '@repo/core/pipeline/services/addresses/normalisation'
import type { ResolvedSnapshotVersion } from '@repo/core/pipeline/db/snapshotReplay'

type Row = Record<string, string | number | null>
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`
const policies = [
  {
    table: 'address2d',
    identity: ['id'],
    primary: ['id', 'versionHash'],
    recordType: 'address2d',
    id: 'id',
  },
  {
    table: 'address2dI18n',
    identity: ['addressId', 'locale'],
    primary: ['addressId', 'versionHash', 'locale'],
    recordType: 'address2dI18n',
    id: 'addressId',
  },
  {
    table: 'address2dBuildingNumberLookup',
    identity: ['addressId', 'buildingNumber'],
    primary: ['addressId', 'versionHash', 'buildingNumber'],
    recordType: null,
    id: 'addressId',
  },
] as const
const metadata = new Set([
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
    for (const column of ['geometry', 'bbox', 'identifiers', 'sources'])
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

/**
 * The 2D normaliser hashes the complete address for change detection. Its components
 * inherit independently: a locale edit must not duplicate an identical base, another
 * translation or a derived lookup. Baseline reads stay on this machine under the
 * shared delivery lock, and the temporary journal keeps changed-row memory bounded.
 */
export function coalesceAddressHistory(input: {
  candidates: Record<string, { db: Database }>
  files: Record<string, string>
  historyBinding: string
  snapshotId: string
  scopeId: string
  now: string
  prior: readonly (Pick<
    ResolvedSnapshotVersion,
    'recordType' | 'recordId' | 'locale' | 'versionHash'
  > & {
    shard: { bindingName: string }
  })[]
}) {
  const target = input.candidates[input.historyBinding]!.db
  const baselines = new Map<string, Database>()
  target.exec(
    'CREATE TEMP TABLE addressHistoryBaseline(identity TEXT PRIMARY KEY,binding TEXT NOT NULL,contents TEXT NOT NULL); CREATE TEMP TABLE addressHistoryPending(seq INTEGER PRIMARY KEY,contents TEXT NOT NULL); CREATE TEMP TABLE addressHistoryScope(id TEXT PRIMARY KEY); CREATE TEMP TABLE addressHistoryChanged(id TEXT,versionHash TEXT,PRIMARY KEY(id,versionHash));',
  )
  const replace = (
    db: Database,
    table: string,
    primary: readonly string[],
    row: Row,
  ) => {
    const columns = Object.keys(row)
    db.query(`INSERT INTO ${quote(table)}(${columns.map(quote).join(',')}) VALUES(${columns.map(() => '?').join(',')})
      ON CONFLICT(${primary.map(quote).join(',')}) DO UPDATE SET ${columns
        .filter(column => !primary.includes(column))
        .map(column => `${quote(column)}=excluded.${quote(column)}`)
        .join(',')}`).run(...columns.map(column => row[column]!))
  }
  const currentBaseline = new Database(input.files.DB_CURRENT!, {
    readonly: true,
    create: false,
  })
  try {
    target.transaction(() => {
      const insert = target.query('INSERT INTO addressHistoryScope VALUES(?)')
      for (const row of currentBaseline
        .query<{ id: string }, [string]>('SELECT id FROM address2d WHERE snapshotId=?')
        .iterate(input.scopeId))
        insert.run(row.id)
    })()
    target
      .query(
        "INSERT INTO addressHistoryChanged SELECT DISTINCT recordId,versionHash FROM snapshotVersionChanges WHERE snapshotId=? AND recordType IN ('address2d','address2dI18n') AND operation='upsert'",
      )
      .run(input.snapshotId)
    for (const [binding, path] of Object.entries(input.files))
      if (binding.startsWith('DB_HISTORY_'))
        baselines.set(binding, new Database(path, { readonly: true, create: false }))
    for (const policy of policies) {
      target.exec(
        'DELETE FROM addressHistoryBaseline; DELETE FROM addressHistoryPending;',
      )
      const insert = target.query('INSERT INTO addressHistoryBaseline VALUES(?,?,?)')
      target.transaction(() => {
        if (policy.recordType) {
          for (const version of input.prior) {
            if (
              version.recordType !== policy.recordType ||
              !target
                .query('SELECT 1 FROM addressHistoryScope WHERE id=?')
                .get(version.recordId)
            )
              continue
            const binding = version.shard.bindingName
            const db = baselines.get(binding)
            if (!db)
              throw new Error(`Missing selected Address history shard ${binding}.`)
            const key: Row = {
              [policy.id]: version.recordId,
              versionHash: version.versionHash,
              locale: version.locale,
            }
            const row = db
              .query<Row, Array<string | number | null>>(
                `SELECT * FROM ${policy.table} WHERE ${policy.primary.map(column => `${quote(column)} IS ?`).join(' AND ')}`,
              )
              .get(...policy.primary.map(column => key[column]!))
            if (!row)
              throw new Error(
                `Missing selected Address component ${policy.table}/${version.recordId} in ${binding}.`,
              )
            insert.run(identity(row, policy.identity), binding, JSON.stringify(row))
          }
        } else {
          // Derived lookup rows have no independent snapshot journal. Match the
          // serving projection's exact content, which rollback rebuilds from locales.
          for (const row of currentBaseline
            .query<Row, [string]>(
              'SELECT * FROM address2dBuildingNumberLookup WHERE snapshotId=?',
            )
            .iterate(input.scopeId)) {
            let retained = false
            for (const [binding, db] of baselines) {
              // An early break finalises Bun's cached iterator. Exhaust this exact
              // address/number lookup before reusing its prepared statement.
              for (const candidate of db
                .query<Row, Array<string | number | null>>(
                  'SELECT * FROM address2dBuildingNumberLookup WHERE addressId=? AND buildingNumber=? ORDER BY createdAt,versionHash',
                )
                .all(row.addressId!, row.buildingNumber!)) {
                if (semantic(candidate) !== semantic(row)) continue
                insert.run(
                  identity(candidate, policy.identity),
                  binding,
                  JSON.stringify(candidate),
                )
                retained = true
                break
              }
              if (retained) break
            }
          }
        }
      })()
      const queue = target.query(
        'INSERT INTO addressHistoryPending(contents) VALUES(?)',
      )
      target.transaction(() => {
        const rows = policy.recordType
          ? target
              .query<Row, [string, string]>(
                `SELECT v.* FROM ${policy.table} v JOIN snapshotVersionChanges j ON j.recordId=v.${policy.id} AND j.versionHash=v.versionHash ${policy.recordType === 'address2dI18n' ? 'AND j.locale=v.locale' : ''} WHERE j.snapshotId=? AND j.recordType=? AND j.operation='upsert'`,
              )
              .iterate(input.snapshotId, policy.recordType)
          : target
              .query<Row, []>(
                `SELECT v.* FROM ${policy.table} v WHERE EXISTS (SELECT 1 FROM addressHistoryChanged c WHERE c.id=v.${policy.id} AND c.versionHash=v.versionHash)`,
              )
              .iterate()
        for (const row of rows) queue.run(JSON.stringify(row))
      })()
      for (const entry of target
        .query<{ contents: string }, []>(
          'SELECT contents FROM addressHistoryPending ORDER BY seq',
        )
        .iterate()) {
        const row = JSON.parse(entry.contents) as Row
        const prior = target
          .query<{ binding: string; contents: string }, [string]>(
            'SELECT binding,contents FROM addressHistoryBaseline WHERE identity=?',
          )
          .get(identity(row, policy.identity))
        const original = baselines
          .get(input.historyBinding)!
          .query<Row, Array<string | number | null>>(
            `SELECT * FROM ${policy.table} WHERE ${policy.primary.map(column => `${quote(column)} IS ?`).join(' AND ')}`,
          )
          .get(...policy.primary.map(column => row[column]!))
        if (prior && semantic(JSON.parse(prior.contents)) === semantic(row)) {
          const old = JSON.parse(prior.contents) as Row
          if (
            identity(row, policy.primary) !== identity(old, policy.primary) ||
            prior.binding !== input.historyBinding
          ) {
            if (original) replace(target, policy.table, policy.primary, original)
            else
              target
                .query(
                  `DELETE FROM ${policy.table} WHERE ${policy.primary.map(column => `${quote(column)} IS ?`).join(' AND ')}`,
                )
                .run(...policy.primary.map(column => row[column]!))
          }
          replace(
            input.candidates[prior.binding]!.db,
            policy.table,
            policy.primary,
            old,
          )
          if (policy.table === 'address2d')
            input.candidates
              .DB_CURRENT!.db.query(
                'UPDATE address2d SET sources=? WHERE snapshotId=? AND id=?',
              )
              .run(old.sources ?? null, input.scopeId, old.id!)
          if (policy.recordType)
            target
              .query(
                "DELETE FROM snapshotVersionChanges WHERE snapshotId=? AND recordType=? AND recordId=? AND locale=? AND operation='upsert'",
              )
              .run(
                input.snapshotId,
                policy.recordType,
                row[policy.id]!,
                policy.recordType === 'address2dI18n' ? row.locale! : '',
              )
        } else {
          if (original) {
            if (semantic(original) !== semantic(row))
              throw new Error(`Address content hash collision in ${policy.table}.`)
            replace(target, policy.table, policy.primary, {
              ...original,
              isCurrent: 1,
              updatedAt: input.now,
            })
          }
          if (prior) {
            const old = JSON.parse(prior.contents) as Row
            input.candidates[prior.binding]!.db.query(
              `UPDATE ${policy.table} SET isCurrent=0,updatedAt=? WHERE ${policy.primary.map(column => `${quote(column)} IS ?`).join(' AND ')} AND isCurrent=1`,
            ).run(input.now, ...policy.primary.map(column => old[column]!))
          }
        }
      }
      if (policy.table === 'address2dBuildingNumberLookup') {
        const current = input.candidates.DB_CURRENT!.db
        for (const prior of target
          .query<{ binding: string; contents: string }, []>(
            'SELECT binding,contents FROM addressHistoryBaseline',
          )
          .iterate()) {
          const row = JSON.parse(prior.contents) as Row
          if (
            !current
              .query(
                'SELECT 1 FROM address2dBuildingNumberLookup WHERE snapshotId=? AND addressId=? AND buildingNumber=?',
              )
              .get(input.scopeId, row.addressId!, row.buildingNumber!)
          )
            input.candidates[prior.binding]!.db.query(
              'UPDATE address2dBuildingNumberLookup SET isCurrent=0,updatedAt=? WHERE addressId=? AND versionHash=? AND buildingNumber=? AND isCurrent=1',
            ).run(input.now, row.addressId!, row.versionHash!, row.buildingNumber!)
        }
      }
    }
  } finally {
    currentBaseline.close()
    for (const db of baselines.values()) db.close()
    target.exec(
      'DROP TABLE temp.addressHistoryBaseline; DROP TABLE temp.addressHistoryPending; DROP TABLE temp.addressHistoryScope; DROP TABLE temp.addressHistoryChanged;',
    )
  }
}
