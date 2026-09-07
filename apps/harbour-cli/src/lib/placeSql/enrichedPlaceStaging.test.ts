import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { normaliseOverturePlace } from '@repo/core/pipeline/services/place'
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
    select: () => ({ from: () => ({ where: () => ({ all: async () => [] }) }) }),
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
      { addressSnapshotId: 'address', divisionSnapshotId: 'division' },
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
