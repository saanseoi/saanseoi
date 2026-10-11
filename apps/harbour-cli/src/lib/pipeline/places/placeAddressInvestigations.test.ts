import { test, expect } from 'bun:test'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  deferPlaceAddressReviews,
  deferredPlaceAddressResolution,
} from './placeAddressInvestigations'
import type { StagedAddressResolution } from './supplementaryPlaceAddress'

test('authorised deferral retains unresolved evidence, replays exactly, and never links a candidate', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'place-investigation-'))
  try {
    const row: StagedAddressResolution = {
      placeId: 'place',
      sourceTexts: ['publisher address'],
      fingerprint: 'fingerprint',
      tier: 'review',
      addressId: null,
      previous: null,
      candidates: [],
      reason: 'multiple_close_matches',
      parsed: [],
    }
    const report = { sourceRelease: '2025-10-22.0', unresolvedCount: 1, results: [row] }
    const reviewPath = join(directory, 'review.json')
    await writeFile(reviewPath, JSON.stringify(report))
    expect(await deferPlaceAddressReviews({ reviewPath, directory })).toBeNull()
    const path = await deferPlaceAddressReviews({
      reviewPath,
      directory,
      authority: 'User accepts unresolved data, low priority',
    })
    expect(path).toBeTruthy()
    const retained = JSON.parse(await readFile(path!, 'utf8'))
    expect(retained.report).toEqual(report)
    expect(retained.status).toBe('needs-further-investigation')
    expect(retained.priority).toBe('low')
    expect(await deferPlaceAddressReviews({ reviewPath, directory })).toBe(path)
    const deferred = deferredPlaceAddressResolution(row, path!)
    expect(deferred.tier).toBe('investigation')
    expect(deferred.addressId).toBeNull()
    expect(deferred.sourceTexts).toEqual(row.sourceTexts)
    expect(deferred.reason).toBe(row.reason)
    expect(() =>
      deferredPlaceAddressResolution({ ...row, addressId: 'uncertain' }, path!),
    ).toThrow()
    await writeFile(path!, JSON.stringify({ ...retained, report: {} }))
    expect(deferPlaceAddressReviews({ reviewPath, directory })).rejects.toThrow(
      'does not match',
    )
    await writeFile(reviewPath, JSON.stringify({ ...report, unresolvedCount: 2 }))
    expect(
      deferPlaceAddressReviews({ reviewPath, directory, authority: 'user' }),
    ).rejects.toThrow('Invalid')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
