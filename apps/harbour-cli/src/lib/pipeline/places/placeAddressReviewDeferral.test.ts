import { expect, test } from 'bun:test'
import { deferPlaceAddressReview } from './placeAddressReviewDeferral'
import type { StagedAddressResolution } from './supplementaryPlaceAddress'

test('deferral retains evidence without selecting identities, changing geometry or mutating input', () => {
  const review: StagedAddressResolution = {
    placeId: 'place',
    sourceTexts: ['source'],
    fingerprint: 'fingerprint',
    tier: 'review',
    addressId: null,
    previous: null,
    candidates: [],
    parsed: [],
    reason: 'multiple_close_matches',
    placeGeometryOverride: { lng: 1, lat: 2 },
  }
  const deferred = deferPlaceAddressReview(review)
  expect(deferred).toMatchObject({
    tier: 'delayed',
    addressId: null,
    reviewDeferral: {
      reviewStatus: 'unreviewed',
      originalReason: 'multiple_close_matches',
    },
    sourceTexts: ['source'],
  })
  expect(deferred.placeGeometryOverride).toBeUndefined()
  expect(deferred.entry).toBeUndefined()
  expect(review.tier).toBe('review')
  expect(deferPlaceAddressReview(deferred)).toBe(deferred)
  const direct = { ...review, tier: 'direct' as const, addressId: 'known' }
  expect(deferPlaceAddressReview(direct)).toBe(direct)
})
