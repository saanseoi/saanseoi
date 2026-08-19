import { describe, expect, test } from 'bun:test'

import {
  compareApiReleaseVersions,
  getVisibleApiReleaseVersions,
} from './apiReleaseVersions'

const versions = [
  {
    code: '2025-09-24.0',
    cohortKey: '2025-09-24.0',
    href: '/',
    label: 'v2025-09-24.0',
  },
  {
    code: '2025-10-22.0-r2',
    cohortKey: '2025-10-22.0',
    href: '/',
    label: 'v2025-10-22.0-r2',
  },
  {
    code: '2025-10-22.0',
    cohortKey: '2025-10-22.0',
    href: '/',
    label: 'v2025-10-22.0',
  },
  {
    code: '2026-02-18.0-r1',
    cohortKey: '2026-02-18.0',
    href: '/',
    label: 'v2026-02-18.0-r1',
  },
]

describe('API release versions', () => {
  test('sorts versions in reverse alphanumeric order', () => {
    expect(
      [...versions].sort(compareApiReleaseVersions).map(version => version.label),
    ).toEqual([
      'v2026-02-18.0-r1',
      'v2025-10-22.0-r2',
      'v2025-10-22.0',
      'v2025-09-24.0',
    ])
  })

  test('shows only the newest revision for each cohort by default', () => {
    expect(
      getVisibleApiReleaseVersions(versions, false).map(version => version.label),
    ).toEqual(['v2026-02-18.0-r1', 'v2025-10-22.0-r2', 'v2025-09-24.0'])
  })

  test('can show every revision', () => {
    expect(getVisibleApiReleaseVersions(versions, true)).toHaveLength(4)
  })

  test('keeps a directly selected older revision visible', () => {
    expect(
      getVisibleApiReleaseVersions(versions, false, '2025-10-22.0').map(
        version => version.label,
      ),
    ).toEqual([
      'v2026-02-18.0-r1',
      'v2025-10-22.0-r2',
      'v2025-10-22.0',
      'v2025-09-24.0',
    ])
  })

  test('does not show an older base release after its selected revision', () => {
    expect(
      getVisibleApiReleaseVersions(versions, false, '2025-10-22.0-r2').map(
        version => version.label,
      ),
    ).toEqual(['v2026-02-18.0-r1', 'v2025-10-22.0-r2', 'v2025-09-24.0'])
  })
})
