/** Split the generated history apply artefact by work, rather than SQL text size. */
export function boundedHistoryApply(
  bytes: Uint8Array,
  totalRows: number,
): Uint8Array[] {
  const sql = new TextDecoder().decode(bytes)
  if (!sql.trimStart().startsWith('WITH changedExisting AS (')) return [bytes]
  const insertStart = sql.indexOf('INSERT INTO address2d (')
  const cleanupStart = sql.indexOf('DROP TABLE IF EXISTS zzAddressImportResolvedI18n;')
  if (insertStart < 0 || cleanupStart < insertStart) return [bytes]
  if (!Number.isSafeInteger(totalRows) || totalRows < 1)
    throw new Error('History delivery requires a positive row count')
  const inserts = sql.slice(insertStart, cleanupStart)
  if ((inserts.match(/r\.changed = 1/g) ?? []).length !== 5)
    throw new Error('Unrecognised address history apply predicates')
  // Retire all previous identities before inserting any new versions. An alias
  // can cross a range boundary, so retirement must not repeat after insertion.
  const parts = [sql.slice(0, insertStart)]
  for (let start = 0; start < totalRows; start += 4096) {
    parts.push(
      inserts.replaceAll(
        'r.changed = 1',
        `r.changed = 1 AND r.rowNumber >= ${start} AND r.rowNumber < ${Math.min(start + 4096, totalRows)}`,
      ),
    )
  }
  parts.push(sql.slice(cleanupStart))
  return parts.map(part => new TextEncoder().encode(part))
}
