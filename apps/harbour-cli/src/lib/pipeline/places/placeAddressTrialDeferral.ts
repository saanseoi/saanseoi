import type { StagedAddressResolution } from './supplementaryPlaceAddress'

/** Explicit, invocation-scoped permission; never enabled by --yes or persisted as curation. */
export function permitsPlaceAddressTrialDeferral(
  scope: string | undefined,
  environment: string,
  sourceVersion: string,
) {
  return (scope ?? '')
    .split(',')
    .map(value => value.trim())
    .includes(`${environment}:${sourceVersion}`)
}

export function deferPlaceAddressTrialReview(
  resolution: StagedAddressResolution,
  enabled: boolean,
): StagedAddressResolution {
  if (!enabled || resolution.tier !== 'review') return resolution
  return {
    ...resolution,
    tier: 'delayed',
    addressId: null,
    entry: undefined,
    placeGeometryOverride: undefined,
    trialDeferral: {
      originalReason: resolution.reason,
      authority:
        'Explicit release-scoped trial instruction: retain the Place without an Address link; defer identity review until adequate ALS coverage is available.',
    },
    reason: 'trial_address_review_deferred',
  }
}
