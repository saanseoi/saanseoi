import { expect, test } from 'bun:test'
import type { DivisionHierarchies, DivisionHierarchyEntry } from '@repo/db'
import { DivisionHierarchiesSchema } from '../schema/divisions'
import { division } from './geocoding.fixtures'
import {
  buildDivisionRouteState,
  createDivisionResource,
  createIncludedDivisionResource,
} from './divisionsPresentation'

test('public division hierarchies retain containment flags without leaking or mutating evidence', () => {
  const entries: DivisionHierarchyEntry[] = [true, false, null, undefined].map(
    full_containment => ({
      id: 'ancestor',
      name: 'Ancestor',
      class: 'district',
      ...(full_containment !== undefined ? { full_containment } : {}),
      containment_geometry: { division: 'sha256:child', ancestor: 'sha256:parent' },
    }),
  )
  const hierarchies: DivisionHierarchies = {
    administrative: [entries],
    locality: [entries],
    landform: [entries],
    full: [entries, [entries[0]!]],
  }
  const record = division('child', 'administrative', hierarchies)
  record.i18n.en = {
    name: 'Child',
    nameVariant: ['Child', 'Alias'],
    nameAlts: ['Alias'],
    nameRules: [{ value: 'Alias', variant: 'alternate' }],
  }
  const original = structuredClone(record)
  const expected = entries.map(
    ({ containment_geometry, full_containment, ...entry }) => ({
      ...entry,
      ...(full_containment !== undefined ? { fullContainment: full_containment } : {}),
    }),
  )

  for (const version of ['0.1', '0.2'] as const) {
    for (const profile of ['compact', 'default', 'map', 'full'] as const) {
      const routeState = buildDivisionRouteState({
        requestedVersionPath: `divisions/v${version}`,
        requestedApiVersion: version,
        resolvedApiVersion: `api-divisions-v${version}`,
        profile,
      })
      const resources = [
        createDivisionResource({
          baseUrl: 'https://api.saanseoi.hk',
          routeState,
          record,
        }),
        createIncludedDivisionResource({
          baseUrl: 'https://api.saanseoi.hk',
          requestedVersionPath: routeState.requestedVersionPath,
          profile,
          localeSelection: routeState.localeSelection,
          record,
        }),
      ]
      for (const resource of resources) {
        expect(resource.attributes.hierarchies).toEqual({
          administrative: [expected],
          locality: [expected],
          landform: [expected],
          full: [expected, [expected[0]!]],
        })
        expect(JSON.stringify(resource)).not.toContain('containment_geometry')
        if (profile === 'full')
          expect(resource.attributes.i18n?.en).toEqual({
            name: 'Child',
            nameVariant: ['Child', 'Alias'],
            nameAlts: ['Alias'],
            nameRules: [{ value: 'Alias', variant: 'alternate' }],
          })
        expect(
          DivisionHierarchiesSchema.parse(resource.attributes.hierarchies),
        ).toEqual(resource.attributes.hierarchies)
      }
      expect(record).toEqual(original)
    }
  }
})

test('division resources do not expose polygons as identity geometry', () => {
  const record = division('identity', 'administrative', { full: [] })
  record.division.geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 0],
      ],
    ],
  }
  const routeState = buildDivisionRouteState({
    requestedVersionPath: 'divisions/v0.2',
    requestedApiVersion: '0.2',
    resolvedApiVersion: 'api-divisions-v0.2',
    profile: 'map',
  })
  const resource = createDivisionResource({
    baseUrl: 'https://api.saanseoi.hk',
    routeState,
    record,
  })
  expect(resource.attributes.geometry).toBeNull()
})
