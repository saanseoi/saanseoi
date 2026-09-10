import { expect, test } from 'bun:test'
import {
  deferPlaceAddressTrialReview,
  permitsPlaceAddressTrialDeferral,
} from './placeAddressTrialDeferral'
import type { StagedAddressResolution } from './supplementaryPlaceAddress'

test('trial deferral requires the exact environment and release, never wildcard permission', () => {
  expect(
    permitsPlaceAddressTrialDeferral(undefined, 'production', '2025-09-24.0'),
  ).toBe(false)
  expect(permitsPlaceAddressTrialDeferral('*', 'production', '2025-09-24.0')).toBe(
    false,
  )
  expect(
    permitsPlaceAddressTrialDeferral(
      'production:2025-09-24.0',
      'local',
      '2025-09-24.0',
    ),
  ).toBe(false)
  expect(
    permitsPlaceAddressTrialDeferral(
      'production:2025-09-24.0',
      'production',
      '2025-10-22.0',
    ),
  ).toBe(false)
  expect(
    permitsPlaceAddressTrialDeferral(
      'production:2025-09-24.0,production:2025-10-22.0',
      'production',
      '2025-09-24.0',
    ),
  ).toBe(true)
})

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
  expect(deferPlaceAddressTrialReview(review, false)).toBe(review)
  const deferred = deferPlaceAddressTrialReview(review, true)
  expect(deferred).toMatchObject({
    tier: 'delayed',
    addressId: null,
    trialDeferral: { originalReason: 'multiple_close_matches' },
    sourceTexts: ['source'],
  })
  expect(deferred.placeGeometryOverride).toBeUndefined()
  expect(deferred.entry).toBeUndefined()
  expect(review.tier).toBe('review')
  expect(deferPlaceAddressTrialReview(deferred, true)).toBe(deferred)
  const direct = { ...review, tier: 'direct' as const, addressId: 'known' }
  expect(deferPlaceAddressTrialReview(direct, true)).toBe(direct)
})
