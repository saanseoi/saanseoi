import type { StagedAddressResolution } from './supplementaryPlaceAddress'

export function deferPlaceAddressReview(
  resolution: StagedAddressResolution,
): StagedAddressResolution {
  if (resolution.tier !== 'review') return resolution
  return {
    ...resolution,
    tier: 'delayed',
    addressId: null,
    entry: undefined,
    placeGeometryOverride: undefined,
    reviewDeferral: {
      reviewStatus: 'unreviewed',
      originalReason: resolution.reason,
      authority:
        'Deferred ingestion review: retain the Place without an Address link until identity review.',
    },
    reason: 'address_review_deferred',
  }
}
