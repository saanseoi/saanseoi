import { describe, expect, test } from 'bun:test'

import { listApiFieldFixtures, resolveApiFieldFixture } from './apiFieldFixtures'

describe('api field fixtures', () => {
  test('loads bundled fixture definitions', () => {
    const fixtures = listApiFieldFixtures()

    expect(fixtures.length).toBe(6)
    expect(fixtures[0]?.apiVersion).toBe('api-divisions-v0.1')
    expect(fixtures[0]?.sourceSchemas).toEqual({
      'ds-hk-overture-division': '1.12.0',
      'ds-hk-overture-division-area': '1.12.0',
      'ds-hk-overture-division-boundary': '1.12.0',
      'ds-hk-hkgov-had-division-area-district': '1.2',
    })

    expect(
      resolveApiFieldFixture({
        apiVersion: 'api-divisions-v0.1',
        snapshotVersion: 'ss-hk-division-2025-09-24.0',
        schemaVersion: 'sv-division-v1',
        rulesetVersion: 'rs-division-merge-v1',
        sourceSchemas: {
          'ds-hk-overture-division': '1.12.0',
          'ds-hk-overture-division-area': '1.12.0',
          'ds-hk-overture-division-boundary': '1.12.0',
          'ds-hk-hkgov-had-division-area-district': '1.2',
        },
      })?.validFromSnapshotVersion,
    ).toBe('ss-hk-division-2025-09-24.0')
  })

  test('forward-fills every division fixture with the baseline API fields', () => {
    const [baseline, ...fixtures] = listApiFieldFixtures()

    if (!baseline) {
      throw new Error('Expected a baseline API field fixture')
    }

    const fieldKey = (field: (typeof baseline.fields)[number]) =>
      JSON.stringify([
        field.apiField,
        field.variant ?? null,
        field.sourceDatasetCode,
        field.sourceFieldPath,
        field.resolverCode,
        field.contributionType,
      ])
    const baselineFieldKeys = baseline.fields.map(fieldKey)
    const baselineSourceSchemaKeys = Object.keys(baseline.sourceSchemas).sort()

    for (const fixture of fixtures) {
      expect(Object.keys(fixture.sourceSchemas).sort()).toEqual(
        baselineSourceSchemaKeys,
      )

      const fixtureFieldKeys = new Set(fixture.fields.map(fieldKey))
      for (const baselineFieldKey of baselineFieldKeys) {
        expect(fixtureFieldKeys.has(baselineFieldKey)).toBe(true)
      }
    }
  })

  test('returns defensive copies from the fixture registry', () => {
    const fixtures = listApiFieldFixtures()
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      snapshotVersion: 'ss-hk-division-2026-06-17.0',
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: {
        'ds-hk-overture-division': '1.17.0',
        'ds-hk-overture-division-area': '1.17.0',
        'ds-hk-overture-division-boundary': '1.17.0',
        'ds-hk-hkgov-had-division-area-district': '1.2',
      },
    })

    const listedFixture = fixtures.at(0)
    if (!listedFixture) {
      throw new Error('Expected at least one API field fixture')
    }
    const listedField = listedFixture.fields.at(0)
    if (!listedField) {
      throw new Error('Expected listed API field fixture to include fields')
    }

    listedFixture.apiVersion = 'mutated'
    listedField.apiField = 'mutated'

    expect(fixture).not.toBeNull()
    if (!fixture) {
      throw new Error('Expected matching API field fixture')
    }
    const resolvedField = fixture.fields.at(0)
    if (!resolvedField) {
      throw new Error('Expected resolved API field fixture to include fields')
    }

    fixture.apiVersion = 'mutated'
    resolvedField.apiField = 'mutated'

    expect(listApiFieldFixtures()[0]?.apiVersion).toBe('api-divisions-v0.1')
    expect(listApiFieldFixtures()[0]?.fields[0]?.apiField).not.toBe('mutated')
    expect(
      resolveApiFieldFixture({
        apiVersion: 'api-divisions-v0.1',
        snapshotVersion: 'ss-hk-division-2026-06-17.0',
        schemaVersion: 'sv-division-v1',
        rulesetVersion: 'rs-division-merge-v1',
        sourceSchemas: {
          'ds-hk-overture-division': '1.17.0',
          'ds-hk-overture-division-area': '1.17.0',
          'ds-hk-overture-division-boundary': '1.17.0',
          'ds-hk-hkgov-had-division-area-district': '1.2',
        },
      })?.fields[0]?.apiField,
    ).not.toBe('mutated')
  })

  test('reuses the latest compatible fixture for later snapshot versions', () => {
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      snapshotVersion: 'ss-hk-division-2026-06-17.0',
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: {
        'ds-hk-overture-division': '1.17.0',
        'ds-hk-overture-division-area': '1.17.0',
        'ds-hk-overture-division-boundary': '1.17.0',
        'ds-hk-hkgov-had-division-area-district': '1.2',
      },
    })

    expect(fixture?.validFromSnapshotVersion).toBe('ss-hk-division-2026-05-20.0')
  })

  test('rejects fixtures when source schema mappings differ', () => {
    const fixture = resolveApiFieldFixture({
      apiVersion: 'api-divisions-v0.1',
      snapshotVersion: 'ss-hk-division-2026-06-17.0',
      schemaVersion: 'sv-division-v1',
      rulesetVersion: 'rs-division-merge-v1',
      sourceSchemas: {
        'ds-hk-overture-division': '1.18.0',
        'ds-hk-overture-division-area': '1.17.0',
        'ds-hk-overture-division-boundary': '1.17.0',
        'ds-hk-hkgov-had-division-area-district': '1.2',
      },
    })

    expect(fixture).toBeNull()
  })
})
