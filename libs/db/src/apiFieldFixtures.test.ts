import { describe, expect, test } from 'bun:test'

import { listApiFieldFixtures, resolveApiFieldFixture } from './apiFieldFixtures'

const overtureSourceSchemas = {
  'ds-hk-overture-division': '1.17.0',
  'ds-hk-overture-division-area': '1.17.0',
  'ds-hk-overture-division-boundary': '1.17.0',
  'ds-hk-hkgov-had-division-area-district': '1.2',
  'ds-hk-hkgov-censtatd-division-area-district': '1.0',
}

describe('api field fixtures', () => {
  test('loads only domain-scoped fixtures with explicit lineage anchors', () => {
    const fixtures = listApiFieldFixtures()

    expect(fixtures).toHaveLength(6)
    for (const fixture of fixtures) {
      expect(fixture.domainCode).not.toBe('')
      expect(fixture.lineageAnchors.length).toBeGreaterThan(0)
    }
  })

  test('requires an exact source-schema signature', () => {
    expect(
      resolveApiFieldFixture({
        apiVersion: 'api-divisions-v0.1',
        domainCode: 'overture',
        lineageSnapshotVersions: ['ss-hk-division-2025-09-24.0'],
        schemaVersion: 'sv-division-v1',
        rulesetVersion: 'rs-division-merge-v1',
        sourceSchemas: {
          'ds-hk-overture-division': '1.12.0',
          'ds-hk-overture-division-area': '1.12.0',
          'ds-hk-overture-division-boundary': '1.11.0',
          'ds-hk-hkgov-had-division-area-district': '1.2',
        },
      }),
    ).toBeNull()
  })

  test('selects the mapping for a complete required release set', () => {
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      domainCode: 'overture',
      lineageSnapshotVersions: [
        'ss-hk-division-2025-09-24.0',
        'ss-hk-division-2025-10-22.0',
      ],
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: {
        'ds-hk-overture-division': '1.13.0',
        'ds-hk-overture-division-area': '1.13.0',
        'ds-hk-overture-division-boundary': '1.13.0',
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-area-district': '1.0',
      },
    })

    expect(fixture?.fields).toContainEqual(
      expect.objectContaining({
        sourceDatasetCode: 'ds-hk-hkgov-censtatd-division-area-district',
      }),
    )
  })

  test('keeps the Overture 1.15 mapping across the 2025 to 2026 boundary', () => {
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      domainCode: 'overture',
      lineageSnapshotVersions: ['ss-hk-division-2026-01-21.0'],
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: {
        'ds-hk-overture-division': '1.15.0',
        'ds-hk-overture-division-area': '1.15.0',
        'ds-hk-overture-division-boundary': '1.15.0',
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-area-district': '1.0',
      },
    })

    expect(fixture?.lineageAnchors).toContainEqual(
      expect.objectContaining({
        snapshotVersion: 'ss-hk-division-2026-01-21.0',
      }),
    )
  })

  test('keeps Overture mappings across every monthly 2026 release cohort', () => {
    const cohorts = [
      { snapshotVersion: 'ss-hk-division-2026-03-18.0', version: '1.16.0' },
      { snapshotVersion: 'ss-hk-division-2026-04-15.0', version: '1.16.0' },
      { snapshotVersion: 'ss-hk-division-2026-06-17.0', version: '1.17.0' },
    ]

    for (const cohort of cohorts) {
      const fixture = resolveApiFieldFixture({
        apiVersion: 'api-divisions-v0.1',
        domainCode: 'overture',
        lineageSnapshotVersions: [cohort.snapshotVersion],
        schemaVersion: 'sv-division-v1',
        rulesetVersion: 'rs-division-merge-v1',
        sourceSchemas: {
          'ds-hk-overture-division': cohort.version,
          'ds-hk-overture-division-area': cohort.version,
          'ds-hk-overture-division-boundary': cohort.version,
          'ds-hk-hkgov-had-division-area-district': '1.2',
          'ds-hk-hkgov-censtatd-division-area-district': '1.0',
        },
      })

      expect(fixture?.lineageAnchors).toContainEqual(
        expect.objectContaining({ snapshotVersion: cohort.snapshotVersion }),
      )
    }
  })

  test('resolves Planning Department mappings with their shared division datasets', () => {
    const fixtures = [
      {
        domainCode: 'hkgov-pland-pu',
        snapshotVersion: 'ss-hk-division-hkgov-pland-pu-2001',
        sourceDatasetCode: 'ds-hk-hkgov-pland-division-pu',
        sourceSchemaVersion: '1.0',
      },
      {
        domainCode: 'hkgov-pland-pu',
        snapshotVersion: 'ss-hk-division-hkgov-pland-pu-2021',
        sourceDatasetCode: 'ds-hk-hkgov-pland-division-pu',
        sourceSchemaVersion: '2.0',
      },
      {
        domainCode: 'hkgov-pland-new-town',
        snapshotVersion: 'ss-hk-division-hkgov-pland-new-town-2006',
        sourceDatasetCode: 'ds-hk-hkgov-pland-division-new-town',
        sourceSchemaVersion: '1.0',
      },
      {
        domainCode: 'hkgov-pland-new-town',
        snapshotVersion: 'ss-hk-division-hkgov-pland-new-town-2011',
        sourceDatasetCode: 'ds-hk-hkgov-pland-division-new-town',
        sourceSchemaVersion: '1.0',
      },
      {
        domainCode: 'hkgov-pland-new-town',
        snapshotVersion: 'ss-hk-division-hkgov-pland-new-town-2016',
        sourceDatasetCode: 'ds-hk-hkgov-pland-division-new-town',
        sourceSchemaVersion: '1.0',
      },
      {
        domainCode: 'hkgov-pland-new-town',
        snapshotVersion: 'ss-hk-division-hkgov-pland-new-town-2021',
        sourceDatasetCode: 'ds-hk-hkgov-pland-division-new-town',
        sourceSchemaVersion: '1.0',
      },
    ]

    for (const fixture of fixtures) {
      const resolved = resolveApiFieldFixture({
        apiVersion: 'api-divisions-v0.1',
        domainCode: fixture.domainCode,
        lineageSnapshotVersions: [fixture.snapshotVersion],
        schemaVersion: 'sv-division-v1',
        rulesetVersion: `rs-division-${fixture.domainCode}-merge-v1`,
        sourceSchemas: {
          [fixture.sourceDatasetCode]: fixture.sourceSchemaVersion,
        },
      })

      expect(resolved).not.toBeNull()
      expect(resolved?.fields).toContainEqual(
        expect.objectContaining({
          apiField: 'divisionArea.id',
          sourceDatasetCode: fixture.sourceDatasetCode,
        }),
      )
    }
  })

  test('selects the closest matching ancestor, not the highest snapshot code', () => {
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      domainCode: 'overture',
      lineageSnapshotVersions: [
        'ss-hk-division-2025-09-24.0',
        'ss-hk-division-2025-10-22.0',
        'ss-hk-division-2025-11-19.0',
        'ss-hk-division-2025-12-17.0',
        'ss-hk-division-2026-02-18.0',
        'ss-hk-division-2026-05-20.0',
        'ss-hk-division-2026-06-17.0',
      ],
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: overtureSourceSchemas,
    })

    expect(fixture?.lineageAnchors).toContainEqual(
      expect.objectContaining({
        snapshotVersion: 'ss-hk-division-2026-05-20.0',
      }),
    )
  })

  test('resolves the current Overture 1.18 release anchor', () => {
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      domainCode: 'overture',
      lineageSnapshotVersions: [
        'ss-hk-division-2025-09-24.0',
        'ss-hk-division-2025-10-22.0',
        'ss-hk-division-2025-11-19.0',
        'ss-hk-division-2025-12-17.0',
        'ss-hk-division-2026-01-21.0',
        'ss-hk-division-2026-02-18.0',
        'ss-hk-division-2026-03-18.0',
        'ss-hk-division-2026-04-15.0',
        'ss-hk-division-2026-05-20.0',
        'ss-hk-division-2026-06-17.0',
        'ss-hk-division-2026-07-22.0',
      ],
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: {
        'ds-hk-overture-division': '1.18.0',
        'ds-hk-overture-division-area': '1.18.0',
        'ds-hk-overture-division-boundary': '1.18.0',
        'ds-hk-hkgov-had-division-area-district': '1.2',
        'ds-hk-hkgov-censtatd-division-area-district': '1.0',
      },
    })

    expect(fixture?.lineageAnchors).toContainEqual(
      expect.objectContaining({
        snapshotVersion: 'ss-hk-division-2026-07-22.0',
      }),
    )
  })

  test('does not infer a newer branch mapping for an unanchored backfill', () => {
    const currentSourceSchemas = {
      'ds-hk-hkgov-dpo-address': '3.2',
      'ds-hk-overture-division': '1.17.0',
    }
    const historicalSourceSchemas = {
      'ds-hk-hkgov-dpo-address': '3.2',
      'ds-hk-overture-division': '1.12.0',
    }

    expect(
      resolveApiFieldFixture({
        apiVersion: 'api-addresses-v0.1',
        domainCode: 'default',
        lineageSnapshotVersions: ['ss-hk-address-2025-08-20.0'],
        schemaVersion: 'sv-address-v1',
        rulesetVersion: 'rs-address-merge-v1',
        sourceSchemas: currentSourceSchemas,
      }),
    ).toBeNull()

    expect(
      resolveApiFieldFixture({
        apiVersion: 'api-addresses-v0.1',
        domainCode: 'default',
        lineageSnapshotVersions: ['ss-hk-address-2025-09-24.0'],
        schemaVersion: 'sv-address-v1',
        rulesetVersion: 'rs-address-merge-v1',
        sourceSchemas: historicalSourceSchemas,
      })?.lineageAnchors,
    ).toContainEqual(
      expect.objectContaining({
        snapshotVersion: 'ss-hk-address-2025-09-24.0',
        sourceSchemas: {
          'ds-hk-hkgov-dpo-address': '3.2',
          'ds-hk-overture-division': '1.12.0',
        },
      }),
    )
  })

  test('selects the explicitly anchored earliest address backfill', () => {
    expect(
      resolveApiFieldFixture({
        apiVersion: 'api-addresses-v0.1',
        domainCode: 'default',
        lineageSnapshotVersions: ['ss-hk-address-2025-01-23.0'],
        schemaVersion: 'sv-address-v1',
        rulesetVersion: 'rs-address-merge-v1',
        sourceSchemas: {
          'ds-hk-hkgov-dpo-address': '3.2',
          'ds-hk-overture-division': '1.12.0',
        },
      })?.lineageAnchors,
    ).toContainEqual(
      expect.objectContaining({
        snapshotVersion: 'ss-hk-address-2025-01-23.0',
      }),
    )
  })

  test('maps every supported ALS release to its selected Overture division schema', () => {
    const expectedDivisionSchemas = {
      'ss-hk-address-2025-01-23.0': '1.12.0',
      'ss-hk-address-2025-02-25.0': '1.12.0',
      'ss-hk-address-2025-03-21.0': '1.12.0',
      'ss-hk-address-2025-04-26.0': '1.12.0',
      'ss-hk-address-2025-05-22.0': '1.12.0',
      'ss-hk-address-2025-06-20.0': '1.12.0',
      'ss-hk-address-2025-08-13.0': '1.12.0',
      'ss-hk-address-2025-09-03.0': '1.12.0',
      'ss-hk-address-2025-11-04.0': '1.13.0',
      'ss-hk-address-2025-12-16.0': '1.14.0',
      'ss-hk-address-2026-02-04.0': '1.15.0',
      'ss-hk-address-2026-04-03.0': '1.16.0',
      'ss-hk-address-2026-04-22.0': '1.16.0',
      'ss-hk-address-2026-04-25.0': '1.16.0',
      'ss-hk-address-2026-07-08.0': '1.17.0',
      'ss-hk-address-2026-07-10.0': '1.17.0',
    }

    for (const [snapshotVersion, divisionSchemaVersion] of Object.entries(
      expectedDivisionSchemas,
    )) {
      expect(
        resolveApiFieldFixture({
          apiVersion: 'api-addresses-v0.1',
          domainCode: 'default',
          lineageSnapshotVersions: [snapshotVersion],
          schemaVersion: 'sv-address-v1',
          rulesetVersion: 'rs-address-merge-v1',
          sourceSchemas: {
            'ds-hk-hkgov-dpo-address': '3.2',
            'ds-hk-overture-division': divisionSchemaVersion,
          },
        })?.lineageAnchors,
      ).toContainEqual(
        expect.objectContaining({
          snapshotVersion,
          sourceSchemas: {
            'ds-hk-hkgov-dpo-address': '3.2',
            'ds-hk-overture-division': divisionSchemaVersion,
          },
        }),
      )
    }
  })

  test('returns defensive copies from the fixture registry', () => {
    const fixtures = listApiFieldFixtures()
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      domainCode: 'overture',
      lineageSnapshotVersions: [
        'ss-hk-division-2026-05-20.0',
        'ss-hk-division-2026-06-17.0',
      ],
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: overtureSourceSchemas,
    })
    const listedFixture = fixtures.at(0)
    if (!listedFixture || !fixture) throw new Error('Expected matching fixture')
    const listedField = listedFixture.fields.at(0)
    const resolvedField = fixture.fields.at(0)
    const listedAnchor = listedFixture.lineageAnchors.at(0)
    const resolvedAnchor = fixture.lineageAnchors.at(0)
    if (!listedField || !resolvedField || !listedAnchor || !resolvedAnchor) {
      throw new Error('Expected fixture fields and anchors')
    }

    listedFixture.apiVersion = 'mutated'
    listedAnchor.snapshotVersion = 'mutated'
    listedField.apiField = 'mutated'
    fixture.apiVersion = 'mutated'
    resolvedAnchor.snapshotVersion = 'mutated'
    resolvedField.apiField = 'mutated'

    expect(listApiFieldFixtures()[0]?.apiVersion).toBe('api-divisions-v0.1')
    expect(listApiFieldFixtures()[0]?.lineageAnchors[0]?.snapshotVersion).toBe(
      'ss-hk-division-2025-09-24.0',
    )
    expect(listApiFieldFixtures()[0]?.fields[0]?.apiField).not.toBe('mutated')
  })
})
