import type { Database } from 'bun:sqlite'
import { createHash } from '@repo/core/pipeline/utils'
import type { buildSupplementaryAddressRows } from './supplementaryPlaceAddressRows.ts'
import { insertSql } from './processLocalPlaceSqlUploadImport.ts'

type Row = Record<string, string | number | null>
type AddressRows = Awaited<ReturnType<typeof buildSupplementaryAddressRows>>
const policies = [
  { table: 'address2d', keys: ['id'], journal: true },
  { table: 'address2dI18n', keys: ['addressId', 'locale'], journal: true },
  {
    table: 'address2dBuildingNumberLookup',
    keys: ['addressId', 'buildingNumber'],
    journal: false,
  },
  { table: 'address2dEvidence', keys: ['addressId'], journal: true },
] as const
const identity = (row: Record<string, unknown>, keys: readonly string[]) =>
  JSON.stringify(keys.map(key => row[key]))
const where = (keys: readonly string[]) =>
  keys.map(key => `"${key}" IS ?`).join(' AND ')

/**
 * Root snapshots keep full membership journals in the shard owning each immutable
 * component. Only changed or withdrawn components close; edition evidence has its
 * own version. All writes here target disposable net-plan candidates.
 */
export async function materialiseSupplementaryAddressHistory(input: {
  candidates: Record<string, { db: Database }>
  addresses: AddressRows
  scopeId: string
  scopeSnapshotIds: string[]
  snapshotId: string
  releaseId: string
  historyBinding: string
  revokedAddressIds: string[]
  now: string
}) {
  const current = input.candidates.DB_CURRENT?.db
  if (!current) throw new Error('Supplementary Address planning requires DB_CURRENT.')
  const histories = Object.entries(input.candidates)
    .filter(([binding]) => binding.startsWith('DB_HISTORY_'))
    .sort(([a], [b]) => a.localeCompare(b))
  const target = input.candidates[input.historyBinding]?.db
  if (!target) throw new Error(`Missing supplementary history ${input.historyBinding}.`)
  const owners = new Set<string>([input.historyBinding])
  const originSnapshots = new Set(input.scopeSnapshotIds)
  const receipts = current
    .query<{ scopeId: string; snapshotId: string }, []>(
      'SELECT scopeId,snapshotId FROM addressPublicationState WHERE preparedAt IS NOT NULL',
    )
    .all()
  const ownSnapshots = new Set(
    receipts.filter(row => row.scopeId === input.scopeId).map(row => row.snapshotId),
  )
  const otherSnapshots = new Set(
    receipts.filter(row => row.scopeId !== input.scopeId).map(row => row.snapshotId),
  )
  const priorLocales = current
    .query<{ addressId: string; locale: string }, [string]>(
      'SELECT addressId,locale FROM address2dI18n WHERE snapshotId=?',
    )
    .all(input.scopeId)
  const timestamp = { createdAt: input.now, updatedAt: input.now }
  const journal = (
    db: Database,
    table: string,
    recordId: string,
    locale: string,
    versionHash: string | null,
  ) =>
    db.exec(
      insertSql('snapshotVersionChanges', {
        snapshotId: input.snapshotId,
        recordType: table,
        recordId,
        locale,
        versionHash,
        operation: versionHash ? 'upsert' : 'delete',
        sourceReleaseId: input.releaseId,
        ...timestamp,
      }),
    )

  for (const [, { db }] of histories)
    db.query('DELETE FROM snapshotVersionChanges WHERE snapshotId=?').run(
      input.snapshotId,
    )
  for (const policy of policies) {
    const wanted = input.addresses.flatMap<
      Record<string, unknown> & { versionHash: string }
    >(row => {
      switch (policy.table) {
        case 'address2d':
          return [{ ...row.canonical, versionHash: row.versionHash }]
        case 'address2dI18n':
          return row.i18n.map(value => {
            const versionHash = row.i18nVersionHashes[value.locale]
            if (!versionHash) throw new Error('Missing supplementary locale hash.')
            return { ...value, versionHash }
          })
        case 'address2dBuildingNumberLookup':
          return row.lookups
        case 'address2dEvidence':
          return [row.evidence]
      }
      throw new Error('Unknown supplementary Address component.')
    })
    const selected = new Map(
      wanted.map(row => [identity(row, policy.keys), row.versionHash]),
    )
    const primary = [...policy.keys, 'versionHash']
    for (const [, { db }] of histories) {
      const prior = new Set<string>()
      const elsewhere = new Set<string>()
      if (policy.journal) {
        for (const reference of db
          .query<
            {
              snapshotId: string
              recordId: string
              locale: string
              versionHash: string
            },
            [string, string]
          >(`SELECT snapshotId,recordId,locale,versionHash FROM snapshotVersionChanges
          WHERE snapshotId IN (SELECT value FROM json_each(?)) AND recordType=? AND operation='upsert' AND recordId LIKE 'opa-%'`)
          .all(JSON.stringify([...ownSnapshots, ...otherSnapshots]), policy.table)) {
          const key = identity(
            {
              id: reference.recordId,
              addressId: reference.recordId,
              locale: reference.locale,
              versionHash: reference.versionHash,
            },
            primary,
          )
          if (ownSnapshots.has(reference.snapshotId)) prior.add(key)
          if (otherSnapshots.has(reference.snapshotId)) elsewhere.add(key)
        }
      }
      // Live membership can belong to several lineages while content retains its
      // original snapshot. A closure must respect every current selection.
      const active = db
        .query<Row, []>(
          `SELECT * FROM ${policy.table} WHERE isCurrent=1 AND ${policy.keys[0]} LIKE 'opa-%'`,
        )
        .all()
      for (const row of active) {
        const key = identity(row, primary)
        let owned = originSnapshots.has(String(row.snapshotId)) || prior.has(key)
        let shared = elsewhere.has(key)
        if (!policy.journal) {
          const fields = [
            'addressId',
            'buildingNumber',
            'numericStem',
            'evidence',
            'derivation',
          ]
          const lookupScopes = current
            .query<{ snapshotId: string }, Array<string | number | null>>(
              `SELECT snapshotId FROM address2dBuildingNumberLookup WHERE ${where(fields)}`,
            )
            .all(...fields.map(field => row[field] ?? null))
          owned ||= lookupScopes.some(scope => scope.snapshotId === input.scopeId)
          shared = lookupScopes.some(scope => scope.snapshotId !== input.scopeId)
        }
        if (
          !owned ||
          shared ||
          selected.get(identity(row, policy.keys)) === row.versionHash
        )
          continue
        db.query(`UPDATE ${policy.table} SET isCurrent=0 WHERE ${where(primary)}`).run(
          ...primary.map(key => row[key] ?? null),
        )
      }
    }
    for (const row of wanted) {
      const values = primary.map(key => row[key] as string)
      let owner: { binding: string; db: Database; row: Row } | undefined
      for (const [binding, { db }] of histories) {
        const existing = db
          .query<Row, string[]>(`SELECT * FROM ${policy.table} WHERE ${where(primary)}`)
          .get(...values)
        if (existing) {
          const payload = Object.fromEntries(
            Object.keys(row).map(key => {
              const value = existing[key]
              return [
                key,
                ['identifiers', 'sources', 'bbox', 'geometry'].includes(key) &&
                typeof value === 'string'
                  ? JSON.parse(value)
                  : value,
              ]
            }),
          )
          if ((await createHash(payload)) !== (await createHash(row)))
            throw new Error(
              `Supplementary Address content hash collision in ${policy.table}.`,
            )
          if (!owner || existing.isCurrent) owner = { binding, db, row: existing }
        }
      }
      if (owner) {
        if (!owner.row.isCurrent)
          owner.db
            .query(`UPDATE ${policy.table} SET isCurrent=1 WHERE ${where(primary)}`)
            .run(...values)
      } else {
        target.exec(
          insertSql(policy.table, {
            ...row,
            snapshotId: input.snapshotId,
            sourceReleaseId: input.releaseId,
            isCurrent: 1,
            ...timestamp,
          }),
        )
        owner = { binding: input.historyBinding, db: target, row: {} }
      }
      owners.add(owner.binding)
      if (policy.journal)
        journal(
          owner.db,
          policy.table,
          String(row.id ?? row.addressId),
          String(row.locale ?? ''),
          row.versionHash,
        )
    }
  }
  for (const id of input.revokedAddressIds) {
    journal(target, 'address2d', id, '', null)
    journal(target, 'address2dEvidence', id, '', null)
  }
  const selectedLocales = new Set(
    input.addresses.flatMap(row =>
      row.i18n.map(value => identity(value, ['addressId', 'locale'])),
    ),
  )
  for (const value of priorLocales)
    if (!selectedLocales.has(identity(value, ['addressId', 'locale'])))
      journal(target, 'address2dI18n', value.addressId, value.locale, null)

  // Final-difference filtering removes unchanged current locale and lookup rewrites.
  current.transaction(() => {
    for (const table of ['address2dBuildingNumberLookup', 'address2dI18n', 'address2d'])
      current.query(`DELETE FROM ${table} WHERE snapshotId=?`).run(input.scopeId)
    for (const row of input.addresses) {
      current.exec(
        insertSql('address2d', {
          ...row.current,
          snapshotId: input.scopeId,
          ...timestamp,
        }),
      )
      for (const value of row.i18n)
        current.exec(
          insertSql('address2dI18n', {
            ...value,
            snapshotId: input.scopeId,
            ...timestamp,
          }),
        )
      for (const { versionHash: _versionHash, ...lookup } of row.lookups)
        current.exec(
          insertSql('address2dBuildingNumberLookup', {
            ...lookup,
            snapshotId: input.scopeId,
            ...timestamp,
          }),
        )
    }
  })()
  return owners
}
