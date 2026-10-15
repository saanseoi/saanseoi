import { expect, test } from 'bun:test'
import { buildDivisionBaseHashInput, normaliseDivisionRow } from './division'
import { normaliseCuratedDivision } from './curatedDivision'

test('native canonical processing moves Wikidata into identifiers and hashes that contract', () => {
  const row = normaliseDivisionRow({
    id: 'test-village',
    source: 'overture',
    country: 'HK',
    subtype: 'locality',
    class: 'village',
    names: { primary: 'Test Village', common: { en: 'Test Village' } },
    hierarchies: [],
    wikidata: 'Q123',
    identifiers: { overture: { divisionId: 'test-village' } },
  })
  expect(row.base.identifiers).toEqual({
    overture: { divisionId: 'test-village' },
    wikidata: { id: 'Q123' },
  })
  expect(row.base).not.toHaveProperty('wikidata')
  expect(buildDivisionBaseHashInput(row.base)).not.toHaveProperty('wikidata')
  const { createdAt, ...base } = row.base
  const curated = { ...base, names: { en: { name: 'Test Village' } } }
  expect(
    normaliseCuratedDivision({ id: base.id, record: curated }).base.identifiers,
  ).toEqual(base.identifiers)
  expect(() =>
    normaliseCuratedDivision({ id: base.id, record: { ...curated, wikidata: 'Q123' } }),
  ).toThrow('identifiers.wikidata.id')
})
