import { Database } from 'bun:sqlite'
import { stableJsonStringify } from '../libs/core/src/pipeline/utils'
import { createHash } from 'node:crypto'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, resolve } from 'node:path'
import {
  compressJsonBrotli,
  decompressJsonBrotli,
} from '../libs/core/src/pipeline/services/storage/brotliJson'

const retired = ['hkgovCenstatdStatistics']
const featureTable = 'hkgovCenstatdStatistics'
const derivativeTable = 'hkgovCenstatdGeometryDerivatives'
const membershipTable = 'hkgovCenstatdStatisticsReleaseMemberships'
type Row = Record<string, string | number | null | Uint8Array>
const args = Bun.argv.slice(2)
function argument(name: string) {
  const index = args.indexOf(name)
  return index < 0 ? undefined : args[index + 1]
}
const pathsFile = argument('--paths')
if (!pathsFile)
  throw new Error(
    'Usage: bun scripts/migrate-censtatd-source-features.ts --paths paths.json [--apply --backup-dir directory]. paths.json maps DB_META and DB_SOURCE_* bindings to SQLite files.',
  )
const paths = JSON.parse(readFileSync(pathsFile, 'utf8')) as Record<string, string>
const apply = args.includes('--apply')
const backupDir = argument('--backup-dir')
if (apply && !backupDir) throw new Error('--apply requires --backup-dir.')
const metaPath = paths.DB_META
if (!metaPath) throw new Error('Missing DB_META path.')
const meta = new Database(metaPath, { readonly: true })
const owners = new Map(
  meta
    .query<{ id: string; code: string }, []>(
      'SELECT resourceReleases.id, datasets.code FROM resourceReleaseDetails AS resourceReleases JOIN datasets ON datasets.id = resourceReleases.datasetId',
    )
    .all()
    .map(row => [row.id, row.code]),
)
meta.close()
const migrationRoot = resolve(import.meta.dir, '../libs/db/migrations/source')
const baselines = readdirSync(migrationRoot).filter(name => !name.startsWith('.'))
if (baselines.length !== 1) throw new Error('Expected one generated SOURCE baseline.')
const baseline = readFileSync(
  resolve(migrationRoot, baselines[0]!, 'migration.sql'),
  'utf8',
)
const statements = baseline
  .split('--> statement-breakpoint')
  .filter(
    sql =>
      sql.includes(`CREATE TABLE \`${featureTable}\``) ||
      sql.includes(`CREATE TABLE \`${derivativeTable}\``) ||
      sql.includes(`CREATE TABLE \`${membershipTable}\``) ||
      (/CREATE INDEX/.test(sql) &&
        (sql.includes(`ON \`${featureTable}\``) ||
          sql.includes(`ON \`${derivativeTable}\``) ||
          sql.includes(`ON \`${membershipTable}\``))),
  )
if (statements.length !== 10)
  throw new Error('Unexpected generated feature/derivative schema.')
