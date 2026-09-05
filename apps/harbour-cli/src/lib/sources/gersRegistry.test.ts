import { describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { parquetWriteFile } from 'hyparquet-writer'

import {
  buildOvertureGersCoverage,
  cacheOvertureGersRegistry,
  formatOvertureGersCoverage,
} from './gersRegistry.ts'

describe('Overture GERS coverage', () => {
  test('counts each source type independently when an ID occurs in both inputs', () => {
    const sourceIds = new Map([
      ['division-only', new Set(['division' as const])],
      ['place-only', new Set(['place' as const])],
      ['both', new Set(['division' as const, 'place' as const])],
    ])

    expect(
      formatOvertureGersCoverage(
        buildOvertureGersCoverage(sourceIds, {
          'division-only': {
            isGers: true,
            firstSeen: null,
            lastSeen: null,
            lastChanged: null,
            path: null,
          },
          'place-only': { isGers: false },
          both: {
            isGers: true,
            firstSeen: null,
            lastSeen: null,
            lastChanged: null,
            path: null,
          },
        }),
      ),
    ).toEqual([
      {
        coverage: '100.00%',
        gersIds: 2,
        nonGersIds: 0,
        sourceType: 'division',
        totalIds: 2,
      },
      {
        coverage: '50.00%',
        gersIds: 1,
        nonGersIds: 1,
        sourceType: 'place',
        totalIds: 2,
      },
    ])
  })

  test('writes a local cache from registry matches and reuses it offline', async () => {
    const root = await mkdtemp(join(tmpdir(), 'harbour-gers-'))
    const sourceRoot = join(root, 'source')
    const sourceDirectory = join(sourceRoot, '2026-08-19.0/divisions/China/Hong Kong')
    const sourcePlacePath = join(
      sourceDirectory,
      'place.division.intersects.clipSmart.parquet',
    )
    const sourceDivisionPath = join(
      sourceDirectory,
      'division.division.intersects.clipSmart.parquet',
    )
    const registryPath = join(root, 'registry.parquet')
    const cachePath = join(root, 'cache.json')
    const matchedPlace = '00000000-0000-0000-0000-000000000001'
    const matchedDivision = '00000000-0000-0000-0000-000000000002'
    const unmatchedPlace = '00000000-0000-0000-0000-000000000003'

    try {
      await mkdir(sourceDirectory, { recursive: true })
      parquetWriteFile({
        filename: sourcePlacePath,
        columnData: [
          {
            data: [matchedPlace, unmatchedPlace],
            name: 'id',
            nullable: false,
            type: 'STRING',
          },
        ],
      })
      parquetWriteFile({
        filename: sourceDivisionPath,
        columnData: [
          { data: [matchedDivision], name: 'id', nullable: false, type: 'STRING' },
        ],
      })
      parquetWriteFile({
        filename: registryPath,
        columnData: [
          {
            data: [matchedPlace, matchedDivision],
            name: 'id',
            nullable: false,
            type: 'STRING',
          },
          {
            data: ['2025-06-25.0', '2025-06-25.0'],
            name: 'first_seen',
            nullable: false,
            type: 'STRING',
          },
          {
            data: ['2026-08-19.0', '2026-08-19.0'],
            name: 'last_seen',
            nullable: false,
            type: 'STRING',
          },
          {
            data: ['2026-08-19.0', '2026-08-19.0'],
            name: 'last_changed',
            nullable: false,
            type: 'STRING',
          },
          {
            data: [
              'theme=places/type=place/part-00000.parquet',
              'theme=divisions/type=division/part-00000.parquet',
            ],
            name: 'path',
            nullable: false,
            type: 'STRING',
          },
        ],
      })

      const registryBytes = new Uint8Array(await Bun.file(registryPath).arrayBuffer())
      const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input)
        if (url.includes('list-type=2')) {
          return new Response(
            '<ListBucketResult><Contents><Key>registry/part-00000.parquet</Key><LastModified>2026-08-19T00:00:00Z</LastModified><Size>' +
              registryBytes.byteLength +
              '</Size></Contents></ListBucketResult>',
          )
        }
        const range = String(new Headers(init?.headers).get('Range'))
        const match = /^bytes=(\d+)-(\d+)$/.exec(range)
        if (!match) throw new Error(`Unexpected registry request: ${range}`)
        const start = Number(match[1])
        const end = Number(match[2]) + 1
        return new Response(registryBytes.slice(start, end), { status: 206 })
      }

      const first = await cacheOvertureGersRegistry({
        cachePath,
        fetchImpl,
        sourceRoot,
      })
      expect(first.fetchedIds).toBe(3)
      expect(first.unmatchedIds).toEqual([unmatchedPlace])
      expect(formatOvertureGersCoverage(first.coverage)).toEqual([
        {
          coverage: '100.00%',
          gersIds: 1,
          nonGersIds: 0,
          sourceType: 'division',
          totalIds: 1,
        },
        {
          coverage: '50.00%',
          gersIds: 1,
          nonGersIds: 1,
          sourceType: 'place',
          totalIds: 2,
        },
      ])

      const second = await cacheOvertureGersRegistry({
        cachePath,
        fetchImpl: async () => {
          throw new Error('registry should not be fetched on a cache hit')
        },
        sourceRoot,
      })
      expect(second.fetchedIds).toBe(0)
      expect(second.unmatchedIds).toEqual([unmatchedPlace])
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})
