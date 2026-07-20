import { describe, expect, test } from 'bun:test'

import {
  buildDataReleaseSetCode,
  buildDeterministicUuidV5,
  buildSnapshotLineageCode,
  buildSnapshotVersionCode,
  computeVersionHash,
} from './versioning'

describe('snapshot identifiers', () => {
  test('anchors a lineage code to its primary dataset without repeating scope', () => {
    expect(buildSnapshotLineageCode('ds-hk-overture-division')).toBe(
      'sl-ds-hk-overture-division',
    )
  })

  test('uses the source variant rather than a full dataset code in snapshot codes', () => {
    expect(buildSnapshotVersionCode('hk', 'division', '2006', 'hkgov-pland-pu')).toBe(
      'ss-hk-division-hkgov-pland-pu-2006',
    )
  })

  test('normalizes resource and variant segments in snapshot codes', () => {
    expect(
      buildSnapshotVersionCode('hk', 'divisionArea', '2006', 'hkgov-pland-new-town'),
    ).toBe('ss-hk-division-area-hkgov-pland-new-town-2006')
  })

  test('normalizes structured C&SD geometry variants in snapshot codes', () => {
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
})

describe('API release-set identifiers', () => {
  test('labels the immutable cohort revision explicitly', () => {
    expect(buildDataReleaseSetCode('hk', 'divisions', '2025-09-24.0', 2)).toBe(
      'data-hk-divisions-2025-09-24.0-r2',
    )
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
