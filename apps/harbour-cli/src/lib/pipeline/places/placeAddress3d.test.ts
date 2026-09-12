import { expect, test } from 'bun:test'
import type { HarbourReadableDb } from '@repo/core/db/types'
import { createPlaceAddress3dMatcher } from './placeAddress3d.ts'

function fixture(get: () => Promise<unknown>) {
  return {
    select: () => ({ from: () => ({ where: () => ({ get }) }) }),
  } as unknown as HarbourReadableDb
}
const text = ['Flat A, 1/F, Example Building']

test('one enrichment invocation deduplicates concurrent Address3D reads and a new invocation sees edits', async () => {
  let reads = 0
  let unitId = 'unit-original'
  const db = fixture(async () => {
    reads++
    return {
      id: 'collection',
      address2dId: 'building',
      unresolvedSectionIds: [],
      units: [
        { id: unitId, floorType: 'F', floorRef: '1', unitType: 'F', unitRef: 'A' },
      ],
    }
  })
  const address = { id: 'building', parentAddressId: null }
  const match = createPlaceAddress3dMatcher(db)
  const results = await Promise.all(
    Array.from({ length: 50 }, () => match('snapshot', address, text)),
  )
  expect(reads).toBe(1)
  for (const result of results) expect(result?.address3dUnitId).toBe('unit-original')
  await match('other-snapshot', address, text)
  expect(reads).toBe(2)
  unitId = 'unit-edited'
  expect(
    (await createPlaceAddress3dMatcher(db)('snapshot', address, text))?.address3dUnitId,
  ).toBe('unit-edited')
  expect(reads).toBe(3)
})

test('missing collections are cached with bounded owner retention and failed reads can retry', async () => {
  let reads = 0
  let fail = true
  const db = fixture(async () => {
    reads++
    if (fail) {
      fail = false
      throw new Error('read interrupted')
    }
    return undefined
  })
  const match = createPlaceAddress3dMatcher(db)
  const address = { id: 'first', parentAddressId: null }
  await expect(match('snapshot', address, text)).rejects.toThrow('read interrupted')
  expect(await match('snapshot', address, text)).toBeNull()
  expect(await match('snapshot', address, text)).toBeNull()
  expect(reads).toBe(2)
  for (let id = 0; id < 128; id++)
    await match('snapshot', { id: String(id), parentAddressId: null }, text)
  await match('snapshot', address, text)
  expect(reads).toBe(131)
})
