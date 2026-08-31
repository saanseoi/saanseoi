import { describe, expect, test } from 'bun:test'

import {
  buildDataReleaseSetCode,
  buildDeterministicUuidV5,
  buildSnapshotLineageCode,
  buildSnapshotVersionCode,
  cohortKeyEffectiveFrom,
  computeVersionHash,
} from './versioning'

describe('snapshot identifiers', () => {
  test('qualifies non-default lineage codes with their variant', () => {
    expect(buildSnapshotLineageCode('ds-hk-overture-division', 'division')).toBe(
      'sl-ds-hk-overture-division',
    )
    expect(
      buildSnapshotLineageCode(
        'ds-hk-hkgov-censtatd-division-area-district',
        'divisionArea',
        'hkgov-censtatd:2016',
      ),
    ).toBe('sl-ds-hk-hkgov-censtatd-division-area-district-hkgov-censtatd-2016')
  })

  test('qualifies a resource type omitted from a shared dataset code', () => {
    expect(
      buildSnapshotLineageCode(
        'ds-hk-hkgov-pland-division-pu',
        'divisionArea',
        'hkgov-pland-pu',
      ),
    ).toBe('sl-ds-hk-hkgov-pland-division-pu-division-area')
  })

  test('distinguishes geography from a shared division-statistic dataset', () => {
    expect(
      buildSnapshotLineageCode(
        'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
        'division',
        'hkgov-censtatd-hma',
      ),
    ).toBe(
      'sl-ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups-division',
    )
  })

  test('uses the source variant rather than a full dataset code in snapshot codes', () => {
    expect(buildSnapshotVersionCode('hk', 'division', '2006', 'hkgov-pland-pu')).toBe(
      'ss-hk-division-hkgov-pland-pu-2006',
    )
  })

  test('normalises resource and variant segments in snapshot codes', () => {
    expect(
      buildSnapshotVersionCode('hk', 'divisionArea', '2006', 'hkgov-pland-new-town'),
    ).toBe('ss-hk-division-area-hkgov-pland-new-town-2006')
  })

  test('normalises structured C&SD geometry variants in snapshot codes', () => {
    expect(
      buildSnapshotVersionCode('hk', 'divisionArea', '2021', 'hkgov-censtatd:2021'),
    ).toBe('ss-hk-division-area-hkgov-censtatd-2021-2021')
    expect(
      buildSnapshotVersionCode(
        'hk',
        'divisionArea',
        '2016',
        'hkgov-censtatd:2016:simplified',
      ),
    ).toBe('ss-hk-division-area-hkgov-censtatd-2016-simplified-2016')
  })

  test('keeps exact period identity out of safe snapshot code segments', () => {
    expect(
      buildSnapshotVersionCode(
        'hk',
        'divisionStatistic',
        '2024/25',
        'official-statistics',
      ),
    ).toBe('ss-hk-division-statistic-official-statistics-2024-25')
  })
})

describe('API release-set identifiers', () => {
  test('infers the initial cohort revision from an unadorned code', () => {
    expect(buildDataReleaseSetCode('hk', 'divisions', '2025-09-24.0')).toBe(
      'data-hk-divisions-2025-09-24.0',
    )
  })

  test('labels the immutable cohort revision explicitly', () => {
    expect(buildDataReleaseSetCode('hk', 'divisions', '2025-09-24.0', 2)).toBe(
      'data-hk-divisions-2025-09-24.0-r2',
    )
  })

  test('omits the initial revision for Statistics release sets', () => {
    expect(buildDataReleaseSetCode('hk', 'stats', '2021')).toBe('data-hk-stats-2021')
  })

  test('normalises an exact spanning period only in the generated code', () => {
    expect(buildDataReleaseSetCode('hk', 'stats', '2024/25')).toBe(
      'data-hk-stats-2024-25',
    )
    expect(cohortKeyEffectiveFrom('2024/25')).toBe('2025-01-01T00:00:00.000Z')
    expect(cohortKeyEffectiveFrom('2016-2021')).toBe('2021-01-01T00:00:00.000Z')
    expect(cohortKeyEffectiveFrom('2023-Q3')).toBe('2023-07-01T00:00:00.000Z')
    expect(cohortKeyEffectiveFrom('2024-H2')).toBe('2024-07-01T00:00:00.000Z')
  })
})

describe('computeVersionHash', () => {
  test('ignores versionHash fields when hashing plain JSON objects', () => {
    expect(
      computeVersionHash({
        code: 'api-divisions-v0.1',
        versionHash: 'sha256:stale',
      }),
    ).toBe(
      computeVersionHash({
        code: 'api-divisions-v0.1',
      }),
    )
  })

  test('rejects non-plain objects', () => {
    expect(() =>
      computeVersionHash({ createdAt: new Date('2026-06-29T00:00:00.000Z') }),
    ).toThrow('plain JSON objects')
  })
})

describe('buildDeterministicUuidV5', () => {
  test('returns the same UUID for the same namespace and name', () => {
    const namespace = '9b90fd4f-96d3-48b9-9b88-cc101b3667f7'

    expect(buildDeterministicUuidV5(namespace, 'overture-hk-division')).toBe(
      buildDeterministicUuidV5(namespace, 'overture-hk-division'),
    )
    expect(buildDeterministicUuidV5(namespace, 'overture-hk-division')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })
})
