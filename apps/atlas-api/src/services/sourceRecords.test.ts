import { requireDefined } from '@repo/core/requireDefined'
import { describe, expect, test } from 'bun:test'
import { Database } from 'bun:sqlite'

import {
  listSourceRecords,
  getSourceRecordSchema,
  listSourceReleases,
  SourceRecordRequestError,
  streamSourceRecordsNdjson,
} from './sourceRecords'
import { compressJsonBrotli } from '@repo/core/pipeline/services/brotliJson.ts'

function sourceDatabase(
  rows: Array<Record<string, unknown>>,
  tableName = 'overtureDivisions',
  sourceVersion = '2026-07-22.0',
) {
  return {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            all: async () => {
              expect(query).toContain(`FROM ${tableName}`)
              expect(query).toContain('validFromRelease <= ?')
              expect(query).toContain('validToRelease IS NULL')
              expect(values.slice(0, 2)).toEqual([sourceVersion, sourceVersion])
              return { results: rows, success: true }
            },
          }
        },
      }
    },
  } as never
}

function metaDatabase(input?: {
  datasetCode?: string
  resourceType?: string
  sourceReleaseCode?: string
  sourceVersion?: string
  sourceVariant?: string
  published?: boolean
}) {
  const sourceReleaseCode =
    input?.sourceReleaseCode ?? 'dr-hk-overture-division-2026-07-22.0'
  return {
    $client: {
      prepare(query: string) {
        return {
          bind(...values: unknown[]) {
            return {
              all: async () => {
                expect(query).toContain('FROM releases')
                expect(query).toContain(
                  "sourceReleases.status IN ('published', 'superseded')",
                )
                expect(query).toContain('releases.revokedAt IS NULL')
                expect(query).toContain('datasets.regionCode = ?')
                expect(values).toEqual([sourceReleaseCode, sourceReleaseCode, 'hk'])
                return {
                  results:
                    input?.published === false
                      ? []
                      : [
                          {
                            bindingName: 'DB_SOURCE_HK_2026',
                            datasetCode:
                              input?.datasetCode ?? 'ds-hk-overture-division',
                            releaseId: 'source-release-id',
                            resourceType: input?.resourceType ?? 'division',
                            sourceReleaseCode,
                            sourceVersion: input?.sourceVersion ?? '2026-07-22.0',
                            sourceVariant: input?.sourceVariant ?? 'overture',
                          },
                        ],
                }
              },
            }
          },
        }
      },
    },
  } as never
}

const sourceReleaseCode = 'dr-hk-overture-division-2026-07-22.0'

