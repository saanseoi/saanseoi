import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { reuseEnrichedPlaces } from './enrichedPlaceCache.ts'
import { createPlaceAddress3dMatcher } from './placeAddress3d.ts'
import { createPlaceReleaseStatsAccumulator } from './processLocalPlaceSqlUploadStatistics.ts'

test('enrichment reuse preserves Map statistics and invalidates same-snapshot unit edits and missing collections', async () => {
  const root = await mkdtemp(join(tmpdir(), 'enriched-cache-'))
  const path = join(root, 'enriched.jsonl')
  let unitId: string | null = null
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({
          get: async () =>
            unitId === null
              ? undefined
              : {
                  id: 'collection',
                  address2dId: 'building',
                  unresolvedSectionIds: [],
                  units: [
                    {
                      id: unitId,
                      floorType: 'F',
                      floorRef: '1',
                      unitType: 'F',
                      unitRef: 'A',
                    },
                  ],
                },
        }),
      }),
    }),
  } as unknown as HarbourReadableDb
  let generations = 0
  let mutateDuringPreparation = false
  const run = (identity = 'fixed') =>
    reuseEnrichedPlaces({
      path,
      identity,
      db,
      generate: async (observe, validateBeforeCommit) => {
        generations++
        const match = await createPlaceAddress3dMatcher(db, observe)(
          'snapshot',
          { id: 'building', parentAddressId: null },
          ['Flat A, 1/F, Example Building'],
        )
        if (mutateDuringPreparation) unitId = 'concurrent-edit'
        await validateBeforeCommit()
        await writeFile(path, JSON.stringify(match))
        const stats = createPlaceReleaseStatsAccumulator()
        stats.localeCounts.set('en', 1)
        return { path, processedRows: 1, stats }
      },
    })
  try {
    await run()
    const resumed = await run()
    expect(generations).toBe(1)
    expect(resumed.stats.localeCounts).toBeInstanceOf(Map)
    expect(resumed.stats.localeCounts.get('en')).toBe(1)
    unitId = 'new-unit'
    await run()
    expect(generations).toBe(2)
    expect(JSON.parse(await readFile(path, 'utf8')).address3dUnitId).toBe('new-unit')
    unitId = 'edited-unit'
    await run()
    expect(generations).toBe(3)
    await run('changed-reviewed-input')
    expect(generations).toBe(4)
    const completed = await readFile(path, 'utf8')
    mutateDuringPreparation = true
    await expect(run('another-review')).rejects.toThrow(
      'changed during Place enrichment',
    )
    expect(await readFile(path, 'utf8')).toBe(completed)
    mutateDuringPreparation = false
    unitId = 'edited-unit'
    await writeFile(path, 'corrupt')
    await expect(run('changed-reviewed-input')).rejects.toThrow(
      'output checksum differs',
    )
    expect(generations).toBe(5)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
