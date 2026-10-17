import { expect, test } from 'bun:test'
import {
  createDivisionMembership,
  type MembershipDivision,
} from '../divisions/divisionMembership'
import { createPlaceDivisionAttribution } from './placeDivisionAttribution'
import { placeSources } from './placeAttribution'

const area = { id: 'a', class: 'area', name: 'Area' }
const district = { id: 'd', class: 'district', name: 'District' }
const microhood = { id: 'm', class: 'microhood', name: 'Microhood' }
const divisions: MembershipDivision[] = [
  area,
  { ...district, hierarchies: { full: [[area, district]] } },
  { ...microhood, hierarchies: { full: [[area, district, microhood]] } },
  { id: 'i', class: 'major_island' },
]

test('a containing division supplies its own ID and the hierarchy IDs from its record', () => {
  const association = createDivisionMembership(divisions, [
    {
      divisionId: 'm',
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
  ]).resolve({ lng: 1, lat: 1 })
  expect(association.references).toEqual({
    microhoodId: 'm',
    areaId: 'a',
    districtId: 'd',
  })
  const sources = createPlaceDivisionAttribution(divisions)(association)
  expect(sources).toEqual({ microhoodId: 'm', areaId: 'm', districtId: 'm' })
  expect(
    placeSources([], [], { publisher: 'saanseoi', dataset: 'divisions' }, sources),
  ).toEqual([
    {
      publisher: 'saanseoi',
      dataset: 'divisions',
      recordId: 'm',
      properties: ['areaId', 'districtId', 'microhoodId'],
    },
  ])
})

test('independent landform evidence remains a separate source and null fields stay absent', () => {
  expect(
    createPlaceDivisionAttribution(divisions)({
      references: {
        areaId: 'a',
        districtId: 'd',
        microhoodId: 'm',
        islandId: 'i',
        townId: null,
      },
      divisionIds: ['a', 'd', 'm', 'i'],
      evidence: ['a', 'd', 'm', 'i'].map(divisionId => ({
        divisionId,
        method: 'geometry' as const,
      })),
    }),
  ).toEqual({ areaId: 'm', districtId: 'm', microhoodId: 'm', islandId: 'i' })
})

test('conflicting canonical paths cannot credit a division with an ambiguous ancestor', () => {
  const conflicting = [
    ...divisions.slice(0, 2),
    {
      ...microhood,
      hierarchies: {
        full: [
          [area, district, microhood],
          [{ id: 'other', class: 'area', name: 'Other' }, district, microhood],
        ],
      },
    },
  ]
  expect(
    createPlaceDivisionAttribution(conflicting)({
      references: { areaId: 'a', districtId: 'd', microhoodId: 'm' },
      divisionIds: ['a', 'd', 'm'],
      evidence: [
        { divisionId: 'm', method: 'geometry' },
        { divisionId: 'd', method: 'ancestry' },
        { divisionId: 'a', method: 'geometry' },
      ],
    }),
  ).toEqual({ microhoodId: 'm', districtId: 'm', areaId: 'a' })
})
