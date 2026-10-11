import { expect, test } from 'bun:test'
import {
  curatedSourceIdentifiers,
  protomapsIdentifiers,
  mergeDivisionIdentifiers,
} from './curatedIdentifiers'
import { divisionIdentifiers } from './divisionIdentifiers'

test('publisher identities require native evidence, and LandsD retains significant zeroes', () => {
  expect(curatedSourceIdentifiers('LANDSD:PLACE_NAME:001')).toEqual({
    'hkgov-landsd': { geoNameId: '001' },
  })
  expect(curatedSourceIdentifiers('BASEMAP:ISLAND:abc')).toEqual({
    saanseoi: { sourceId: 'BASEMAP:ISLAND:abc' },
  })
  expect(curatedSourceIdentifiers('some-uuid')).toEqual({
    saanseoi: { sourceId: 'some-uuid' },
  })
  expect(curatedSourceIdentifiers('some-uuid', true)).toEqual({
    overture: { divisionId: 'some-uuid' },
  })
})
test('Protomaps source identities retain the OSM exported element kind', () => {
  expect(protomapsIdentifiers('OSM:a123')).toEqual({
    protomaps: { sourceId: 'OSM:a123' },
    osm: { areaId: '123' },
  })
  expect(protomapsIdentifiers('OSM:r456').osm).toEqual({ relationId: '456' })
  expect(protomapsIdentifiers('PROTOMAPS:LAND:abc')).toEqual({
    protomaps: { sourceId: 'PROTOMAPS:LAND:abc' },
  })
  expect(() => protomapsIdentifiers('BASEMAP:ISLAND:abc')).toThrow()
  expect(divisionIdentifiers(protomapsIdentifiers('OSM:a123'))).toEqual(
    protomapsIdentifiers('OSM:a123'),
  )
})
test('identity merges fail on disagreement rather than overwriting evidence', () => {
  expect(() =>
    mergeDivisionIdentifiers(
      { overture: { divisionId: 'a' } },
      { overture: { divisionId: 'b' } },
    ),
  ).toThrow('Conflicting')
})
