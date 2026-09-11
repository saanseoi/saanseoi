import { expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('contract preparation is read-only, reversible and excludes Streets and unsafe replay rows', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'source-contract-'))
  const database = join(directory, 'source.sqlite')
  const output = join(directory, 'review.sql')
  const db = new Database(database)
  try {
    for (const table of [
      'overtureDivisions',
      'hkgovAlsAddresses2d',
      'hkgovHadDivisionAreas',
      'hkgovLandsdPlaceNames',
      'overturePlaces',
      'hkgovLandsdRoadCentrelines',
    ]) {
      db.exec(
        `CREATE TABLE ${table} (sourceRecordId TEXT, versionHash TEXT, properties TEXT, sources TEXT, sourceGeometry TEXT)`,
      )
    }
    const attribution = [{ dataset: 'OSM', property: '', record_id: 'literal-id' }]
    db.query('INSERT INTO overtureDivisions VALUES (?,?,?,?,?)').run(
      'publisher',
      'stable-hash',
      JSON.stringify({ names: { primary: ' 原始 ' }, version: 2 }),
      JSON.stringify({ overture: attribution }),
      null,
    )
    db.query('INSERT INTO hkgovAlsAddresses2d VALUES (?,?,?,?,?)').run(
      'als',
      'als-hash',
      '{"enBuildingName":" Original "}',
      JSON.stringify([
        {
          dataset: 'ALS',
          sourceVersion: '2026',
          sourceFile: 'original.json',
          featureIndexOneBased: 7,
        },
      ]),
      null,
    )
    db.query('INSERT INTO hkgovHadDivisionAreas VALUES (?,?,?,?,?)').run(
      'had',
      'had-hash',
      '{}',
      '[]',
      '{"type":"Point","coordinates":[114,22]}',
    )
    db.query('INSERT INTO hkgovLandsdRoadCentrelines VALUES (?,?,?,?,?)').run(
      'street',
      'street-hash',
      '{}',
      '[{"dataset":"LandsD"}]',
      null,
    )
    db.query('INSERT INTO hkgovLandsdPlaceNames VALUES (?,?,?,?,?)').run(
      'landsd',
      'hash',
      '{}',
      '[]',
      '{"type":"Point","coordinates":[114,22]}',
    )
    db.query('INSERT INTO overturePlaces VALUES (?,?,?,?,?)').run(
      'decoded',
      'hash',
      '{}',
      '[]',
      '{"type":"Point","coordinates":[114,22]}',
    )
    const before = db.query('SELECT * FROM overtureDivisions').get()
    const child = Bun.spawn(
      [
        process.execPath,
        resolve(
          import.meta.dir,
          '../../../../../../scripts/prepare-source-contract-rewrite.ts',
        ),
        '--database',
        database,
        '--output',
        output,
      ],
      { stdout: 'pipe', stderr: 'pipe' },
    )
    const error = await new Response(child.stderr).text()
    expect(await child.exited, error).toBe(0)
    expect(db.query('SELECT * FROM overtureDivisions').get()).toEqual(before)
    const sql = await readFile(output, 'utf8')
    expect(sql).not.toContain('RoadCentrelines')
    expect(sql).not.toContain('UPDATE hkgovHadDivisionAreas')
    db.exec(sql)
    db.exec(sql)
    const row = db
      .query('SELECT properties,sources,versionHash FROM overtureDivisions')
      .get() as { properties: string; sources: null; versionHash: string }
    expect(JSON.parse(row.properties)).toEqual({
      names: { primary: ' 原始 ' },
      version: 2,
      sources: [{ dataset: 'OSM', property: '', recordId: 'literal-id' }],
    })
    expect(row.sources).toBeNull()
    expect(row.versionHash).toBe('stable-hash')
    const als = db.query('SELECT sources FROM hkgovAlsAddresses2d').get() as {
      sources: string
    }
    expect(JSON.parse(als.sources)).toEqual({
      sourceFile: 'original.json',
      featureIndexOneBased: 7,
    })
    const report = JSON.parse(await readFile(`${output}.json`, 'utf8'))
    expect(report.changedRows).toBe(2)
    expect(report.requiresUpstreamReplay).toEqual({
      hkgovHadDivisionAreas: 1,
      hkgovLandsdPlaceNames: 1,
      overturePlaces: 1,
    })
    db.exec(await readFile(`${output}.rollback.sql`, 'utf8'))
    expect(db.query('SELECT * FROM overtureDivisions').get()).toEqual(before)
    expect(db.query('SELECT sources FROM hkgovLandsdRoadCentrelines').get()).toEqual({
      sources: '[{"dataset":"LandsD"}]',
    })
  } finally {
    db.close()
    await rm(directory, { recursive: true, force: true })
  }
})
