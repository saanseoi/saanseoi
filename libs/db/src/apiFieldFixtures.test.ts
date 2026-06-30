import { describe, expect, test } from 'bun:test'

import { listApiFieldFixtures, resolveApiFieldFixture } from './apiFieldFixtures'

describe('api field fixtures', () => {
  test('loads bundled fixture definitions', () => {
    const fixtures = listApiFieldFixtures()

    expect(fixtures.length).toBe(6)
    expect(fixtures[0]?.apiVersion).toBe('api-divisions-v0.1')
    expect(fixtures[0]?.sourceSchemas).toEqual({
      'ds-hk-overture-division': '1.12.0',
    })
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
      },
    })

    fixtures[0]!.apiVersion = 'mutated'
    fixtures[0]!.fields[0]!.apiField = 'mutated'

    expect(fixture).not.toBeNull()
    fixture!.apiVersion = 'mutated'
    fixture!.fields[0]!.apiField = 'mutated'

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
      },
    })

    expect(fixture).toBeNull()
  })
})
