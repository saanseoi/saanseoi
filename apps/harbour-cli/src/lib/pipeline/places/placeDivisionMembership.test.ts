import { expect, test } from 'bun:test'
import { placeDivisionFieldNames } from '@repo/db'
import {
  hashPlaceMaterialisation,
  normaliseOverturePlace,
} from '@repo/core/pipeline/services/places/place'
import {
  createDivisionMembership,
  divisionFields,
} from '../divisions/divisionMembership'
import { supportedPlaceMembership } from './placeDivisionMembership'

test('Place output consumes scalar references and excludes extra ancestor evidence without changing the shared resolver', () => {
  expect([...new Set(Object.values(divisionFields))].sort()).toEqual(
    [...placeDivisionFieldNames].sort(),
  )
  const divisions = [
    { id: 'country', class: 'country' },
    { id: 'sar', class: 'region' },
    { id: 'city', class: 'city' },
    { id: 'group', class: 'island_group' },
    {
      id: 'district',
      class: 'district',
      hierarchies: {
        full: [
          [
            { id: 'country', class: 'country' },
            { id: 'sar', class: 'region' },
            { id: 'city', class: 'city' },
            { id: 'group', class: 'island_group' },
          ],
        ],
      },
    },
  ]
  const resolver = createDivisionMembership(divisions as never, [
    {
      divisionId: 'district',
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
        ],
      },
    },
  ])
  const raw = resolver.resolve({ lng: 1, lat: 1 })
  expect(raw.divisionIds).toContain('sar')
  const selected = supportedPlaceMembership(raw)
  expect(selected.divisionIds).toEqual(['country', 'district'])
  expect(selected.evidence.map(row => row.divisionId)).toEqual(['country', 'district'])
  expect(selected.references.islandId).toBeNull()
})

test('Place content hashes exclude the publication Division revision and display definitions', async () => {
  const candidates = {
    a: { level: 1, locales: [{ locale: 'en', name: 'Area' }] },
    d: { level: 2, locales: [{ locale: 'en', name: 'District' }] },
  }
  const refs = { areaId: 'a', districtId: 'd' }
  const changed = structuredClone(candidates)
  changed.d.level = 3
  const place = normaliseOverturePlace(
    {
      id: 'p',
      geometry: { type: 'Point', coordinates: [114, 22] },
      names: { en: 'Place' },
    },
    '2026-01',
  )!
  const input = {
    addressSnapshotId: '',
    divisionSnapshotId: 'old',
    addressId: null,
    divisionIds: ['a', 'd'],
    divisionReferences: refs,
    divisionDefinitions: candidates,
  }
  const hash = await hashPlaceMaterialisation(place, input)
  expect(
    await hashPlaceMaterialisation(
      { ...place, lastSeenMonth: '2026-02' },
      { ...input, divisionSnapshotId: 'new' },
    ),
  ).toBe(hash)
  expect(
    await hashPlaceMaterialisation(place, { ...input, divisionDefinitions: changed }),
  ).toBe(hash)
  expect(
    await hashPlaceMaterialisation(place, {
      ...input,
      divisionReferences: { areaId: 'a' },
    }),
  ).not.toBe(hash)
})
