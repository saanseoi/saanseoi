import { expect, test } from 'bun:test'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'
import RelateOp from 'jsts/org/locationtech/jts/operation/relate/RelateOp.js'
import fixture from '../../../../../../fixtures/meta/curations/saanseoi-division/division-geometry.json'
import { resolveCuratedHierarchies } from './resolveHierarchies'

const tko = 'c8745e10-0c52-4f29-89e9-eab707d7783c'
const kowloon = '17009785-57fd-4e5b-af86-2d27352e4718'
const leiYueMun = 'd3ec706f-f6f0-414d-9e8b-193e73c90c1c'
const drawing = (id: string) =>
  fixture.features.find(feature => feature.properties.divisionId === id)!

test('Tseung Kwan O drawing is valid and contains its curated core point', () => {
  const reader = new GeoJSONReader(new GeometryFactory())
  const feature = drawing(tko)
  const polygon = reader.read(feature.geometry)
  expect(IsValidOp.isValid(polygon)).toBe(true)
  expect(
    RelateOp.contains(
      polygon,
      reader.read({ type: 'Point', coordinates: feature.properties.corePoint }),
    ),
  ).toBe(true)
})

test('final Tseung Kwan O geometry removes retained Kowloon ancestry', () => {
  const divisions = [
    { id: kowloon, class: 'city', category: 'locality', level: 1, hierarchies: {} },
    {
      id: tko,
      class: 'town',
      category: 'locality',
      level: 3,
      hierarchies: { full: [[{ id: kowloon, class: 'city', name: 'Kowloon' }]] },
    },
  ]
  resolveCuratedHierarchies(
    divisions,
    divisions.map(row => ({ divisionId: row.id, geometry: drawing(row.id).geometry })),
    [],
  )
  expect(divisions[1]!.hierarchies).toMatchObject({ locality: [], full: [] })
})

test('Lei Yue Mun has neither Kowloon city nor Tseung Kwan O locality ancestry', () => {
  const divisions = [
    { id: kowloon, class: 'city', category: 'locality', level: 1, hierarchies: {} },
    { id: tko, class: 'town', category: 'locality', level: 3, hierarchies: {} },
    {
      id: leiYueMun,
      class: 'rural_area',
      category: 'locality',
      level: 4,
      hierarchies: { full: [[{ id: tko, class: 'town', name: 'Tseung Kwan O' }]] },
    },
  ]
  resolveCuratedHierarchies(
    divisions,
    divisions.map(row => ({ divisionId: row.id, geometry: drawing(row.id).geometry })),
    [],
  )
  expect(divisions[2]!.hierarchies).toMatchObject({
    // Kowloon city is a locality; Kowloon Area belongs to administrative ancestry
    // and is not one of the polygons supplied to this locality-only test.
    locality: [],
    full: [],
  })
})
