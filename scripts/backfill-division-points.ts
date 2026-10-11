import { missingDivisionAreaResolver } from './division-point-area-evidence'
import { Database } from 'bun:sqlite'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import {
  canonicalDivisionPoint,
  createDivisionPointGuard,
} from '../libs/core/src/pipeline/services/divisions/divisionPoint'
import {
  calculateGeoJsonBbox,
  type GeoJsonGeometry,
} from '../libs/core/src/pipeline/geojson'
import { decompressJsonBrotli } from '../libs/core/src/pipeline/services/storage/brotliJson'
import { buildDivisionBaseHashInput } from '../libs/core/src/pipeline/services/divisions/division'
import { createHash } from '../libs/core/src/pipeline/utils'

function decode(value: unknown): any {
  if (value instanceof Uint8Array) return decompressJsonBrotli(value)
  return typeof value === 'string' ? JSON.parse(value) : value
}
function decodedBase(row: Record<string, any>) {
  const base = { ...row }
  for (const key of [
    'geometry',
    'bbox',
    'hierarchies',
    'cartography',
    'identifiers',
    'sources',
  ])
    base[key] = decode(base[key])
  return base
}

/** Local canonical rows only; publisher records and area/boundary geometries are untouched. */
export async function backfillDivisionPoints(
  paths: string[],
  output: string,
  apply = false,
  metaPath?: string,
) {
  if (
    !paths.length ||
    paths.length > 8 ||
    new Set(paths.map(resolvePath)).size !== paths.length
  )
    throw Error('Provide 1–8 distinct local database paths.')
  const db = new Database(':memory:')
  const guard = createDivisionPointGuard()
  const areaResolver = metaPath
    ? missingDivisionAreaResolver(metaPath, paths[0]!)
    : null
  const changes: Array<{
    database: number
    rowid: number
    id: string
    oldGeometry: any
    oldBbox: any
    geometry: string
    bbox: string
    oldHash?: string
    hash?: string
    mergeInto?: number
    isCurrent?: number
  }> = []
  const report = {
    applied: false,
    scanned: 0,
    changed: 0,
    unchangedPoints: 0,
    missingGeometry: 0,
    replayReferences: 0,
    mergedVersions: 0,
    counts: {} as Record<string, number>,
    backups: [] as string[],
    guards: [] as any[],
  }
  mkdirSync(output, { recursive: true })
  const tables: Set<string>[] = []
  try {
    for (const [index, path] of paths.entries()) {
      if (!existsSync(path)) throw Error(`Missing database ${path}`)
      db.query(`ATTACH DATABASE ? AS db${index}`).run(resolve(path))
      tables[index] = new Set(
        (
          db
            .query(`SELECT name FROM db${index}.sqlite_master WHERE type='table'`)
            .all() as { name: string }[]
        ).map(row => row.name),
      )
      if (!tables[index]!.has('divisions')) continue
      for (const row of db
        .query(`SELECT rowid AS repairRowid, * FROM db${index}.divisions`)
        .iterate() as Iterable<Record<string, any>>) {
        report.scanned++
        let geometry = decode(row.geometry) as GeoJsonGeometry | null
        if (!geometry && areaResolver) {
          const snapshots =
            row.versionHash && tables[index]!.has('snapshotVersionChanges')
              ? (
                  db
                    .query(
                      `SELECT DISTINCT snapshotId FROM db${index}.snapshotVersionChanges WHERE recordType='division' AND recordId=? AND versionHash=?`,
                    )
                    .all(row.id, row.versionHash) as { snapshotId: string }[]
                ).map(value => value.snapshotId)
              : [
                  tables[index]!.has('divisionPublicationState')
                    ? ((
                        db
                          .query(
                            `SELECT snapshotId FROM db${index}.divisionPublicationState WHERE scopeId=?`,
                          )
                          .get(row.snapshotId) as { snapshotId: string } | null
                      )?.snapshotId ?? row.snapshotId)
                    : row.snapshotId,
                ]
          geometry = areaResolver.resolve(row.id, snapshots)
        }
        if (!geometry) {
          report.missingGeometry++
          continue
        }
        if (geometry.type === 'Point') {
          canonicalDivisionPoint(geometry, { id: row.id })
          report.unchangedPoints++
          continue
        }
        const point = canonicalDivisionPoint(geometry, { id: row.id, guard })!
        const bbox = calculateGeoJsonBbox(point)
        let hash: string | undefined
        if (row.versionHash) {
          const base = decodedBase(row)
          hash = await createHash(
            buildDivisionBaseHashInput({ ...base, geometry: point, bbox } as any),
          )
        }
        changes.push({
          database: index,
          rowid: row.repairRowid,
          id: row.id,
          oldGeometry: row.geometry,
          oldBbox: row.bbox,
          geometry: JSON.stringify(point),
          bbox: JSON.stringify(bbox),
          oldHash: row.versionHash,
          hash,
          isCurrent: row.isCurrent,
        })
        report.counts[basename(path)] = (report.counts[basename(path)] ?? 0) + 1
      }
    }
    report.changed = changes.length
    report.guards = guard.snapshot()
    // Detect collisions between planned versions before touching any database.
    const keepers = new Map<string, number>()
    for (const change of [...changes].sort(
      (a, b) => (b.isCurrent ?? 0) - (a.isCurrent ?? 0),
    )) {
      if (!change.hash) continue
      const key = JSON.stringify([change.database, change.id, change.hash])
      const existing = db
        .query(
          `SELECT rowid FROM db${change.database}.divisions WHERE id=? AND versionHash=?`,
        )
        .get(change.id, change.hash) as { rowid: number } | null
      const keeper = existing?.rowid ?? keepers.get(key)
      if (keeper !== undefined && keeper !== change.rowid) change.mergeInto = keeper
      else keepers.set(key, change.rowid)
    }
    writeFileSync(
      resolve(output, 'plan.json'),
      JSON.stringify(
        {
          paths,
          ...report,
          changes: changes.map(({ oldGeometry, oldBbox, ...change }) => change),
        },
        null,
        2,
      ),
    )
    if (!apply || !changes.length) return report
    // Back up every affected row and replay reference, rather than unrelated multi-GB tables.
    const backup = resolve(output, 'rollback.sqlite')
    if (existsSync(backup)) throw Error(`Backup already exists: ${backup}`)
    db.query('ATTACH DATABASE ? AS repairBackup').run(backup)
    report.backups.push(backup)
    db.exec('BEGIN IMMEDIATE')
    try {
      for (let index = 0; index < paths.length; index++) {
        db.exec(
          `CREATE TABLE repairBackup.db${index}_divisions AS SELECT rowid AS repairRowid,* FROM db${index}.divisions WHERE 0`,
        )
        if (tables[index]!.has('snapshotVersionChanges'))
          db.exec(
            `CREATE TABLE repairBackup.db${index}_replay AS SELECT rowid AS repairRowid,* FROM db${index}.snapshotVersionChanges WHERE 0`,
          )
      }
      for (let index = 0; index < paths.length; index++) {
        db.exec(
          `CREATE UNIQUE INDEX repairBackup.db${index}_divisions_rowid ON db${index}_divisions(repairRowid)`,
        )
        if (tables[index]!.has('snapshotVersionChanges'))
          db.exec(
            `CREATE UNIQUE INDEX repairBackup.db${index}_replay_rowid ON db${index}_replay(repairRowid)`,
          )
      }
      for (const change of changes)
        if (change.mergeInto !== undefined) {
          db.query(
            `INSERT OR IGNORE INTO repairBackup.db${change.database}_divisions SELECT rowid,* FROM db${change.database}.divisions WHERE rowid=?`,
          ).run(change.mergeInto)
        }
      for (const change of changes) {
        db.query(
          `INSERT OR IGNORE INTO repairBackup.db${change.database}_divisions SELECT rowid,* FROM db${change.database}.divisions WHERE rowid=?`,
        ).run(change.rowid)
        if (change.hash)
          for (let index = 0; index < paths.length; index++) {
            if (!tables[index]!.has('snapshotVersionChanges')) continue
            db.query(
              `INSERT OR IGNORE INTO repairBackup.db${index}_replay SELECT rowid,* FROM db${index}.snapshotVersionChanges WHERE recordType='division' AND recordId=? AND versionHash=?`,
            ).run(change.id, change.oldHash!)
          }
      }
      for (const change of changes) {
        const {
          database,
          rowid,
          id,
          geometry,
          bbox,
          oldGeometry,
          oldBbox,
          hash,
          oldHash,
        } = change
        if (change.mergeInto !== undefined) {
          const result = db
            .query(
              `DELETE FROM db${database}.divisions WHERE rowid=? AND geometry IS ? AND bbox IS ? AND versionHash=?`,
            )
            .run(rowid, oldGeometry, oldBbox, oldHash!)
          if (result.changes !== 1) throw Error(`Concurrent change detected for ${id}`)
          if (change.isCurrent)
            db.query(
              `UPDATE db${database}.divisions SET isCurrent=1 WHERE rowid=?`,
            ).run(change.mergeInto)
          report.mergedVersions++
        } else {
          const result = hash
            ? db
                .query(
                  `UPDATE db${database}.divisions SET geometry=?,bbox=?,versionHash=? WHERE rowid=? AND geometry IS ? AND bbox IS ? AND versionHash=?`,
                )
                .run(geometry, bbox, hash, rowid, oldGeometry, oldBbox, oldHash!)
            : db
                .query(
                  `UPDATE db${database}.divisions SET geometry=?,bbox=? WHERE rowid=? AND geometry IS ? AND bbox IS ?`,
                )
                .run(geometry, bbox, rowid, oldGeometry, oldBbox)
          if (result.changes !== 1) throw Error(`Concurrent change detected for ${id}`)
        }
        if (hash)
          for (let index = 0; index < paths.length; index++) {
            if (!tables[index]!.has('snapshotVersionChanges')) continue
            report.replayReferences += db
              .query(
                `UPDATE db${index}.snapshotVersionChanges SET versionHash=? WHERE recordType='division' AND recordId=? AND versionHash=?`,
              )
              .run(hash, id, oldHash!).changes
          }
      }
      db.exec('COMMIT')
      report.applied = true
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    const quote = (value: string) => "'" + value.replaceAll("'", "''") + "'"
    const rollback = [
      ...paths.map(
        (path, index) => `ATTACH DATABASE ${quote(resolve(path))} AS db${index};`,
      ),
      `ATTACH DATABASE ${quote(backup)} AS repairBackup;`,
      'BEGIN IMMEDIATE;',
    ]
    for (let index = 0; index < paths.length; index++) {
      for (const [table, suffix] of [
        ['divisions', 'divisions'],
        ['snapshotVersionChanges', 'replay'],
      ]) {
        if (!tables[index]!.has(table!)) continue
        const columns = (
          db.query(`PRAGMA db${index}.table_info(${table})`).all() as { name: string }[]
        )
          .map(row => `"${row.name}"`)
          .join(',')
        rollback.push(
          `DELETE FROM db${index}.${table} WHERE rowid IN (SELECT repairRowid FROM repairBackup.db${index}_${suffix});`,
        )
        rollback.push(
          `INSERT INTO db${index}.${table}(rowid,${columns}) SELECT repairRowid,${columns} FROM repairBackup.db${index}_${suffix};`,
        )
      }
    }
    rollback.push('COMMIT;')
    writeFileSync(resolve(output, 'rollback.sql'), rollback.join('\n'))
    writeFileSync(resolve(output, 'receipt.json'), JSON.stringify(report, null, 2))
    return report
  } finally {
    areaResolver?.close()
    db.close()
  }
}
function resolvePath(path: string) {
  return resolve(path)
}
if (import.meta.main) {
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  const metaIndex = args.indexOf('--meta')
  const metaPath = metaIndex >= 0 ? args[metaIndex + 1] : undefined
  const positional = args.filter(
    (arg, index) =>
      arg !== '--apply' &&
      index !== metaIndex &&
      (metaIndex < 0 || index !== metaIndex + 1),
  )
  const [output, ...paths] = positional
  if (!output)
    throw Error('Usage: bun scripts/backfill-division-points.ts OUTPUT DB... [--apply]')
  console.log(
    JSON.stringify(
      await backfillDivisionPoints(paths, output, apply, metaPath),
      null,
      2,
    ),
  )
}
