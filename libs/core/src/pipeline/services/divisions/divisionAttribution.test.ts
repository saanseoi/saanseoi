import { expect, test } from 'bun:test'
import {
  attributeDivisionProperties,
  changedDivisionNameProperties,
} from './divisionAttribution'
import { curatedDivisionAttribution } from './curatedDivisionAttribution'
import {
  normaliseDivisionRow,
  prepareCuratedDivisionRow,
  buildDivisionBaseHashInput,
} from './division'
import { createHash } from '../../utils'
import { readSourceAttributions } from '../sources/sourceAttribution'

const upstream = {
  publisher: 'openstreetmap',
  upstreamOf: 'overture',
  dataset: 'openstreetmap',
  recordId: 'r',
  property: '',
}
test('merges canonical contributions without modifying native attribution', async () => {
  const sources = attributeDivisionProperties([upstream], 'shared', [
    'hierarchies',
    'class',
  ])
  const merged = attributeDivisionProperties(sources, 'shared', [
    'divisionCode',
    'class',
  ])
  expect(merged).toEqual([
    upstream,
    {
      publisher: 'saanseoi',
      dataset: 'ds-hk-saanseoi-division',
      recordId: 'shared',
      properties: ['class', 'divisionCode', 'hierarchies'],
    },
  ])
  expect(readSourceAttributions(merged)).toEqual(merged)
  expect(
    await createHash(
      buildDivisionBaseHashInput({ id: 'shared', class: 'district', sources } as any),
    ),
  ).not.toBe(
    await createHash(
      buildDivisionBaseHashInput({
        id: 'shared',
        class: 'district',
        sources: merged,
      } as any),
    ),
  )
})
test('names are attributed only when a supplied value changes, never on deletion', () => {
  expect(
    changedDivisionNameProperties(
      [
        { locale: 'en', name: 'Name' },
        { locale: 'zh-hans', name: 'old' },
      ],
      [
        { locale: 'en', name: 'Name' },
        { locale: 'zh-hant', name: '新' },
      ],
    ),
  ).toEqual(['i18n.zh-hant.name'])
})
test('curated geometry belongs to SaanSeoi only when authored', () => {
  const row = {
    id: 'shared',
    sources: [upstream],
    geometry: { type: 'Point', coordinates: [114, 22] },
    divisionCode: 'D',
    cartography: { minZoom: 1 },
  }
  const names = [{ locale: 'en', name: 'Name' }]
  const sources = curatedDivisionAttribution(row, names, {
    geometry: row.geometry,
    names,
  })
  expect(sources.at(-1)?.properties).toEqual([
    'cartography',
    'category',
    'class',
    'divisionCode',
    'hierarchies',
    'level',
  ])
  expect(
    curatedDivisionAttribution(row, names, { geometry: null, names }).at(-1)
      ?.properties,
  ).toContain('geometry')
  expect(sources.at(-1)?.properties).not.toContain('identifiers.wikidata.id')
})
test('native Overture never receives the curated country point fallback', () => {
  const row = {
    id: 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be',
    subtype: 'country',
    class: null,
    country: 'CN',
    names: { primary: 'China' },
    hierarchies: [],
    geometry: null,
  }
  expect(normaliseDivisionRow(row).base.geometry).toBeNull()
  expect(prepareCuratedDivisionRow(row).base.geometry).toEqual({
    type: 'Point',
    coordinates: [103, 35],
  })
})
test('rejects empty, duplicate and malformed canonical property lists', () => {
  for (const properties of [[], ['class', 'class'], [''], ['/native/path']])
    expect(() =>
      readSourceAttributions([{ publisher: 'saanseoi', dataset: 'd', properties }]),
    ).toThrow()
})

test('authored alternatives are attributed but removals and unchanged rules are not', () => {
  const before = [{ locale: 'en', name: 'Name', nameAlts: 'Old|Retained' }]
  expect(
    changedDivisionNameProperties(before, [
      { locale: 'en', name: 'Name', nameAlts: 'Retained' },
    ]),
  ).toEqual([])
  expect(
    changedDivisionNameProperties(before, [
      { locale: 'en', name: 'Name', nameAlts: 'Retained|Added' },
    ]),
  ).toEqual(['i18n.en.nameAlts'])
})

test('a matched identity keeps distinct native and curated representative points', () => {
  const id = 'ac162f33-9966-4d6e-9d53-8a6df575775f'
  const native: { type: 'Point'; coordinates: [number, number] } = {
    type: 'Point',
    coordinates: [114, 22],
  }
  const curated: { type: 'Point'; coordinates: [number, number] } = {
    type: 'Point',
    coordinates: [114.1933860492098, 22.334949921742464],
  }
  expect(
    normaliseDivisionRow({
      id,
      source: 'overture',
      subtype: 'region',
      class: null,
      country: 'HK',
      names: { primary: 'Example' },
      hierarchies: [],
      geometry: native,
    }).base.geometry,
  ).toEqual(native)
  expect(
    normaliseDivisionRow({
      id,
      source: 'saanseoi',
      record: {
        id,
        class: 'district',
        level: 2,
        category: 'administrative',
        hierarchies: { full: [] },
        names: { en: { name: 'Example' } },
        geometry: curated,
        sources: [],
      },
    }).base.geometry,
  ).toEqual(curated)
})