function exists(db: Database, table: string) {
  return Boolean(
    db.query("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table),
  )
}
function records(db: Database, table: string) {
  return exists(db, table) ? db.query<Row, []>(`SELECT * FROM "${table}"`).all() : []
}
function dataset(row: Row) {
  const owner = owners.get(String(row.resourceReleaseId))
  if (!owner?.startsWith('ds-hk-hkgov-censtatd-'))
    throw new Error(`Unresolved C&SD dataset owner: ${row.resourceReleaseId}`)
  return owner
}
function insert(db: Database, table: string, row: Row) {
  const keys = Object.keys(row)
  db.query(
    `INSERT INTO "${table}" (${keys.map(key => `"${key}"`).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
  ).run(...keys.map(key => row[key]!))
}
function payload(row: Row) {
  const geometry =
    row.sourceGeometry instanceof Uint8Array
      ? decompressJsonBrotli(row.sourceGeometry)
      : JSON.parse(String(row.sourceGeometry))
  return { ...row, sourceGeometry: geometry }
}
function digest(rows: Row[]) {
  return createHash('sha256')
    .update(
      stableJsonStringify(
        rows
          .map(payload)
          .sort((a, b) => stableJsonStringify(a).localeCompare(stableJsonStringify(b))),
      ),
    )
    .digest('hex')
}
const resolutions: Row[] = []
for (const [binding, path] of Object.entries(paths)) {
  if (!binding.startsWith('DB_HISTORY_')) continue
  const history = new Database(path, { readonly: true })
  if (exists(history, 'sourceResolutions')) {
    resolutions.push(
      ...history
        .query<Row, []>(
          'SELECT DISTINCT sourceReleaseId AS resourceReleaseId, sourceRecordId, sourceVersionHash AS versionHash FROM sourceResolutions',
        )
        .all()
        .filter(row =>
          owners
            .get(String(row.resourceReleaseId))
            ?.startsWith('ds-hk-hkgov-censtatd-'),
        ),
    )
  }
  history.close()
}
function writeMemberships(db: Database, features: Row[]) {
  const key = (row: Row) =>
    JSON.stringify([row.datasetCode, row.sourceRecordId, row.versionHash])
  const byKey = new Map(features.map(row => [key(row), row]))
  const memberships = new Map<string, Row>()
  for (const row of [
    ...features,
    ...resolutions.map(row => ({ ...row, datasetCode: dataset(row) })),
  ]) {
    const feature = byKey.get(key(row))
    if (!feature) continue
    const membership = {
      datasetCode: row.datasetCode!,
      resourceReleaseId: row.resourceReleaseId!,
      sourceRecordId: row.sourceRecordId!,
      versionHash: row.versionHash!,
      createdAt: feature.createdAt!,
      updatedAt: feature.updatedAt!,
    }
    memberships.set(
      JSON.stringify([
        membership.datasetCode,
        membership.resourceReleaseId,
        membership.sourceRecordId,
        membership.versionHash,
      ]),
      membership,
    )
  }
  for (const row of memberships.values()) insert(db, membershipTable, row)
  if (records(db, membershipTable).length !== memberships.size)
    throw new Error('Release membership count verification failed.')
  const integrity = db
    .query<{ integrity_check: string }, []>('PRAGMA integrity_check')
    .get()
  if (
    integrity?.integrity_check !== 'ok' ||
    db.query('PRAGMA foreign_key_check').all().length
  )
    throw new Error('SQLite integrity verification failed.')
  return memberships.size
}
function migrate(db: Database) {
  const present = retired.filter(table => exists(db, table))
  if (!present.length) {
    if (!exists(db, featureTable))
      throw new Error('Neither retired nor unified C&SD schema exists.')
    const features = records(db, featureTable)
    if (exists(db, membershipTable))
      return {
        alreadyMigrated: true,
        features: features.length,
        memberships: records(db, membershipTable).length,
      }
    const beforeDigest = digest(features)
    for (const sql of statements.filter(
      sql =>
        sql.includes(`CREATE TABLE \`${membershipTable}\``) ||
        sql.includes(`ON \`${membershipTable}\``),
    ))
      db.exec(sql)
    const memberships = writeMemberships(db, features)
    if (digest(records(db, featureTable)) !== beforeDigest)
      throw new Error('Membership preparation changed a retained payload.')
    return {
      features: features.length,
      derivatives: records(db, derivativeTable).length,
      memberships,
      payloadSha256: beforeDigest,
    }
  }
  if (exists(db, featureTable))
    throw new Error('Mixed old/new C&SD schema; refusing to guess migration state.')
  const features = present.flatMap(table =>
    records(db, table).map(row => {
      const { censusYear: _cohort, ...retained } = row
      return {
        ...retained,
        datasetCode: dataset(row),
        sourceLocator: row.sourceLocator ?? null,
        sourceGeometry:
          row.sourceGeometry instanceof Uint8Array
            ? row.sourceGeometry
            : compressJsonBrotli(JSON.parse(String(row.sourceGeometry))),
      } as Row
    }),
  )
  const derivatives = records(db, derivativeTable).map(row => ({
    ...row,
    datasetCode: dataset(row),
  }))
  const beforeDigest = digest(features)
  const unique = new Map<string, Row>()
  for (const row of features) {
    const key = JSON.stringify([row.datasetCode, row.sourceRecordId, row.versionHash])
    if (unique.has(key))
      throw new Error(
        `Duplicate retained feature key ${key}; reconcile its evidence explicitly.`,
      )
    unique.set(key, row)
  }
  for (const row of derivatives) {
    const matches = features.filter(
      feature =>
        feature.datasetCode === row.datasetCode &&
        feature.sourceRecordId === row.sourceRecordId &&
        feature.versionHash === row.inputVersionHash,
    )
    if (matches.length !== 1)
      throw new Error(
        `Derivative has no unique retained input: ${row.sourceRecordId}/${row.inputVersionHash}`,
      )
  }
  db.exec(`DROP TABLE IF EXISTS "${derivativeTable}"`)
  for (const sql of statements) db.exec(sql)
  for (const row of features) insert(db, featureTable, row)
  for (const row of derivatives) insert(db, derivativeTable, row)
  const memberships = writeMemberships(db, features)
  const after = records(db, featureTable)
  if (after.length !== features.length || digest(after) !== beforeDigest)
    throw new Error('Retained feature payload/lifecycle verification failed.')
  for (const table of present) db.exec(`DROP TABLE "${table}"`)
  const integrity = db
    .query<{ integrity_check: string }, []>('PRAGMA integrity_check')
    .get()
  if (integrity?.integrity_check !== 'ok')
    throw new Error('SQLite integrity check failed.')
  return {
    features: features.length,
    derivatives: derivatives.length,
    memberships,
    payloadSha256: beforeDigest,
    datasets: [...new Set(features.map(row => row.datasetCode))],
  }
}
for (const [binding, path] of Object.entries(paths).filter(([binding]) =>
  binding.startsWith('DB_SOURCE_'),
)) {
  const source = apply ? new Database(path) : new Database(path, { readonly: true })
  const version = source
    .query<{ data_version: number }, []>('PRAGMA data_version')
    .get()!.data_version
  const original = source.serialize()
  const rehearsalDir = mkdtempSync(resolve(tmpdir(), 'censtatd-rehearsal-'))
  const rehearsalPath = resolve(rehearsalDir, 'source.sqlite')
  writeFileSync(rehearsalPath, original)
  const candidate = new Database(rehearsalPath)
  let result: ReturnType<typeof migrate>
  try {
    result = migrate(candidate)
  } finally {
    candidate.close()
    rmSync(rehearsalDir, { recursive: true })
  }
  if (
    source.query<{ data_version: number }, []>('PRAGMA data_version').get()!
      .data_version !== version
  )
    throw new Error(`${binding} changed during rehearsal.`)
  let backup: string | undefined
  if (apply && !('alreadyMigrated' in result)) {
    source.exec('BEGIN IMMEDIATE')
    try {
      if (
        source.query<{ data_version: number }, []>('PRAGMA data_version').get()!
          .data_version !== version
      )
        throw new Error(`${binding} changed before migration.`)
      mkdirSync(backupDir!, { recursive: true })
      backup = resolve(backupDir!, `${binding}-${basename(path)}`)
      // A consistent SQLite image includes committed WAL contents.
      writeFileSync(backup, source.serialize(), { flag: 'wx' })
      const actual = migrate(source)
      if (JSON.stringify(actual) !== JSON.stringify(result))
        throw new Error('Rehearsal and application disagree.')
      source.exec('COMMIT')
    } catch (error) {
      source.exec('ROLLBACK')
      throw error
    }
  }
  source.close()
  console.log(
    JSON.stringify({
      binding,
      path,
      mode: apply ? 'apply' : 'dry-run',
      backup,
      ...result,
    }),
  )
}
