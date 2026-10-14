import { expect, test } from 'bun:test'
import type { DivisionHierarchies, DivisionHierarchyEntry } from '@repo/db'
import { z } from '@hono/zod-openapi'
import { DivisionResourceSchema, DivisionHierarchiesSchema } from '../schema/divisions'
import { division } from './geocoding.fixtures'
import {
  publicDivisionHierarchies,
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
    meta: { isLocaleInferred: false },
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
        expect(JSON.stringify(resource)).not.toContain('nameVariant')
        if (profile === 'full')
          expect(resource.attributes.i18n?.en).toEqual({
            meta: { isLocaleInferred: false },
            name: 'Child',
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

test('public Division schema omits redundant name variants', () => {
  const schema = JSON.stringify(z.toJSONSchema(DivisionResourceSchema))
  expect(schema).not.toContain('nameVariant')
  expect(schema).toContain('nameAlts')
  expect(schema).toContain('nameRules')
})

test('public full paths always omit cities and Hong Kong Island landform', () => {
  const district = {
    id: 'district',
    class: 'district',
    name: '觀塘區 Kwun Tong District',
  }
  const city = { id: 'kowloon', class: 'city', name: '九龍 Kowloon' }
  const island = {
    id: 'ss-5999ed90-1c47-51e7-b79d-80f9251c1e01',
    class: 'major_island',
    name: '香港島',
  }
  const otherIsland = {
    id: 'lantau',
    class: 'major_island',
    name: '大嶼山 Lantau Island',
  }
  const rural = { id: 'lei-yue-mun', class: 'rural_area', name: '鯉魚門 Lei Yue Mun' }
  const stored: DivisionHierarchies = {
    full: [
      [district, city, rural],
      [island, rural],
      [otherIsland, city],
    ],
    locality: [[city, rural]],
    landform: [[island], [otherIsland]],
  }
  const original = structuredClone(stored)
  const projected = publicDivisionHierarchies(stored)
  expect(projected.full).toEqual([[district, rural], [rural], [otherIsland]])
  expect(projected.locality).toEqual(stored.locality)
  expect(projected.landform).toEqual(stored.landform)
  expect(stored).toEqual(original)
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

test('Division schema and full responses use the reviewed attribute order', () => {
  const expected = [
    'divisionCode',
    'category',
    'class',
    'level',
    'i18n',
    'hierarchies',
    'geometry',
    'cartography',
    'identifiers',
    'sources',
    'snapshotId',
    'createdAt',
    'updatedAt',
  ]
  expect(Object.keys(DivisionResourceSchema.shape.attributes.shape)).toEqual(expected)
  const record = division('example')
  record.division.divisionCode = 'EX'
  record.division.identifiers = { wikidata: { id: 'Q123' } }
  for (const profile of ['compact', 'default', 'map', 'full'] as const) {
    const resource = createDivisionResource({
      baseUrl: 'https://api.saanseoi.hk',
      record,
      routeState: buildDivisionRouteState({
        requestedVersionPath: 'divisions/v0.1',
        requestedApiVersion: '0.1',
        resolvedApiVersion: 'api-divisions-v0.1',
        profile,
      }),
    })
    const keys = Object.keys(resource.attributes)
    expect(keys).toEqual(expected.filter(key => keys.includes(key)))
    expect(resource.attributes).not.toHaveProperty('wikidataId')
    if (profile === 'full') expect(keys).toEqual(expected)
    if (profile !== 'compact')
      expect(resource.attributes.identifiers).toEqual({ wikidata: { id: 'Q123' } })
  }
})
