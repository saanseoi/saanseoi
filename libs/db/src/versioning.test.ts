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
  test('curated assembly has a separate lineage from its native source', () => {
    expect(
      buildSnapshotLineageCode('ds-hk-overture-division', 'division', 'saanseoi'),
    ).toBe('sl-hk-overture-division-saanseoi')
  })
  test('qualifies non-default lineage codes with their variant', () => {
    expect(buildSnapshotLineageCode('ds-hk-overture-division', 'division')).toBe(
      'sl-hk-overture-division',
    )
    expect(
      buildSnapshotLineageCode(
        'ds-hk-hkgov-censtatd-division-area-district',
        'divisionArea',
        'hkgov-censtatd:2016',
      ),
    ).toBe('sl-hk-hkgov-censtatd-division-area-district-2016')
  })

  test('qualifies a resource type omitted from a shared dataset code', () => {
    expect(
      buildSnapshotLineageCode(
        'ds-hk-hkgov-pland-division-pu',
        'divisionArea',
        'hkgov-pland-pu',
      ),
    ).toBe('sl-hk-hkgov-pland-division-pu-area')
  })

  test('distinguishes geography from a shared division-statistic dataset', () => {
    expect(
      buildSnapshotLineageCode(
        'ds-hk-hkgov-censtatd-housing-market-areas-building-groups',
        'division',
        'hkgov-censtatd-hma',
      ),
    ).toBe('sl-hk-hkgov-censtatd-housing-market-areas-building-groups-division')
  })

  test('keeps resource streams and geometry variants distinct without repeating the source', () => {
    const dataset = 'ds-hk-hkgov-censtatd-subdivided-units-district'
    const cases = [
      ['divisionStatistic', 'official-statistics', 'stats'],
      ['division', 'hkgov-censtatd', 'division'],
      ['divisionArea', 'hkgov-censtatd', 'area'],
      ['divisionBoundary', 'hkgov-censtatd', 'boundary'],
      ['divisionArea', 'hkgov-censtatd:simplified', 'area-simplified'],
      [
        'divisionArea',
        'hkgov-censtatd-landclipped:simplified',
        'area-landclipped-simplified',
      ],
    ] as const
    const codes = cases.map(([resource, variant, suffix]) => {
      const code = buildSnapshotLineageCode(dataset, resource, variant)
      expect(code).toBe(`sl-hk-hkgov-censtatd-subdivided-units-district-${suffix}`)
      return code
    })
    expect(new Set(codes).size).toBe(cases.length)
    expect(
      buildSnapshotLineageCode(
        'ds-hk-hkgov-pland-division-pu',
        'divisionArea',
        'hkgov-pland-pu:simplified',
      ),
    ).toBe('sl-hk-hkgov-pland-division-pu-area-simplified')
  })

  test('derives snapshot codes from their lineage without repeating dataset prefixes', () => {
    const lineage = buildSnapshotLineageCode(
      'ds-hk-hkgov-censtatd-population-households-district',
      'divisionStatistic',
      'ds-hk-hkgov-censtatd-population-households-district',
    )
    expect(buildSnapshotVersionCode(lineage, '2021')).toBe(
      'ss-hk-hkgov-censtatd-population-households-district-stats-2021',
    )
    expect(buildSnapshotVersionCode('sl-hk-overture-division', '2026-09-23.0', 1)).toBe(
      'ss-hk-overture-division-2026-09-23.0-r1',
    )
  })

  test('keeps geometry variants and datasets distinct within the same cohort', () => {
    const lineages = [
      'sl-hk-hkgov-pland-division-pu-area',
      'sl-hk-hkgov-pland-division-pu-area-simplified',
      'sl-hk-hkgov-censtatd-permanent-living-quarters-area-simplified',
      'sl-hk-hkgov-censtatd-subdivided-units-district-area-simplified',
    ]
    const codes = lineages.map(lineage => buildSnapshotVersionCode(lineage, '2021'))
    expect(new Set(codes).size).toBe(lineages.length)
    expect(codes[1]).toBe('ss-hk-hkgov-pland-division-pu-area-simplified-2021')
  })

  test('normalises spanning periods and validates lineage and revision inputs', () => {
    expect(buildSnapshotVersionCode('sl-hk-example-stats', '2024/25')).toBe(
      'ss-hk-example-stats-2024-25',
    )
    expect(() => buildSnapshotVersionCode('ds-hk-example', '2021')).toThrow(
      'sl- prefix',
    )
    for (const revision of [-1, 0.5, Number.NaN]) {
      expect(() =>
        buildSnapshotVersionCode('sl-hk-example-stats', '2021', revision),
      ).toThrow('Invalid snapshot revision')
    }
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