describe('source records', () => {
  test('resolves the public parent to its statistics child without losing retained geometry', async () => {
    const sqlite = new Database(':memory:')
    const code =
      'dr-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups-2021'
    const datasetCode =
      'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups'
    sqlite.exec(`
      CREATE TABLE publishers(id, code);
      CREATE TABLE datasets(id, code, publisherId, regionCode, sourceVariant);
      CREATE TABLE sourceReleases(id, code, status, revokedAt);
      CREATE TABLE releases(id, code, sourceReleaseId, datasetId, resourceType, sourceVersion, status, revokedAt);
      CREATE TABLE releaseShardAssignments(releaseId, dataShardId);
      CREATE TABLE dataShards(id, bindingName, shardType, status);
      CREATE TABLE hkgovCenstatdStatistics(sourceRecordId, versionHash, rawProperties, sourceGeometry, validFromRelease, validToRelease);
      INSERT INTO publishers VALUES('publisher', 'hkgov-censtatd');
      INSERT INTO dataShards VALUES('shard', 'DB_SOURCE_HK_2026', 'source', 'active');
      INSERT INTO releaseShardAssignments VALUES('area', 'shard'), ('statistic', 'shard');
    `)
    sqlite.run('INSERT INTO datasets VALUES(?, ?, ?, ?, ?)', [
      'dataset',
      datasetCode,
      'publisher',
      'hk',
      'official-statistics',
    ])
    sqlite.run('INSERT INTO sourceReleases VALUES(?, ?, ?, NULL)', [
      'parent',
      code,
      'published',
    ])
    for (const [id, type] of [
      ['area', 'divisionArea'],
      ['statistic', 'divisionStatistic'],
    ]) {
      sqlite.run('INSERT INTO releases VALUES(?, ?, ?, ?, ?, ?, ?, NULL)', [
        id!,
        `${code}::${type}`,
        'parent',
        'dataset',
        type!,
        '2021',
        'published',
      ])
    }
    sqlite.run('INSERT INTO hkgovCenstatdStatistics VALUES(?, ?, ?, ?, ?, NULL)', [
      'record',
      'hash',
      '{"population":42}',
      '{"type":"Point","coordinates":[114,22]}',
      `${code}::divisionStatistic`,
    ])
    const binding = {
      prepare(query: string) {
        return {
          bind(...values: (string | number)[]) {
            return {
              all: async () => ({
                results: sqlite.query(query).all(...values),
                success: true,
              }),
            }
          },
        }
      },
    }
    const args = {
      metaDb: { $client: binding } as never,
      env: { DB_SOURCE_HK_2026: binding } as never,
      family: 'stats' as const,
      sourceReleaseCode: code,
      limit: 10,
    }
    try {
      const plain = await listSourceRecords({ ...args, includeGeometry: false })
      expect(plain?.records).toHaveLength(1)
      expect(plain?.records[0]).toMatchObject({
        resourceType: 'divisionStatistic',
        rawProperties: { population: 42 },
      })
      expect(plain?.records[0]).not.toHaveProperty('geometry')
      const spatial = await listSourceRecords({ ...args, includeGeometry: true })
      expect(spatial?.records[0]?.geometry).toEqual({
        type: 'Point',
        coordinates: [114, 22],
      })
      sqlite.run("UPDATE sourceReleases SET status = 'processing'")
      expect(await listSourceRecords({ ...args, includeGeometry: false })).toBeNull()
    } finally {
      sqlite.close()
    }
  })

  test('uses full source codes for areas and inventories every record without leaking another dataset', async () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`CREATE TABLE hkgovCenstatdStatistics (
      sourceRecordId TEXT, versionHash TEXT, rawProperties TEXT,
      validFromRelease TEXT, validToRelease TEXT
    )`)
    const code = 'dr-hk-hkgov-censtatd-division-statistic-new-towns-2021'
    const insert = sqlite.query(
      'INSERT INTO hkgovCenstatdStatistics VALUES (?, ?, ?, ?, ?)',
    )
    insert.run('old', 'v1', '{"obsolete":true}', code.replace('2021', '2016'), code)
    insert.run('a', 'v1', '{"name":"One","value":1,"optional":null}', code, null)
    insert.run('b', 'v1', '{"name":"Two","value":"suppressed","rare":true}', code, null)
    insert.run(
      'unrelated',
      'v1',
      '{"wrongDataset":true}',
      code.replace('new-towns', 'major-housing-estates'),
      null,
    )
    insert.run('future', 'v1', '{"future":true}', code.replace('2021', '2026'), null)
    const sourceDb = {
      prepare(query: string) {
        return {
          bind(...values: Array<string | number>) {
            return {
              all: async () => ({
                results: sqlite.query(query).all(...values),
                success: true,
              }),
            }
          },
        }
      },
    } as never
    const args = {
      env: { DB_SOURCE_HK_2026: sourceDb } as never,
      family: 'stats' as const,
      includeGeometry: false,
      metaDb: metaDatabase({
        datasetCode: 'ds-hk-hkgov-censtatd-division-statistic-new-towns',
        sourceReleaseCode: code,
        sourceVersion: '2021',
      }),
      sourceReleaseCode: code,
    }
    try {
      for (const sample of [undefined, 'random'] as const) {
        const page = await listSourceRecords({ ...args, sample, limit: 10 })
        expect(page?.records.map(record => record.sourceRecordId).sort()).toEqual([
          'a',
          'b',
        ])
      }
      const schema = await getSourceRecordSchema(args)
      expect(schema?.properties).toEqual({
        name: { type: 'string', nullable: false },
        optional: { type: 'null', nullable: true },
        rare: { type: 'boolean', nullable: false },
        value: { anyOf: [{ type: 'integer' }, { type: 'string' }], nullable: false },
      })
    } finally {
      sqlite.close()
    }
  })

  test('reads and streams exact Places source versions with pagination and geometry', async () => {
    const sqlite = new Database(':memory:')
    sqlite.exec(`CREATE TABLE overturePlaces (
      sourceRecordId TEXT, versionHash TEXT, rawProperties TEXT,
      validFromRelease TEXT, validToRelease TEXT
    )`)
    const geometry = { type: 'Point', coordinates: [114.1, 22.3] }
    for (const [id, hash, from, to, name] of [
      ['place-a', 'old', '2026-06-17.0', '2026-07-22.0', 'Old name'],
      ['place-a', 'current', '2026-07-22.0', null, 'Publisher name'],
      ['place-b', 'current', '2026-07-22.0', null, 'Second place'],
      ['place-c', 'future', '2026-08-19.0', null, 'Future place'],
    ]) {
      sqlite
        .query('INSERT INTO overturePlaces VALUES (?, ?, ?, ?, ?)')
        .run(
          requireDefined(id),
          requireDefined(hash),
          JSON.stringify({ id, names: { primary: name }, geometry }),
          requireDefined(from),
          to ?? null,
        )
    }
    const sourceDb = {
      prepare(query: string) {
        return {
          bind(...values: Array<string | number>) {
            return {
              all: async () => ({
                results: sqlite.query(query).all(...values),
                success: true,
              }),
            }
          },
        }
      },
    } as never
    const args = {
      env: { DB_SOURCE_HK_2026: sourceDb } as never,
      family: 'places' as const,
      includeGeometry: true,
      metaDb: metaDatabase({
        datasetCode: 'ds-hk-overture-place',
        resourceType: 'place',
        sourceReleaseCode: 'dr-hk-overture-place-2026-07-22.0',
      }),
      sourceReleaseCode: 'dr-hk-overture-place-2026-07-22.0',
    }
    try {
      const first = await listSourceRecords({ ...args, limit: 1 })
      expect(first?.pin.datasetCode).toBe('ds-hk-overture-place')
      expect(first?.records[0]).toMatchObject({
        sourceRecordId: 'place-a',
        resourceType: 'place',
        geometry,
        rawProperties: { names: { primary: 'Publisher name' } },
      })
      expect(first?.nextCursor).toBeString()
      const second = await listSourceRecords({
        ...args,
        cursor: requireDefined(requireDefined(first).nextCursor),
        limit: 1,
      })
      expect(second?.records.map(row => row.sourceRecordId)).toEqual(['place-b'])
      expect(second?.nextCursor).toBeNull()
      const stream = await streamSourceRecordsNdjson(args)
      const records = (await new Response(stream).text())
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
      expect(records).toEqual([
        ...requireDefined(first).records,
        ...requireDefined(second).records,
      ])
      const sample = await listSourceRecords({ ...args, sample: 'random', limit: 2 })
      expect(sample?.records).toHaveLength(2)
      expect(sample?.nextCursor).toBeNull()
      const withoutGeometry = await listSourceRecords({
        ...args,
        includeGeometry: false,
      })
      expect(withoutGeometry?.records[0]).not.toHaveProperty('geometry')
      expect(withoutGeometry?.records[0]?.rawProperties?.geometry).toEqual(geometry)
      expect(await listSourceRecords({ ...args, family: 'divisions' })).toBeNull()
      expect(
        await listSourceRecords({
          ...args,
          metaDb: metaDatabase({
            published: false,
            sourceReleaseCode: args.sourceReleaseCode,
          }),
        }),
      ).toBeNull()
    } finally {
      sqlite.close()
    }
  })

  test.each(['divisions', 'places'] as const)(
    'discovers %s current and archived API release sets as published history',
    async family => {
      const resourceType = family === 'places' ? 'place' : 'division'
      const datasetCode = `ds-hk-overture-${resourceType}`
      const sourceReleaseCode = `dr-hk-overture-${resourceType}-2026-07-22.0`
      const queries: string[] = []
      const metaDb = {
        $client: {
          prepare(query: string) {
            queries.push(query)
            return {
              bind() {
                return {
                  first: async () => ({ id: 'release-set-1' }),
                  all: async () => ({
                    results: [
                      {
                        apiReleaseSetCode: `data-hk-${family}-2026-07-22.0-r0`,
                        datasetCode,
                        hasSourceShard: 1,
                        resourceType,
                        role: 'primary',
                        snapshotCode: 'snapshot-1',
                        sourceReleaseCode,
                        sourceVariant: 'overture',
                      },
                    ],
                  }),
                }
              },
            }
          },
        },
      } as never

      const result = await listSourceReleases({
        family,
        metaDb,
      })

      expect(queries[0]).toContain("apiReleaseSets.status <> 'draft'")
      expect(queries[1]).toContain("releases.status IN ('published', 'superseded')")
      expect(queries[1]).toContain('releases.revokedAt IS NULL')
      expect(queries[1]).toContain(
        "sourceReleases.status IN ('published', 'superseded')",
      )
      expect(queries[1]).toContain('sourceReleases.revokedAt IS NULL')
      expect(queries.join('\n')).not.toContain("apiReleaseSets.status = 'published'")
      expect(result).toHaveLength(1)
      expect(result[0]?.recordsAvailable).toBe(true)
      expect(result[0]?.recordsHref).toBe(
        `/${family}/v0/sources?sourceRelease=${sourceReleaseCode}`,
      )
    },
  )

  test('does not expose a stored source release before publication', async () => {
    const result = await listSourceRecords({
      env: {
        DB_SOURCE_HK_2025: sourceDatabase([]),
        DB_SOURCE_HK_2026: sourceDatabase([]),
        DB_SOURCE_HK_BEFORE: sourceDatabase([]),
      } as never,
      family: 'divisions',
      includeGeometry: false,
      metaDb: metaDatabase({ published: false }),
      sourceReleaseCode,
    })

    expect(result).toBeNull()
  })

  test('pins an Overture source release and preserves its raw properties', async () => {
    const result = await listSourceRecords({
      env: {
        DB_SOURCE_HK_2025: sourceDatabase([]),
        DB_SOURCE_HK_2026: sourceDatabase([
          {
            rawProperties: JSON.stringify({
              class: 'administrative',
              id: 'division-1',
            }),
            sourceRecordId: 'division-1',
            versionHash: 'version-1',
          },
        ]),
        DB_SOURCE_HK_BEFORE: sourceDatabase([]),
      } as never,
      family: 'divisions',
      includeGeometry: false,
      metaDb: metaDatabase(),
      sourceReleaseCode,
    })

    expect(result).toEqual({
      nextCursor: null,
      pin: {
        apiReleaseSetCode: null,
        datasetCode: 'ds-hk-overture-division',
        snapshotCode: null,
        sourceReleaseCode,
      },
      records: [
        {
          rawProperties: { class: 'administrative', id: 'division-1' },
          resourceType: 'division',
          sourceRecordId: 'division-1',
          variant: 'overture',
        },
      ],
    })
  })

  test('returns a cursor-free random sample of raw source records', async () => {
    let query = ''
    const randomSourceDatabase = {
      prepare(value: string) {
        query = value
        return {
          bind(...values: unknown[]) {
            expect(values.slice(0, 2)).toEqual(['2026-07-22.0', '2026-07-22.0'])
            expect(values[3]).toMatch(
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
            )
            expect(values[4]).toBe(2)
            return {
              all: async () => ({
                results: [
                  {
                    rawProperties: JSON.stringify({ id: 'division-2' }),
                    sourceRecordId: 'division-2',
                    versionHash: 'version-2',
                  },
                  {
                    rawProperties: JSON.stringify({ id: 'division-1' }),
                    sourceRecordId: 'division-1',
                    versionHash: 'version-1',
                  },
                ],
                success: true,
              }),
            }
          },
        }
      },
    } as never

    const result = await listSourceRecords({
      env: {
        DB_SOURCE_HK_2025: sourceDatabase([]),
        DB_SOURCE_HK_2026: randomSourceDatabase,
        DB_SOURCE_HK_BEFORE: sourceDatabase([]),
      } as never,
      family: 'divisions',
      includeGeometry: false,
      limit: 2,
      metaDb: metaDatabase(),
      sample: 'random',
      sourceReleaseCode,
    })

    expect(query).toContain('AND sourceRecordId >= ?')
    expect(query).toContain('ORDER BY sourceRecordId ASC, versionHash ASC')
    expect(query).not.toContain('RANDOM()')
    expect(result?.nextCursor).toBeNull()
    expect(result?.records.map(record => record.sourceRecordId)).toEqual([
      'division-2',
      'division-1',
    ])
  })

  test('wraps an indexed random sample when its initial key range is exhausted', async () => {
    const queries: string[] = []
    const randomSourceDatabase = {
      prepare(query: string) {
        queries.push(query)
        return {
          bind(...values: unknown[]) {
            expect(values.slice(0, 2)).toEqual(['2026-07-22.0', '2026-07-22.0'])
            expect(values[3]).toMatch(
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
            )
            return {
              all: async () => ({
                results: query.includes('sourceRecordId >= ?')
                  ? []
                  : [
                      {
                        rawProperties: JSON.stringify({ id: 'division-1' }),
                        sourceRecordId: 'division-1',
                        versionHash: 'version-1',
                      },
                    ],
                success: true,
              }),
            }
          },
        }
      },
    } as never

    const result = await listSourceRecords({
      env: {
        DB_SOURCE_HK_2025: sourceDatabase([]),
        DB_SOURCE_HK_2026: randomSourceDatabase,
        DB_SOURCE_HK_BEFORE: sourceDatabase([]),
      } as never,
      family: 'divisions',
      includeGeometry: false,
      limit: 1,
      metaDb: metaDatabase(),
      sample: 'random',
      sourceReleaseCode,
    })

    expect(queries).toHaveLength(2)
    expect(queries[0]).toContain('sourceRecordId >= ?')
    expect(queries[1]).toContain('sourceRecordId < ?')
    expect(result?.records.map(record => record.sourceRecordId)).toEqual(['division-1'])
  })

  test('samples ALS using its prefixed UUID index', async () => {
    let query = ''
    const sourceDb = {
      prepare(value: string) {
        query = value
        return {
          bind(...values: unknown[]) {
            expect(values[3]).toMatch(/^ss-[0-9a-f-]{36}$/)
            return {
              all: async () => ({
                results: [
                  {
                    sourceRecordId: 'ss-example',
                    versionHash: 'v1',
                    rawProperties: '{}',
                  },
                ],
                success: true,
              }),
            }
          },
        }
      },
    } as never
    const result = await listSourceRecords({
      env: { DB_SOURCE_HK_2026: sourceDb } as never,
      family: 'addresses',
      includeGeometry: false,
      limit: 1,
      sample: 'random',
      sourceReleaseCode: 'dr-hk-hkgov-dpo-address-2026-07-22.0',
      metaDb: metaDatabase({
        datasetCode: 'ds-hk-hkgov-dpo-address',
        resourceType: 'address',
        sourceReleaseCode: 'dr-hk-hkgov-dpo-address-2026-07-22.0',
        sourceVersion: '2026-07-22.0',
      }),
    })
    expect(query).toContain('sourceRecordId >= ?')
    expect(query).not.toContain('RANDOM()')
    expect(result?.records).toHaveLength(1)
  })

  test('uses random ordering for publisher source identifiers outside Overture UUID space', async () => {
    let query = ''
    const randomSourceDatabase = {
      prepare(value: string) {
        query = value
        return {
          bind(...values: unknown[]) {
            expect(values).toEqual([
              'dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2016',
              'dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2016',
              'dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-',
              2,
            ])
            return {
              all: async () => ({
                results: [
                  {
                    rawProperties: JSON.stringify({ id: 'CENSTATD:T' }),
                    sourceRecordId: 'CENSTATD:T',
                    versionHash: 'version-1',
                  },
                  {
                    rawProperties: JSON.stringify({ id: 'CENSTATD:K' }),
                    sourceRecordId: 'CENSTATD:K',
                    versionHash: 'version-2',
                  },
                ],
                success: true,
              }),
            }
          },
        }
      },
    } as never
    const censtatdRelease =
      'dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2016'

    const result = await listSourceRecords({
      env: {
        DB_SOURCE_HK_2025: sourceDatabase([]),
        DB_SOURCE_HK_2026: randomSourceDatabase,
        DB_SOURCE_HK_BEFORE: sourceDatabase([]),
      } as never,
      family: 'divisions',
      includeGeometry: false,
      limit: 2,
      metaDb: metaDatabase({
        datasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
        resourceType: 'divisionArea',
        sourceReleaseCode: censtatdRelease,
        sourceVariant: 'hkgov-censtatd:2016',
        sourceVersion: '2016',
      }),
      sample: 'random',
      sourceReleaseCode: censtatdRelease,
    })

    expect(query).toContain('FROM hkgovCenstatdDivisionAreas')
    expect(query).toContain('ORDER BY RANDOM()')
    expect(query).not.toContain('sourceRecordId >= ?')
    expect(result?.records.map(record => record.sourceRecordId)).toEqual([
      'CENSTATD:T',
      'CENSTATD:K',
    ])
  })

  test('rejects a cursor combined with a random source-record sample', async () => {
    await expect(
      listSourceRecords({
        cursor:
          'eyJzb3VyY2VSZWNvcmRJZCI6ImRpdmlzaW9uLTEiLCJ2ZXJzaW9uSGFzaCI6InZlcnNpb24tMSJ9',
        env: {
          DB_SOURCE_HK_2025: sourceDatabase([]),
          DB_SOURCE_HK_2026: sourceDatabase([]),
          DB_SOURCE_HK_BEFORE: sourceDatabase([]),
        } as never,
        family: 'divisions',
        includeGeometry: false,
        metaDb: metaDatabase(),
        sample: 'random',
        sourceReleaseCode,
      }),
    ).rejects.toBeInstanceOf(SourceRecordRequestError)
  })

  test('returns Overture geometry retained in the raw source properties', async () => {
    const geometry = {
      coordinates: [114.1, 22.3],
      type: 'Point',
    }
    const result = await listSourceRecords({
      env: {
        DB_SOURCE_HK_2025: sourceDatabase([]),
        DB_SOURCE_HK_2026: sourceDatabase([
          {
            rawProperties: JSON.stringify({ geometry, id: 'division-1' }),
            sourceRecordId: 'division-1',
            versionHash: 'version-1',
          },
        ]),
        DB_SOURCE_HK_BEFORE: sourceDatabase([]),
      } as never,
      family: 'divisions',
      includeGeometry: true,
      metaDb: metaDatabase(),
      sourceReleaseCode,
    })

    expect(result?.records[0]).toMatchObject({ geometry })
  })

  test('decompresses exact C&SD geometry stored as a Brotli BLOB', async () => {
    const geometry = {
      coordinates: [
        [114.1, 22.2],
        [114.2, 22.2],
        [114.1, 22.2],
      ],
      type: 'Polygon',
    }
    const censtatdRelease =
      'dr-hk-hkgov-censtatd-division-statistic-subdivided-units-district-2016'
    const result = await listSourceRecords({
      env: {
        DB_SOURCE_HK_2025: sourceDatabase([]),
        DB_SOURCE_HK_2026: sourceDatabase(
          [
            {
              rawProperties: JSON.stringify({ dc: 1, dc_eng: 'Central and Western' }),
              sourceGeometry: compressJsonBrotli(geometry),
              sourceRecordId: 'CENSTATD:A',
              versionHash: 'version-1',
            },
          ],
          'hkgovCenstatdDivisionAreas',
          censtatdRelease,
        ),
        DB_SOURCE_HK_BEFORE: sourceDatabase([]),
      } as never,
      family: 'divisions',
      includeGeometry: true,
      metaDb: metaDatabase({
        datasetCode:
          'ds-hk-hkgov-censtatd-division-statistic-subdivided-units-district',
        resourceType: 'divisionArea',
        sourceReleaseCode: censtatdRelease,
        sourceVersion: '2016',
        sourceVariant: 'hkgov-censtatd:2016',
      }),
      sourceReleaseCode: censtatdRelease,
    })

    expect(result?.records).toEqual([
      {
        geometry,
        rawProperties: { dc: 1, dc_eng: 'Central and Western' },
        resourceType: 'divisionArea',
        sourceRecordId: 'CENSTATD:A',
        variant: 'hkgov-censtatd:2016',
      },
    ])
  })

  test('rejects a malformed opaque source cursor', async () => {
    await expect(
      listSourceRecords({
        cursor: 'not-a-cursor',
        env: {
          DB_SOURCE_HK_2025: sourceDatabase([]),
          DB_SOURCE_HK_2026: sourceDatabase([]),
          DB_SOURCE_HK_BEFORE: sourceDatabase([]),
        } as never,
        family: 'divisions',
        includeGeometry: false,
        metaDb: metaDatabase(),
        sourceReleaseCode,
      }),
    ).rejects.toBeInstanceOf(SourceRecordRequestError)
  })

  test('streams the same source-release pin as newline-delimited JSON', async () => {
    const stream = await streamSourceRecordsNdjson({
      env: {
        DB_SOURCE_HK_2025: sourceDatabase([]),
        DB_SOURCE_HK_2026: sourceDatabase([
          {
            rawProperties: JSON.stringify({ class: 'administrative' }),
            sourceRecordId: 'division-1',
            versionHash: 'version-1',
          },
        ]),
        DB_SOURCE_HK_BEFORE: sourceDatabase([]),
      } as never,
      family: 'divisions',
      includeGeometry: false,
      metaDb: metaDatabase(),
      sourceReleaseCode,
    })

    expect(stream).toBeInstanceOf(ReadableStream)
    expect(await new Response(stream).text()).toBe(
      `${JSON.stringify({
        rawProperties: { class: 'administrative' },
        resourceType: 'division',
        sourceRecordId: 'division-1',
        variant: 'overture',
      })}\n`,
    )
  })
})
