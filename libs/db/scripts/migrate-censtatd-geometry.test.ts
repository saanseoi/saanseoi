import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compressJsonBrotli } from '../../core/src/pipeline/services/storage/brotliJson'
import { convertCenstatdGeometry, migrationName } from './migrate-censtatd-geometry'

const sourceGeometry = { type: 'Point', coordinates: [114, 22] }

function fixture() {
  const db = new Database(':memory:')
  const root = resolve(import.meta.dir, '../migrations/source')
  for (const name of readdirSync(root).sort()) {
    if (`${name}/migration.sql` >= migrationName) break
    db.exec(readFileSync(resolve(root, name, 'migration.sql'), 'utf8'))
  }
  db.exec('CREATE TABLE d1_migrations(name PRIMARY KEY);')
  const geometry = compressJsonBrotli(sourceGeometry)
  db.query(`INSERT INTO hkgovCenstatdStatistics(datasetCode,sourceRecordId,versionHash,resourceReleaseId,validFromRelease,isCurrent,properties,sourceGeometry)
    VALUES('dataset','record','v1','r2','2021',1,'{"population":42}',?)`).run(geometry)
  db.exec(
    "INSERT INTO hkgovCenstatdStatisticsReleaseMemberships(datasetCode,sourceRecordId,versionHash,resourceReleaseId) VALUES('dataset','record','v1','r1'),('dataset','record','v1','r2');",
  )
  db.query(`INSERT INTO hkgovCenstatdDivisionAreaDerivatives
    (datasetCode,sourceRecordId,inputVersionHash,versionHash,resourceReleaseId,validFromRelease,isCurrent,transform,derivation,geometry,bbox)
    VALUES('dataset','record','v1','derivative','r2','2021',1,'simplified','{"method":"fixture"}',?,'[114,22,114,22]')`).run(
    JSON.stringify(sourceGeometry),
  )
  return db
}

test('generated geometry conversion preserves both release assertions and is idempotent', () => {
  const db = fixture()
  try {
    db.transaction(() =>
      expect(convertCenstatdGeometry(db)).toMatchObject({
        sourceAssertions: 1,
        releaseStatistics: 2,
        geometries: 1,
        inputDerivatives: 1,
        derivatives: 1,
      }),
    )()
    expect(
      db
        .query(
          'SELECT resourceReleaseId,properties FROM hkgovCenstatdStatistics ORDER BY resourceReleaseId',
        )
        .all(),
    ).toEqual([
      { resourceReleaseId: 'r1', properties: '{"population":42}' },
      { resourceReleaseId: 'r2', properties: '{"population":42}' },
    ])
    const derivative = db
      .query<{ geometry: string; bbox: string }, []>(
        `SELECT d.geometry,d.bbox FROM hkgovCenstatdDivisionAreaDerivatives d
       JOIN hkgovCenstatdStatisticsGeometry g ON g.id=d.geometryId`,
      )
      .get()!
    expect(JSON.parse(derivative.geometry)).toEqual(sourceGeometry)
    expect(JSON.parse(derivative.bbox)).toEqual([114, 22, 114, 22])
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(convertCenstatdGeometry(db)).toEqual({ alreadyApplied: true })
  } finally {
    db.close()
  }
})

test('orphan memberships reject conversion without discarding publisher evidence', () => {
  const db = fixture()
  try {
    db.exec(
      "INSERT INTO hkgovCenstatdStatisticsReleaseMemberships(datasetCode,sourceRecordId,versionHash,resourceReleaseId) VALUES('dataset','missing','v1','r1')",
    )
    expect(() => db.transaction(() => convertCenstatdGeometry(db))()).toThrow(
      'Orphan C&SD membership',
    )
    expect(db.query('SELECT count(*) AS n FROM hkgovCenstatdStatistics').get()).toEqual(
      { n: 1 },
    )
    expect(
      db.query('SELECT count(*) AS n FROM hkgovCenstatdDivisionAreaDerivatives').get(),
    ).toEqual({ n: 1 })
    expect(db.query('SELECT count(*) AS n FROM d1_migrations').get()).toEqual({ n: 0 })
  } finally {
    db.close()
  }
})

test('conversion remains idempotent after subsequent generated table renames', () => {
  const db = fixture()
  try {
    db.transaction(() => convertCenstatdGeometry(db))()
    const root = resolve(import.meta.dir, '../migrations/source')
    for (const name of readdirSync(root).sort()) {
      if (`${name}/migration.sql` <= migrationName) continue
      db.exec(readFileSync(resolve(root, name, 'migration.sql'), 'utf8'))
    }
    expect(convertCenstatdGeometry(db)).toEqual({ alreadyApplied: true })
    expect(db.query('SELECT count(*) AS n FROM hkgovCenstatdGeometry').get()).toEqual({
      n: 1,
    })
    expect(
      db.query('SELECT count(*) AS n FROM hkgovCenstatdGeometryDerivatives').get(),
    ).toEqual({ n: 1 })
    expect(db.query('PRAGMA foreign_key_check').all()).toEqual([])
    expect(db.query('PRAGMA integrity_check').get()).toEqual({ integrity_check: 'ok' })
  } finally {
    db.close()
  }
})

test('conversion refuses a destination table without its migration receipt', () => {
  const db = fixture()
  try {
    db.exec(
      'CREATE TABLE hkgovCenstatdStatisticsGeometry(id TEXT PRIMARY KEY, sourceGeometry TEXT NOT NULL)',
    )
    expect(() => db.transaction(() => convertCenstatdGeometry(db))()).toThrow(
      'Geometry table exists without migration receipt.',
    )
    expect(db.query('SELECT count(*) AS n FROM hkgovCenstatdStatistics').get()).toEqual(
      { n: 1 },
    )
    expect(db.query('SELECT count(*) AS n FROM d1_migrations').get()).toEqual({ n: 0 })
  } finally {
    db.close()
  }
})
