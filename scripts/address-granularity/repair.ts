import { buildAddressBaseHashInput } from '../../libs/core/src/pipeline/services/addresses/normalisation'
import { createHash } from '../../libs/core/src/pipeline/utils'
import { repairRow, type Query, type Row } from './database'

/** Map deprecated scope names without changing room unit-type semantics.
 * @param value Stored scope. @returns Canonical scope.
 */
export function normalizeGranularity(value: unknown): unknown {
  return value === 'room' ? 'unit' : value === 'room_part' ? 'unit_portion' : value
}
/** Build the same semantic history hash used by ingestion.
 * @param row Address history row. @returns Hash of normalized canonical content.
 */
export async function addressHash(row: Row): Promise<string> {
  const decoded = { ...row }
  for (const field of ['geometry', 'identifiers', 'sources']) {
    if (typeof decoded[field] === 'string')
      decoded[field] = JSON.parse(decoded[field] as string)
  }
  return createHash(
    buildAddressBaseHashInput(
      decoded as Parameters<typeof buildAddressBaseHashInput>[0],
    ),
  )
}
/** Repair all affected CURRENT or HISTORY address rows, including inactive scopes.
 * @param query Transactional database adapter. @param apply Whether to persist changes.
 * @returns Affected row count. @remarks Preserves identity, snapshot ancestry, operation,
 * timestamps and display components; replay is a no-op. Raw source evidence is untouched.
 */
export async function repairGranularities(
  query: Query,
  apply: boolean,
): Promise<number> {
  const [rows] = await query([
    { sql: "SELECT * FROM address2d WHERE granularity IN ('room','room_part')" },
  ])
  for (const row of rows) {
    const changes: Row = { granularity: normalizeGranularity(row.granularity) }
    if ('versionHash' in row && row.operation !== 'delete')
      changes.versionHash = await addressHash({ ...row, ...changes })
    if (apply) await repairRow(query, 'address2d', row, changes)
  }
  return rows.length
}
