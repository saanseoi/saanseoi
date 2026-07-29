import { describe, expect, test } from 'bun:test'

import {
  listSourceRecords,
  SourceRecordRequestError,
  streamSourceRecordsNdjson,
} from './sourceRecords'

function sourceDatabase(rows: Array<Record<string, unknown>>) {
  return {
    prepare(query: string) {
      return {
        bind(...values: unknown[]) {
          return {
            all: async () => {
              expect(query).toContain('FROM overtureDivisions')
              expect(values[0]).toBe('source-release-id')
              return { results: rows, success: true }
            },
          }
        },
      }
    },
  } as never
}

function metaDatabase() {
  return {
    $client: {
      prepare(query: string) {
        return {
          bind(...values: unknown[]) {
            return {
              all: async () => {
                expect(query).toContain('FROM releases')
                expect(values).toEqual(['dr-hk-overture-division-2026-07-22.0'])
                return {
                  results: [
                    {
                      bindingName: 'DB_SOURCE_HK_2026',
                      datasetCode: 'ds-hk-overture-division',
                      releaseId: 'source-release-id',
                      resourceType: 'division',
                      sourceReleaseCode: 'dr-hk-overture-division-2026-07-22.0',
                      sourceVariant: 'overture',
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
