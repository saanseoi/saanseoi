/** Data conversion around the generated DDL; run with --rehearse before --apply. */
import { Database } from 'bun:sqlite'
import { mkdirSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { brotliDecompressSync } from 'node:zlib'
import {
  censtatdGeometryRow,
  censtatdDerivativeRow,
} from '../../core/src/pipeline/services/sources/censtatdGeometry'

export const migrationName = '20261012040635_lying_colonel_america/migration.sql'
const migrationSql = readFileSync(
  resolve(import.meta.dir, '../migrations/source', migrationName),
  'utf8',
)
type Row = Record<string, any>
const key = (r: Row) => JSON.stringify([r.datasetCode, r.sourceRecordId, r.versionHash])
const decode = (value: unknown) =>
  typeof value === 'string'
    ? JSON.parse(value)
    : JSON.parse(brotliDecompressSync(value as Uint8Array).toString())

/** Caller holds BEGIN IMMEDIATE. No partially converted schema can be committed. */
export function convertCenstatdGeometry(db: Database) {
  if (
    db
      .query("SELECT 1 FROM sqlite_master WHERE name='hkgovCenstatdStatisticsGeometry'")
      .get()
  ) {
    if (!db.query('SELECT 1 FROM d1_migrations WHERE name=?').get(migrationName))
      throw new Error('Geometry table exists without migration receipt.')
    return { alreadyApplied: true }
  }
  const statistics = db.query('SELECT * FROM hkgovCenstatdStatistics').all() as Row[]
  const memberships = db
    .query('SELECT * FROM hkgovCenstatdStatisticsReleaseMemberships')
    .all() as Row[]
  const derivatives = db
    .query('SELECT * FROM hkgovCenstatdDivisionAreaDerivatives')
    .all() as Row[]
  const assertions = new Map(statistics.map(row => [key(row), row]))
  const releases = new Map<string, Set<string>>()
  for (const membership of memberships) {
    const identity = key(membership)
    if (!assertions.has(identity)) throw new Error(`Orphan C&SD membership ${identity}`)
    const owners = releases.get(identity) ?? new Set<string>()
    owners.add(membership.resourceReleaseId)
    releases.set(identity, owners)
  }
  const geometries = new Map<string, ReturnType<typeof censtatdGeometryRow>>()
  const geometryIds = new Map<string, string>()
  const convertedStatistics: Row[] = []
  for (const row of statistics) {
    const geometry = censtatdGeometryRow(decode(row.sourceGeometry))
    geometries.set(geometry.id, geometry)
    geometryIds.set(key(row), geometry.id)
    const { sourceGeometry, ...properties } = row
    const owners = releases.get(key(row)) ?? new Set([row.resourceReleaseId])
    for (const resourceReleaseId of owners)
      convertedStatistics.push({
        ...properties,
        resourceReleaseId,
        geometryId: geometry.id,
      })
  }
  const convertedDerivatives = new Map<string, Row>()
  for (const row of derivatives) {
    const geometryId = geometryIds.get(
      key({ ...row, versionHash: row.inputVersionHash }),
    )
    if (!geometryId) throw new Error(`Orphan C&SD derivative ${row.sourceRecordId}`)
    const coverageGeometryIds = derivatives
      .filter(
        candidate =>
          candidate.datasetCode === row.datasetCode &&
          candidate.resourceReleaseId === row.resourceReleaseId &&
          candidate.transform === row.transform,
      )
      .map(
        candidate =>
          geometryIds.get(
            key({ ...candidate, versionHash: candidate.inputVersionHash }),
          )!,
      )
    const next = censtatdDerivativeRow({
      geometryId,
      transform: row.transform,
      coverageGeometryIds,
      derivation: JSON.parse(row.derivation),
      geometry: decode(row.geometry),
      bbox: JSON.parse(row.bbox),
    })
    const identity = JSON.stringify([
      next.geometryId,
      next.transform,
      next.transformHash,
    ])
    const previous = convertedDerivatives.get(identity)
    if (previous && previous.versionHash !== next.versionHash)
      throw new Error(`Conflicting derivative output for ${identity}`)
    convertedDerivatives.set(identity, next)
  }
  db.exec(
    'DELETE FROM hkgovCenstatdDivisionAreaDerivatives; DELETE FROM hkgovCenstatdStatisticsReleaseMemberships; DELETE FROM hkgovCenstatdStatistics;',
  )
  db.exec(migrationSql)
  insert(db, 'hkgovCenstatdStatisticsGeometry', [...geometries.values()])
  insert(db, 'hkgovCenstatdStatistics', convertedStatistics)
  insert(db, 'hkgovCenstatdDivisionAreaDerivatives', [...convertedDerivatives.values()])
  // Verify every release still reconstructs the exact retained evidence.
  const actual = db
    .query(
      'SELECT s.*, g.sourceGeometry FROM hkgovCenstatdStatistics s JOIN hkgovCenstatdStatisticsGeometry g ON g.id=s.geometryId',
    )
    .all() as Row[]
  if (actual.length !== convertedStatistics.length)
    throw new Error('Converted statistics count mismatch.')
  for (const row of actual) {
    const original = assertions.get(key(row))!
    if (
      row.properties !== original.properties ||
      row.sourceLocator !== original.sourceLocator ||
      censtatdGeometryRow(decode(row.sourceGeometry)).id !== geometryIds.get(key(row))
    )
      throw new Error('Converted source evidence mismatch.')
  }
  if (db.query('PRAGMA foreign_key_check').all().length)
    throw new Error('Foreign-key validation failed.')
  db.query('INSERT INTO d1_migrations (name) VALUES (?)').run(migrationName)
  return {
    sourceAssertions: statistics.length,
    releaseStatistics: actual.length,
    geometries: geometries.size,
    inputDerivatives: derivatives.length,
    derivatives: convertedDerivatives.size,
  }
}

function insert(db: Database, table: string, rows: Row[]) {
  for (const row of rows) {
    const columns = Object.keys(row)
    db.query(
      `INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
    ).run(
      ...columns.map(c =>
        row[c] instanceof Uint8Array
          ? row[c]
          : row[c] !== null && typeof row[c] === 'object'
            ? JSON.stringify(row[c])
            : row[c],
      ),
    )
  }
}

if (import.meta.main) {
  const [mode, databasePath, outputDir] = process.argv.slice(2)
  if (!['--rehearse', '--apply'].includes(mode ?? '') || !databasePath || !outputDir)
    throw new Error(
      'Usage: bun libs/db/scripts/migrate-censtatd-geometry.ts --rehearse|--apply <sqlite> <backup-directory>',
    )
  mkdirSync(outputDir, { recursive: true })
  const source = new Database(databasePath)
  source.exec('PRAGMA busy_timeout=30000; PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;')
  let rehearsal: Database | undefined
  try {
    const backup = resolve(outputDir, `${basename(databasePath)}-${Date.now()}.sqlite`)
    const result = spawnSync(
      'python3',
      [
        '-c',
        'import sqlite3,sys; a=sqlite3.connect(sys.argv[1]); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()',
        databasePath,
        backup,
      ],
      { encoding: 'utf8' },
    )
    if (result.status !== 0) throw new Error(result.stderr || 'Backup failed.')
    console.log(JSON.stringify({ backup, mode }))
    if (mode !== '--apply') rehearsal = new Database(backup)
    const db = rehearsal ?? source
    if (rehearsal) rehearsal.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;')
    console.log(JSON.stringify(convertCenstatdGeometry(db)))
    db.exec('COMMIT;')
    if (rehearsal) source.exec('ROLLBACK;')
  } catch (error) {
    if (source.inTransaction) source.exec('ROLLBACK;')
    if (rehearsal?.inTransaction) rehearsal.exec('ROLLBACK;')
    throw error
  } finally {
    rehearsal?.close()
    source.close()
  }
}
