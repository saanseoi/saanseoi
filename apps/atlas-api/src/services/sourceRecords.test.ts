import { describe, expect, test } from 'bun:test'

import {
  listSourceRecords,
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
                expect(values).toEqual([sourceReleaseCode])
                return {
                  results: [
                    {
                      bindingName: 'DB_SOURCE_HK_2026',
                      datasetCode: input?.datasetCode ?? 'ds-hk-overture-division',
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
