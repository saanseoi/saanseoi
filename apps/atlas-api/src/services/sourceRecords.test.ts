import { describe, expect, test } from 'bun:test'

import {
  listSourceRecords,
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
                expect(values).toEqual([sourceReleaseCode])
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
  test('discovers current and archived API release sets as published history', async () => {
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
                      apiReleaseSetCode: 'data-hk-divisions-2026-07-22.0-r0',
                      datasetCode: 'ds-hk-overture-division',
                      hasSourceShard: 1,
                      resourceType: 'division',
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
      family: 'divisions',
      metaDb,
    })

    expect(queries[0]).toContain("apiReleaseSets.status <> 'draft'")
    expect(queries[1]).toContain("releases.status IN ('published', 'superseded')")
    expect(queries[1]).toContain('releases.revokedAt IS NULL')
    expect(queries[1]).toContain("sourceReleases.status IN ('published', 'superseded')")
    expect(queries[1]).toContain('sourceReleases.revokedAt IS NULL')
    expect(queries.join('\n')).not.toContain("apiReleaseSets.status = 'published'")
    expect(result).toHaveLength(1)
    expect(result[0]?.recordsAvailable).toBe(true)
  })

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
            expect(values[2]).toMatch(/^[0-9a-f]{32}$/)
            expect(values[3]).toBe(2)
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
            expect(values[2]).toMatch(/^[0-9a-f]{32}$/)
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
    const censtatdRelease = 'dr-hk-hkgov-censtatd-division-area-district-2016'
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
          '2016',
        ),
        DB_SOURCE_HK_BEFORE: sourceDatabase([]),
      } as never,
      family: 'divisions',
      includeGeometry: true,
      metaDb: metaDatabase({
        datasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
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
