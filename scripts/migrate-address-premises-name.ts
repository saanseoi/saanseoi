import { Database } from 'bun:sqlite'
import { buildAddressI18nHashInput } from '../libs/core/src/pipeline/services/addresses/normalisation'
import { createHash } from '../libs/core/src/pipeline/utils'

type Row = Record<string, unknown>
const literal = (value: unknown): string =>
  value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`

export async function migrateAddressLocaleRow(raw: Row, isHistory: boolean) {
  const meta = typeof raw.meta === 'string' ? JSON.parse(raw.meta) : (raw.meta ?? null)
  let metadataChanged = false
  if (meta?.fields && Object.hasOwn(meta.fields, 'estateName')) {
    if (
      Object.hasOwn(meta.fields, 'premisesName') &&
      JSON.stringify(meta.fields.premisesName) !==
        JSON.stringify(meta.fields.estateName)
    )
      throw new Error('Conflicting premises translation provenance')
    meta.fields.premisesName = meta.fields.estateName
    delete meta.fields.estateName
    metadataChanged = true
  }
  const row = {
    ...raw,
    meta,
    premisesName: raw.premisesName ?? raw.estateName ?? null,
    blockTypeBeforeNumber:
      raw.blockTypeBeforeNumber == null ? null : Boolean(raw.blockTypeBeforeNumber),
  }
  const hash = isHistory
    ? await createHash(
        buildAddressI18nHashInput(
          row as Parameters<typeof buildAddressI18nHashInput>[0],
        ),
      )
    : null
  return { meta, hash, metadataChanged }
}

/** Produces a guarded data migration after the generated column rename.
 * @param db Read-only snapshot of one CURRENT or HISTORY shard (before or after rename).
 * @returns SQL and counts; does not create revisions or modify the input database.
 * @remarks Run with ingestion stopped. Apply every HISTORY shard plus CURRENT in one maintenance window.
 */
export async function planAddressPremisesMigration(db: Database): Promise<{
  sql: string
  statements: string[]
  hashes: number
  searchRows: number
  metadataRows: number
}> {
  const columns = db.query('PRAGMA table_info(address2dI18n)').all() as Array<{
    name: string
  }>
  if (!columns.length) throw new Error('No address2dI18n table in this database')
  const isHistory = columns.some(column => column.name === 'versionHash')
  const statements = [
    'BEGIN IMMEDIATE;',
    'CREATE TEMP TABLE _premises_guard (ok INTEGER CHECK(ok = 1));',
  ]
  let hashes = 0
  // Preserve translation provenance under the same canonical field name in both families.
  let metadataRows = 0
  const rows = db.query(
    isHistory
      ? "SELECT * FROM address2dI18n WHERE operation = 'upsert'"
      : 'SELECT * FROM address2dI18n',
  )
  for (const raw of rows.iterate() as Iterable<Row>) {
    const { meta, hash, metadataChanged } = await migrateAddressLocaleRow(
      raw,
      isHistory,
    )
    const hashChanged = isHistory && hash !== raw.versionHash
    if (!hashChanged && !metadataChanged) continue
    const identity = `addressId = ${literal(raw.addressId)} AND ${isHistory ? 'snapshotId' : 'scopeId'} = ${literal(isHistory ? raw.snapshotId : raw.scopeId)} AND locale = ${literal(raw.locale)}`
    const guards = [
      identity,
      ...(isHistory ? [`versionHash IS ${literal(raw.versionHash)}`] : []),
      ...(metadataChanged ? [`meta IS ${literal(raw.meta)}`] : []),
    ]
    const updates = [
      ...(hashChanged ? [`versionHash = ${literal(hash)}`] : []),
      ...(metadataChanged ? [`meta = ${literal(JSON.stringify(meta))}`] : []),
    ]
    statements.push(
      `INSERT INTO _premises_guard SELECT count(*) = 1 FROM address2dI18n WHERE ${guards.join(' AND ')};`,
      `UPDATE address2dI18n SET ${updates.join(', ')} WHERE ${identity};`,
    )
    if (hashChanged) hashes++
    if (metadataChanged) metadataRows++
  }
  let searchRows = 0
  const fts = db
    .query("SELECT sql FROM sqlite_master WHERE name = 'addressSearchFts'")
    .get() as { sql: string } | null
  if (fts?.sql.includes('estateName')) {
    // FTS5 cannot rename a column; preserve every indexed row while rebuilding its declaration.
    searchRows = (
      db.query('SELECT count(*) AS count FROM addressSearchFts').get() as {
        count: number
      }
    ).count
    const names = [
      'scopeId',
      'addressId',
      'locale',
      'formattedAddress',
      'buildingName',
      'buildingNumber',
      'blockExpression',
      'phaseExpression',
      'premisesName',
      'streetName',
    ]
    statements.push(
      'CREATE TEMP TABLE _premises_fts AS SELECT * FROM addressSearchFts;',
      'DROP TABLE addressSearchFts;',
      `${fts.sql.replaceAll('estateName', 'premisesName')};`,
      `INSERT INTO addressSearchFts (${names.join(',')}) SELECT ${names.map(name => (name === 'premisesName' ? 'estateName' : name)).join(',')} FROM _premises_fts;`,
      `INSERT INTO _premises_guard SELECT count(*) = ${searchRows} FROM addressSearchFts;`,
      'DROP TABLE _premises_fts;',
    )
  }
  statements.push('DROP TABLE _premises_guard;', 'COMMIT;')
  return {
    sql: `${statements.join('\n')}\n`,
    statements,
    hashes,
    searchRows,
    metadataRows,
  }
}

if (import.meta.main) {
  const [databasePath, outputPath] = Bun.argv.slice(2)
  if (!databasePath || !outputPath)
    throw new Error(
      'Usage: bun scripts/migrate-address-premises-name.ts <sqlite-snapshot> <output.sql>',
    )
  const db = new Database(databasePath, { readonly: true })
  try {
    const plan = await planAddressPremisesMigration(db)
    await Bun.write(outputPath, plan.sql)
    console.log(
      JSON.stringify({
        hashes: plan.hashes,
        searchRows: plan.searchRows,
        metadataRows: plan.metadataRows,
        outputPath,
      }),
    )
  } finally {
    db.close()
  }
}
