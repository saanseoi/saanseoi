import { expect, test } from 'bun:test'
import { addTownLookup, resolveAddressTown, type TownLookup } from './hkgovAlsTowns'

const row = (id = 'town-a', name = 'Tung Chung', locale = 'en') => ({
  id,
  name,
  locale,
  class: 'town',
  hierarchies: {
    administrative: [],
    locality: [],
    landform: [],
    full: [[{ id: 'islands', class: 'district', name: null }]],
  },
})
const resolve = (
  lookup: TownLookup,
  name: string,
  district: string | null = 'islands',
) => resolveAddressTown(lookup, district, [{ locale: 'en', name }])

test('matches exact bilingual towns with district ancestry, including spacing and case', () => {
  const lookup: TownLookup = new Map()
  addTownLookup(lookup, row())
  addTownLookup(lookup, row('town-a', '東涌', 'zh-hant'))
  expect(resolve(lookup, ' TUNG  CHUNG ')).toBe('town-a')
  expect(
    resolveAddressTown(lookup, 'islands', [{ locale: 'zh-hant', name: '東涌' }]),
  ).toBe('town-a')
  expect(resolve(lookup, 'Tung Chung Road')).toBeNull()
  expect(resolve(lookup, 'Tung Chung', 'other')).toBeNull()
  expect(resolve(lookup, 'Tung Chung', null)).toBeNull()
})

test('rejects duplicate names and contradictory recognised locality fields', () => {
  const lookup: TownLookup = new Map()
  addTownLookup(lookup, row())
  addTownLookup(lookup, row('town-b', 'Other'))
  expect(
    resolveAddressTown(lookup, 'islands', [
      { locale: 'en', name: 'Tung Chung' },
      { locale: 'en', name: 'Other' },
    ]),
  ).toBeNull()
  addTownLookup(lookup, row('town-b'))
  addTownLookup(lookup, row())
  expect(resolve(lookup, 'Tung Chung')).toBeNull()
})

test('rejects non-towns and incomplete ancestry', () => {
  for (const candidate of [
    { ...row(), class: 'district' },
    { ...row(), hierarchies: undefined },
    {
      ...row(),
      hierarchies: { ...row().hierarchies, full: [row().hierarchies.full[0]!, []] },
    },
  ]) {
    const lookup: TownLookup = new Map()
    addTownLookup(lookup, candidate)
    expect(lookup.size).toBe(0)
  }
})

test('prepares town membership from street locality without treating street names as evidence', async () => {
  const { normaliseHkgovAlsFeature } = await import('./hkgovAlsNormalisation')
  const towns: TownLookup = new Map()
  addTownLookup(towns, row())
  const maps = {
    towns,
    areaByEn: new Map(),
    areaByZh: new Map(),
    ambiguousAreaEn: new Set<string>(),
    ambiguousAreaZh: new Set<string>(),
    districtByEn: new Map([['ISLANDS', 'islands']]),
    districtByZh: new Map(),
    ambiguousDistrictEn: new Set<string>(),
    ambiguousDistrictZh: new Set<string>(),
    countryId: null,
    snapshotId: 'division-test',
  }
  const prepare = (locality?: string) =>
    normaliseHkgovAlsFeature(
      {
        properties: {
          Address: {
            PremisesAddress: {
              GeoAddress: 'test',
              EngPremisesAddress: {
                EngDistrict: 'ISLANDS',
                BuildingName: 'Example',
                EngStreet: {
                  StreetName: 'Tung Chung',
                  BuildingNoFrom: '1',
                  LocationName: locality,
                },
              },
            },
          },
        },
      },
      'test.geojson',
      1,
      'test',
      '2026-01-01.0',
      maps,
      false,
      new Map(),
      new Map(),
      new Map(),
    )
  expect(prepare().townId).toBeNull()
  const prepared = prepare('Tung Chung')
  expect(prepared.townId).toBe('town-a')
  expect(JSON.parse(prepared.sources).townAssociation).toMatchObject({
    townId: 'town-a',
    divisionSnapshotId: 'division-test',
  })
})
