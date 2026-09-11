import { eq, metaSnapshots } from '@repo/db'
import type { HarbourReadableDb } from '../../../lib/db/types'
import { resolveApiReleaseSetSnapshotsForRequest } from '../../../lib/db/metaRegistry'

export type AddressSearchScope = { scopeId: string; snapshotId: string }
const fields = [
  'scopeId',
  'addressId',
  'locale',
  'formattedAddress',
  'buildingName',
  'buildingNumber',
  'blockExpression',
  'phaseExpression',
  'estateName',
  'streetName',
] as const
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`

export const createAddressSearchFtsSql = `CREATE VIRTUAL TABLE IF NOT EXISTS addressSearchFts USING fts5(
  scopeId UNINDEXED, addressId UNINDEXED, locale UNINDEXED,
  formattedAddress, buildingName, buildingNumber, blockExpression,
  phaseExpression, estateName, streetName
)`

/** The public Address API currently serves the SaanSeoi domain in HK and MO. */
export async function resolveAddressSearchScopes(db: HarbourReadableDb) {
  const scopes: AddressSearchScope[] = []
  for (const regionCode of ['hk', 'mo'] as const) {
    const selected = await resolveApiReleaseSetSnapshotsForRequest(db, 'address', {
      regionCode,
      domainCode: 'saanseoi',
    })
    for (const snapshot of selected?.snapshots ?? []) {
      if (snapshot.snapshotResourceType !== 'address') continue
      const row = await db
        .select({ lineage: metaSnapshots.snapshotLineageId })
        .from(metaSnapshots)
        .where(eq(metaSnapshots.id, snapshot.snapshotId))
        .get()
      if (!row) throw new Error(`Missing search snapshot ${snapshot.snapshotId}.`)
      scopes.push({
        scopeId: `${regionCode}:saanseoi:${row.lineage}`,
        snapshotId: snapshot.snapshotId,
      })
    }
  }
  return scopes
}

/** Execute every statement in ONE transaction (D1 batch). Never split this batch. */
export function buildAddressSearchSyncSql(input: readonly AddressSearchScope[]) {
  const scopes = new Map<string, string>()
  for (const { scopeId, snapshotId } of input) {
    if (scopes.has(scopeId) && scopes.get(scopeId) !== snapshotId)
      throw new Error(`Conflicting latest Address snapshots for ${scopeId}.`)
    scopes.set(scopeId, snapshotId)
  }
  if (!scopes.size) return []
  const selection = [...scopes]
    .map(
      ([scope, snapshot]) =>
        `SELECT ${literal(scope)} AS scopeId, ${literal(snapshot)} AS snapshotId`,
    )
    .join(' UNION ALL ')
  const desired = `WITH selected AS (${selection}), desired AS (
    SELECT s.scopeId, i.addressId, i.locale, i.formattedAddress, i.buildingName,
      TRIM(COALESCE(i.buildingNumberExpression, '') || ' ' ||
        COALESCE(i.buildingNumberFrom, '') || ' ' || COALESCE(i.buildingNumberTo, '')) AS buildingNumber,
      i.blockExpression, i.phaseExpression, i.estateName, i.streetName
    FROM selected s JOIN address2dI18n i ON i.snapshotId = s.snapshotId
  )`
  const columns = fields.join(', ')
  // EXCEPT compares NULLs as equal, so an unchanged nullable field is never rewritten.
  return [
    createAddressSearchFtsSql,
    `${desired}, removed AS (
      SELECT ${columns} FROM addressSearchFts EXCEPT SELECT ${columns} FROM desired
    ) DELETE FROM addressSearchFts WHERE rowid IN (
      SELECT f.rowid FROM addressSearchFts f JOIN removed r ON
      ${fields.map(field => `f.${field} IS r.${field}`).join(' AND ')}
    )`,
    `${desired} INSERT INTO addressSearchFts (${columns})
      SELECT ${columns} FROM desired EXCEPT SELECT ${columns} FROM addressSearchFts`,
    `DELETE FROM addressSearchScopes WHERE scopeId NOT IN (${[...scopes.keys()].map(literal).join(', ')})`,
    `INSERT INTO addressSearchScopes (scopeId, snapshotId) ${selection}
      WHERE true ON CONFLICT(scopeId) DO UPDATE SET snapshotId = excluded.snapshotId
      WHERE addressSearchScopes.snapshotId IS NOT excluded.snapshotId`,
    // The previous snapshot-keyed index is retired only after its replacement succeeds.
    'DROP TABLE IF EXISTS addressesFts',
  ]
}

export async function synchroniseAddressSearch(
  db: HarbourReadableDb,
  current: {
    prepare(sql: string): D1PreparedStatement
    batch(statements: D1PreparedStatement[]): Promise<unknown>
  },
) {
  const scopes = await resolveAddressSearchScopes(db)
  const statements = buildAddressSearchSyncSql(scopes)
  if (statements.length)
    await current.batch(statements.map(sql => current.prepare(sql)))
}
