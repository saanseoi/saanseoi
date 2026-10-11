import { expect, test } from 'bun:test'
import { divisionIdentifiers } from './divisionIdentifiers'

test('groups authorities and island identities without changing values or input', () => {
  const source = {
    'LANDSD:GEO_NAME_ID': ['001', '42'],
    saanseoiIsland: { sourceId: 'BASEMAP:ISLAND:001' },
    'PLAND:TPU': '012',
    'PLAND:SUBUNIT': '03',
  }
  const before = structuredClone(source)
  const result = {
    'hkgov-landsd': { geoNameId: ['001', '42'] },
    saanseoi: { sourceId: 'BASEMAP:ISLAND:001' },
    'hkgov-pland': { tpu: '012', subunit: '03' },
  }
  expect(divisionIdentifiers(source)).toEqual(result)
  expect(divisionIdentifiers(JSON.stringify(result))).toEqual(result)
  expect(source).toEqual(before)
})
test('merges publisher aliases and retains source identifiers', () => {
  expect(
    divisionIdentifiers({
      hkgov: { cdsiAdminAreaId: 42, areaId: '01' },
      hkgovPlandNewTown: { id: 'town' },
      hkgovPland: { ppu: '1' },
      saanseoi: { sourceId: 'x' },
    }),
  ).toEqual({
    'hkgov-had': { csdiAdminAreaId: 42, areaId: '01' },
    'hkgov-pland': { newTownId: 'town', ppu: '1' },
    saanseoi: { sourceId: 'x' },
  })
})
test('rejects conflicting aliases rather than discarding an identifier', () => {
  expect(() =>
    divisionIdentifiers({
      'LANDSD:GEO_NAME_ID': '01',
      'hkgov-landsd': { geoNameId: '02' },
    }),
  ).toThrow('Conflicting')
  expect(divisionIdentifiers(null)).toBeNull()
  expect(divisionIdentifiers({})).toBeNull()
})

test('rejects provenance labels and structured metadata as identifiers', () => {
  for (const field of ['geometry', 'method', 'curation', 'geometryPartition']) {
    for (const input of [
      { [field]: 'metadata' },
      { saanseoi: { [field]: 'metadata' } },
    ])
      expect(() => divisionIdentifiers(input)).toThrow('belongs in sources')
  }
  expect(() =>
    divisionIdentifiers({ saanseoi: { other: { method: 'drawn' } } }),
  ).toThrow('text or numbers')
})

test('rejects publisher IDs hidden in the SaanSeoi namespace', () => {
  for (const sourceId of ['LANDSD:PLACE_NAME:287', 'PROTOMAPS:LAND:abc', 'OSM:a123'])
    expect(() => divisionIdentifiers({ saanseoi: { sourceId } })).toThrow(
      'publisher namespace',
    )
})

test('Wikidata is a publisher identifier and conflicting source links are rejected', async () => {
  const { divisionIdentifiersWithWikidata } = await import('./divisionIdentifiers')
  expect(
    divisionIdentifiersWithWikidata({ overture: { divisionId: 'native' } }, 'Q123'),
  ).toEqual({
    overture: { divisionId: 'native' },
    wikidata: { id: 'Q123' },
  })
  expect(divisionIdentifiers({ wikidata: { id: 'Q123' } })).toEqual({
    wikidata: { id: 'Q123' },
  })
  expect(() =>
    divisionIdentifiersWithWikidata({ wikidata: { id: 'Q1' } }, 'Q2'),
  ).toThrow('Conflicting')
})
