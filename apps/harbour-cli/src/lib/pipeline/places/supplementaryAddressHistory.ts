import type { Database } from 'bun:sqlite'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import { resolveSnapshotVersionState } from '@repo/core/pipeline/db/snapshotReplay'
import { historyDeletionSql } from '@repo/db'
import { drizzle } from 'drizzle-orm/bun-sqlite'
import { placeHistoryInsertSql } from './placeHistory'
import { insertSql } from './processLocalPlaceSqlUploadImport.ts'
import type { buildSupplementaryAddressRows } from './supplementaryPlaceAddressRows.ts'

type AddressRows = Awaited<ReturnType<typeof buildSupplementaryAddressRows>>
const policies = [
  { table: 'address2d', keys: ['id'] },
  { table: 'address2dI18n', keys: ['addressId', 'locale'] },
  { table: 'address2dBuildingNumberLookup', keys: ['addressId', 'buildingNumber'] },
] as const

/** Supplementary components inherit from the exact parent; root snapshots store their own content. */
export async function materialiseSupplementaryAddressHistory(input: {
  candidates: Record<string, { db: Database }>
  addresses: AddressRows
  scopeId: string
  scopeSnapshotIds: string[]
  snapshotId: string
  resourceReleaseId: string
  historyBinding: string
  revokedAddressIds: string[]
  now: string
}) {
  const current = input.candidates.DB_CURRENT?.db
  const meta = input.candidates.DB_META?.db
  const target = input.candidates[input.historyBinding]?.db
  if (!current || !meta || !target)
    throw new Error(
      'Supplementary Address planning requires META, CURRENT and HISTORY.',
    )
  const snapshot = meta
    .query<{ parentSnapshotId: string | null }, [string]>(
      'SELECT parentSnapshotId FROM snapshots WHERE id=?',
    )
    .get(input.snapshotId)
  if (!snapshot) throw new Error(`Unknown supplementary snapshot ${input.snapshotId}.`)
  const plan = snapshot.parentSnapshotId
    ? await resolveSnapshotReplayPlan(
        drizzle({ client: meta }) as never,
        snapshot.parentSnapshotId,
      )
    : []
  const shards = new Map(
    Object.entries(input.candidates)
      .filter(([binding]) => binding.startsWith('DB_HISTORY_'))
      .map(([bindingName, { db }]) => [
        bindingName,
        { bindingName, db: drizzle({ client: db }) as never },
      ]),
  )
  const previous = await resolveSnapshotVersionState(
    plan,
    shards,
    policies.map(policy => policy.table),
  )
  const owners = new Set<string>([input.historyBinding])
  const timestamp = { createdAt: input.now }
  for (const policy of policies) {
    const wanted = input.addresses.flatMap<
      Record<string, unknown> & { versionHash: string }
    >(row => {
      if (policy.table === 'address2d')
        return [{ ...row.canonical, versionHash: row.versionHash }]
      if (policy.table === 'address2dI18n')
        return row.i18n.map(value => {
          const versionHash = row.i18nVersionHashes[value.locale]
          if (!versionHash) throw new Error('Missing supplementary locale hash.')
          return { ...value, versionHash }
        })
      return row.lookups
    })
    const seen = new Set<string>()
    for (const row of wanted) {
      const recordId =
        policy.table === 'address2dBuildingNumberLookup'
          ? JSON.stringify([row.addressId, row.buildingNumber])
          : String(row.id ?? row.addressId)
      const locale = policy.table === 'address2dI18n' ? String(row.locale) : ''
      const key = `${policy.table}\0${recordId}\0${locale}`
      seen.add(key)
      if (previous.get(key)?.versionHash === row.versionHash) continue
      target.exec(
        placeHistoryInsertSql(
          policy.table,
          {
            ...row,
            snapshotId: input.snapshotId,
            operation: 'upsert',
            isCurrent: 1,
            ...timestamp,
          },
          input.now,
        ),
      )
    }
    for (const prior of previous.values()) {
      if (
        prior.recordType !== policy.table ||
        seen.has(`${policy.table}\0${prior.recordId}\0${prior.locale}`)
      )
        continue
      target.exec(
        historyDeletionSql({
          snapshotId: input.snapshotId,
          recordType: policy.table,
          recordId: prior.recordId,
          locale: prior.locale,

          ...timestamp,
        }),
      )
    }
  }
  for (const id of input.revokedAddressIds)
    target.exec(
      historyDeletionSql({
        snapshotId: input.snapshotId,
        recordType: 'address2d',
        recordId: id,

        ...timestamp,
      }),
    )

  // Final-difference filtering removes unchanged current locale and lookup rewrites.
  current.transaction(() => {
    for (const table of ['address2dBuildingNumberLookup', 'address2dI18n', 'address2d'])
      current.query(`DELETE FROM ${table} WHERE scopeId=?`).run(input.scopeId)
    for (const row of input.addresses) {
      current.exec(
        insertSql('address2d', {
          ...row.current,
          scopeId: input.scopeId,
          ...timestamp,
        }),
      )
      for (const value of row.i18n)
        current.exec(
          insertSql('address2dI18n', {
            ...value,
            scopeId: input.scopeId,
            ...timestamp,
          }),
        )
      for (const { versionHash: _versionHash, ...lookup } of row.lookups)
        current.exec(
          insertSql('address2dBuildingNumberLookup', {
            ...lookup,
            scopeId: input.scopeId,
            ...timestamp,
          }),
        )
    }
  })()
  return owners
}
