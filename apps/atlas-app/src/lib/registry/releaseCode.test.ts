import { describe, expect, test } from 'bun:test'

import { getReleaseCodeParts } from './releaseCode'

describe('getReleaseCodeParts', () => {
  test('extracts the version before a domain slug', () => {
    expect(
      getReleaseCodeParts('data-hk-divisions-2021--hkgov-pland-pu', 'divisions'),
    ).toEqual({ family: 'data-hk-divisions', version: '2021' })
  })

  test('preserves a release revision in the version', () => {
    expect(
      getReleaseCodeParts(
        'data-hk-divisions-2006-r1--hkgov-pland-new-town',
        'divisions',
      ),
    ).toEqual({ family: 'data-hk-divisions', version: '2006-r1' })
  })

  test('keeps existing non-domain release codes working', () => {
    expect(getReleaseCodeParts('data-hk-divisions-2025-09-24.0', 'divisions')).toEqual({
      family: 'data-hk-divisions',
      version: '2025-09-24.0',
    })
  })
})
