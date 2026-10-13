import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { normaliseOverturePlace } from '@repo/core/pipeline/services/places/place'
import { stageEnrichedPlaces } from './processLocalPlaceSqlUploadPreparation.ts'
import type { StagedAddressResolution } from './supplementaryPlaceAddress.ts'
import { ENRICHED_PLACES_FILE } from './processLocalPlaceSqlUploadConfig.ts'

test('enrichment preserves completed output on failure, closes resolutions and retries complete Unicode rows', async () => {
  const root = await mkdtemp(join(tmpdir(), 'place-enrichment-'))
  const path = join(root, ENRICHED_PLACES_FILE)
  const sourcePath = join(root, 'source.jsonl')
  const resolutionPath = join(root, 'resolutions.jsonl')
  const place = normaliseOverturePlace(
    {
      id: 'place',
      geometry: { type: 'Point', coordinates: [114, 22] },
      names: { primary: '香港😀'.repeat(10000) },
    },
    '2026-08',
  )
  if (!place) throw new Error('Invalid test place')
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          all: async () => [],
          get: async () => ({
            scopeId: 'areas',
            preparedAt: 'ready',
            publicationToken: 'ready',
          }),
        }),
      }),
    }),
  } as unknown as HarbourReadableDb
  const resolution: StagedAddressResolution = {
    placeId: place.id,
    tier: 'delayed',
    addressId: null,
    sourceTexts: [],
    fingerprint: 'fixed',
    previous: null,
    candidates: [],
    reason: 'unlinked',
    parsed: [],
  }
  let closed = false
  let sourceReads = 0
  async function* places() {
    sourceReads++
    if (!place) throw new Error('Invalid test place')
    yield place
  }
  async function* resolutions(review: boolean) {
    try {
      yield { ...resolution, placeId: review ? 'out-of-order' : resolution.placeId }
    } finally {
      closed = true
    }
  }
  const run = (review: boolean) =>
    stageEnrichedPlaces(
      db,
      {
        addressSnapshotId: 'address',
        divisionSnapshotId: 'division',
        divisionAreaSnapshotId: 'areas',
      },
      places(),
      resolutions(review),
      root,
      undefined,
      { resolutionPath, snapshotId: 'supplementary', addresses: [] },
      sourcePath,
    )
  try {
    await writeFile(sourcePath, JSON.stringify(place))
    await writeFile(resolutionPath, JSON.stringify(resolution))
    await writeFile(path, 'previous completed output')
    await expect(run(true)).rejects.toThrow('resolution order diverged')
    expect(closed).toBe(true)
    expect(await readFile(path, 'utf8')).toBe('previous completed output')
    const result = await run(false)
    expect(result.processedRows).toBe(1)
    expect(JSON.parse((await readFile(path, 'utf8')).trim()).place).toEqual(place)
    const reads = sourceReads
    expect(await run(false)).toEqual(result)
    expect(sourceReads).toBe(reads)
    await writeFile(
      resolutionPath,
      JSON.stringify({ ...resolution, fingerprint: 'review-edited' }),
    )
    await run(false)
    expect(sourceReads).toBe(reads + 1)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('unlinked Places use corrected coordinates and geometry changes invalidate enrichment', async () => {
  const { Database } = await import('bun:sqlite')
  const { createLocalHarbourDb } = await import(
    '../../../../../../libs/core/src/testing/localDb.ts'
  )
  const { loadMigrationSql } = await import(
    '../../../../../../libs/core/src/testing/metaFixtures.ts'
  )
  const sqlite = new Database(':memory:')
  sqlite.exec(
    loadMigrationSql(join(import.meta.dir, '../../../../../../libs/db/migrations'), [
      'current',
    ]),
  )
  const insert = (table: string, row: Record<string, unknown>) =>
    sqlite
      .query(
        `INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row)
          .map(() => '?')
          .join(',')})`,
      )
      .run(
        ...(Object.values(row).map(value =>
          typeof value === 'object' && value !== null ? JSON.stringify(value) : value,
        ) as never[]),
      )
  const root = await mkdtemp(join(tmpdir(), 'spatial-place-'))
  try {
    for (const [table, scopeId, snapshotId] of [
      ['divisionPublicationState', 'd-scope', 'divisions'],
      ['divisionAreaPublicationState', 'g-scope', 'areas'],
    ])
      insert(table!, {
        scopeId,
        snapshotId,
        status: 'current',
        preparedAt: 'ready',
        publicationToken: 'ready',
      })
    insert('divisions', {
      scopeId: 'd-scope',
      id: 'town',
      class: 'town',
      category: 'locality',
      level: 3,
      hierarchies: { full: [] },
    })
    insert('divisionsI18n', {
      scopeId: 'd-scope',
      divisionId: 'town',
      locale: 'en',
      name: 'Town',
      isLocaleInferred: 0,
    })
    insert('divisionAreas', {
      scopeId: 'g-scope',
      id: 'polygon',
      divisionId: 'town',
      type: 'division_area',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [114, 22],
            [115, 22],
            [115, 23],
            [114, 23],
            [114, 22],
          ],
        ],
      },
    })
    const place = normaliseOverturePlace(
      {
        id: 'place',
        geometry: { type: 'Point', coordinates: [110, 20] },
        names: { primary: 'Unlinked Place' },
      },
      '2026-08',
    )!
    const resolution: StagedAddressResolution = {
      placeId: 'place',
      tier: 'delayed',
      addressId: null,
      sourceTexts: [],
      fingerprint: 'fixed',
      previous: null,
      candidates: [],
      reason: 'unlinked',
      parsed: [],
      lng: 114.5,
      lat: 22.5,
    }
    const sourcePath = join(root, 'source.jsonl'),
      resolutionPath = join(root, 'resolutions.jsonl')
    await writeFile(sourcePath, JSON.stringify(place))
    await writeFile(resolutionPath, JSON.stringify(resolution))
    const run = async () => {
      async function* places() {
        yield place
      }
      async function* resolutions() {
        yield resolution
      }
      const result = await stageEnrichedPlaces(
        createLocalHarbourDb(sqlite),
        {
          addressSnapshotId: 'addresses',
          divisionSnapshotId: 'divisions',
          divisionAreaSnapshotId: 'areas',
        },
        places(),
        resolutions(),
        root,
        undefined,
        { resolutionPath, snapshotId: 'supplementary', addresses: [] },
        sourcePath,
      )
      return JSON.parse((await readFile(result.path, 'utf8')).trim())
    }
    const first = await run()
    expect(first.address2dId).toBeNull()
    expect(first.divisionIds).toEqual(['town'])
    expect(first.divisionAssociation.evidence).toEqual([
      { divisionId: 'town', method: 'geometry' },
    ])
    expect(first.effectiveLng).toBe(114.5)
    sqlite.exec('DELETE FROM divisionAreas')
    const changed = await run()
    expect(changed.divisionIds).toEqual([])
    expect(changed.versionHash).not.toBe(first.versionHash)
  } finally {
    sqlite.close()
    await rm(root, { recursive: true, force: true })
  }
})
