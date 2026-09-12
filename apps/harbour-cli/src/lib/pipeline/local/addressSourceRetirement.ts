type Statement = { sql: string; params: unknown[] }
const closure =
  /^UPDATE (hkgovAlsAddresses(?:2d|3d)) SET isCurrent = 0, validToRelease = \?, updatedAt = \? WHERE isCurrent = 1 AND releaseId <> \?$/
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`

/** Pre-retirement is monotonic; the sealed upserts then restore this release's rows. */
export async function preRetireAddressSources(
  statements: Statement[],
  query: (sql: string) => Promise<Array<Record<string, unknown>>>,
) {
  const closures = statements.filter(statement => closure.test(statement.sql))
  if (!closures.length) return
  const firstClosure = closures[0]
  if (!firstClosure) throw new Error('Source retirement closure is missing')
  const [version, timestamp, release] = firstClosure.params
  if (![version, timestamp, release].every(value => typeof value === 'string'))
    throw new Error('Invalid source retirement parameters')
  for (const statement of statements) {
    const isClosure = closure.test(statement.sql)
    const isUpdate =
      /^UPDATE hkgovAlsAddresses(?:2d|3d) SET isCurrent = 0, validToRelease = \?, updatedAt = \? WHERE sourceRecordId = \? AND isCurrent = 1 AND versionHash <> \?$/.test(
        statement.sql,
      )
    const isUpsert =
      /^INSERT INTO "hkgovAlsAddresses(?:2d|3d)" /.test(statement.sql) &&
      statement.sql.endsWith(
        'ON CONFLICT(sourceRecordId,versionHash) DO UPDATE SET releaseId=excluded.releaseId,isCurrent=1,validToRelease=NULL,updatedAt=excluded.updatedAt',
      )
    if (
      (!isClosure && !isUpdate && !isUpsert) ||
      ((isClosure || isUpdate) &&
        (statement.params[0] !== version || statement.params[1] !== timestamp)) ||
      (isClosure && statement.params[2] !== release) ||
      (isUpsert &&
        (statement.params[2] !== release ||
          statement.params[3] !== version ||
          statement.params[10] !== timestamp))
    )
      throw new Error('Source retirement batch is not a uniform publisher upsert batch')
  }
  for (const statement of closures) {
    const table = closure.exec(statement.sql)?.[1]
    if (!table) throw new Error('Source retirement closure has an invalid table')
    // Repeat-safe across interruption: rows already retired no longer match.
    // Bound each transaction, rather than merely bounding the SQL text size.
    let cursor: number | undefined
    for (;;) {
      const rows = await query(
        `UPDATE ${table} SET isCurrent=0, validToRelease=${quote(version as string)}, updatedAt=${quote(timestamp as string)} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${cursor === undefined ? '' : `rowid>${cursor} AND `}isCurrent=1 AND releaseId<>${quote(release as string)} ORDER BY rowid LIMIT 1024) RETURNING rowid`,
      )
      if (!rows.length) break
      // RETURNING has no ordering guarantee. Resume after the largest retired
      // row, using SQLite's integer primary-key search instead of rescanning.
      const rowids = rows.map(row => row.rowid)
      if (rowids.some(rowid => !Number.isSafeInteger(rowid)))
        throw new Error('Source retirement returned an invalid rowid')
      cursor = Math.max(...(rowids as number[]))
    }
  }
}
