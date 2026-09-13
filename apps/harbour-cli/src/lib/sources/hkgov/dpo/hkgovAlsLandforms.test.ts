import { expect, test } from 'bun:test'
import {
  addLandformLookup,
  resolveAddressLandform,
  type LandformLookup,
} from './hkgovAlsLandforms'

const path = (island: string) => [
  { id: 'islands', class: 'district', name: null },
  { id: island, class: 'major_island', name: null },
]
const row = (island: string) => ({
  id: 'town',
  class: 'town',
  locale: 'en',
  name: 'Tung Chung',
  hierarchies: {
    administrative: [],
    locality: [],
    landform: [],
    full: [path(island)],
  },
})

test('associates exact locality evidence within its district, without guessing across districts', () => {
  const lookup: LandformLookup = new Map()
  addLandformLookup(lookup, row('lantau'))
  expect(
    resolveAddressLandform(lookup, 'islands', [{ locale: 'en', name: 'Tung Chung' }]),
  ).toBe('lantau')
  expect(
    resolveAddressLandform(lookup, 'other-district', [
      { locale: 'en', name: 'Tung Chung' },
    ]),
  ).toBeNull()
  expect(
    resolveAddressLandform(lookup, 'islands', [
      { locale: 'en', name: 'Tung Chung Road' },
    ]),
  ).toBeNull()
  addLandformLookup(lookup, row('other-island'))
  expect(
    resolveAddressLandform(lookup, 'islands', [{ locale: 'en', name: 'Tung Chung' }]),
  ).toBeNull()
})

test('does not choose an island from conflicting or incomplete branches', () => {
  for (const paths of [
    [path('lantau'), path('other')],
    [path('lantau'), []],
  ]) {
    const lookup: LandformLookup = new Map()
    addLandformLookup(lookup, {
      ...row('lantau'),
      hierarchies: { ...row('lantau').hierarchies, full: paths },
    })
    expect(lookup.size).toBe(0)
  }
})
