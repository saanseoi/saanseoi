import { describe, expect, test } from 'bun:test'

import { getReleaseCodeParts, getReleaseVersionLabel } from './releaseCode'

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

  test('extracts quarterly and half-yearly versions', () => {
    expect(getReleaseCodeParts('data-hk-stats-2023-q3', 'stats')).toEqual({
      family: 'data-hk-stats',
      version: '2023-q3',
    })
    expect(getReleaseCodeParts('data-hk-stats-2023-h2-r1', 'stats')).toEqual({
      family: 'data-hk-stats',
      version: '2023-h2-r1',
    })
    expect(getReleaseVersionLabel('data-hk-stats-2023-q3', 'stats')).toBe("v2023'Q3")
    expect(getReleaseVersionLabel("data-hk-stats-2023'Q3", 'stats')).toBe("v2023'Q3")
    expect(getReleaseVersionLabel("data-hk-stats-2023'H1-R2", 'stats')).toBe(
      "v2023'H1-R2",
    )
    expect(getReleaseVersionLabel('data-hk-stats-2023-q3-r0', 'stats')).toBe("v2023'Q3")
  })

  test('labels a release set with its concise version', () => {
    expect(getReleaseVersionLabel('data-hk-divisions-2025-09-24.0', 'divisions')).toBe(
      'v2025-09-24.0',
    )
    expect(getReleaseVersionLabel('data-hk-stats-2021-r0', 'stats')).toBe('v2021')
  })
})
