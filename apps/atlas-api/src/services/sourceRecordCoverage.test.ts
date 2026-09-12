import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { sourceCatalogueFor } from './sourceRecordCatalogue'
import {
  getSourceRecordSchema,
  listSourceRecords,
  streamSourceRecordsNdjson,
} from './sourceRecords'

test('source catalogues include every retained family and preserve both ALS dimensions', () => {
  const database = new Database(':memory:')
  try {
    for (const table of ['hkgovAlsAddresses2d', 'hkgovAlsAddresses3d']) {
      database.exec(`CREATE TABLE ${table} (
        sourceRecordId TEXT, versionHash TEXT, validFromRelease TEXT,
        validToRelease TEXT, properties TEXT, sourceGeometry TEXT, sources TEXT
      )`)
    }
    database
      .query('INSERT INTO hkgovAlsAddresses2d VALUES (?, ?, ?, NULL, ?, NULL, NULL)')
      .run('2d-record', 'v1', '2026-01-01.0', '{"name":"Premises"}')
    database
      .query('INSERT INTO hkgovAlsAddresses3d VALUES (?, ?, ?, NULL, ?, NULL, NULL)')
      .run('3d-occurrence', 'v2', '2026-01-01.0', '{"properties":{"floor":"1"}}')
    const entry = sourceCatalogueFor('addresses')['ds-hk-hkgov-dpo-address']!
    const rows = database
      .query(`SELECT sourceRecordId, properties FROM ${entry.tableName}`)
      .all()
    expect(rows).toEqual([
      { sourceRecordId: '2d-record', properties: '{"name":"Premises"}' },
      {
        sourceRecordId: '3d-occurrence',
        properties: '{"properties":{"floor":"1"}}',
      },
    ])
    expect(Object.keys(sourceCatalogueFor('stats'))).toHaveLength(8)
    expect(Object.keys(sourceCatalogueFor('streets'))).toHaveLength(6)
    expect(sourceCatalogueFor('places')['ds-hk-overture-place']).toBeDefined()
    expect(
      sourceCatalogueFor('divisions')['ds-hk-hkgov-landsd-division'],
    ).toMatchObject({ tableName: 'hkgovLandsdPlaceNames' })
  } finally {
    database.close()
  }
})

test('Planning projections share their source pin and paginate across assigned shards', async () => {
  const databases = [new Database(':memory:'), new Database(':memory:')]
  const projectionCode = 'dr-hk-hkgov-pland-division-area-pu-2021'
  const bindings = databases.map(database => ({
    prepare(query: string) {
      return {
        bind(...values: Array<string | number>) {
          return {
            all: async () => ({ results: database.query(query).all(...values) }),
          }
        },
      }
    },
  }))
  try {
    for (const database of databases) {
      database.exec(`CREATE TABLE hkgovPlandPlanningCells (
        sources TEXT, sourceRecordId TEXT, versionHash TEXT, properties TEXT,
        validFromRelease TEXT, validToRelease TEXT
      )`)
    }
    for (const [index, ids] of [
      ['a', 'b'],
      ['b', 'c'],
    ].entries()) {
      for (const id of ids)
        databases[index]!.query(
          'INSERT INTO hkgovPlandPlanningCells (sourceRecordId, versionHash, properties, validFromRelease, validToRelease) VALUES (?, ?, ?, ?, NULL)',
        ).run(id, 'v1', JSON.stringify({ [id]: id }), '2021')
    }
    const args = {
      env: {
        DB_SOURCE_HK_BEFORE: bindings[0],
        DB_SOURCE_HK_2025: bindings[1],
      } as never,
      metaDb: {
        $client: {
          prepare: () => ({
            bind: () => ({
              all: async () => ({
                results: ['DB_SOURCE_HK_BEFORE', 'DB_SOURCE_HK_2025'].map(
                  bindingName => ({
                    bindingName,
                    datasetCode: 'ds-hk-hkgov-pland-division-pu',
                    sourceReleaseCode: projectionCode,
                    sourceVersion: '2021',
                    resourceType: 'divisionArea',
                    sourceVariant: 'hkgov-pland-pu',
                  }),
                ),
              }),
            }),
          }),
        },
      } as never,
      family: 'divisions' as const,
      sourceReleaseCode: projectionCode,
      includeGeometry: false,
    }
    const first = await listSourceRecords({ ...args, limit: 2 })
    expect(first?.pin.sourceReleaseCode).toBe(projectionCode)
    expect(first?.records.map(row => row.sourceRecordId)).toEqual(['a', 'b'])
    expect(first?.nextCursor).toBeString()
    const second = await listSourceRecords({
      ...args,
      limit: 2,
      cursor: first!.nextCursor!,
    })
    expect(second?.records.map(row => row.sourceRecordId)).toEqual(['c'])
    expect(second?.nextCursor).toBeNull()
    const random = await listSourceRecords({ ...args, sample: 'random', limit: 3 })
    expect(random?.records.map(row => row.sourceRecordId).sort()).toEqual([
      'a',
      'b',
      'c',
    ])
    const schema = await getSourceRecordSchema(args)
    expect(Object.keys(schema!.properties)).toEqual(['a', 'b', 'c'])
    const stream = await streamSourceRecordsNdjson(args)
    const records = (await new Response(stream).text())
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(records.map(row => row.sourceRecordId)).toEqual(['a', 'b', 'c'])
  } finally {
    for (const database of databases) database.close()
  }
})
