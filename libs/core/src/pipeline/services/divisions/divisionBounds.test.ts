import { expect, test } from 'bun:test'
import { buildDivisionBaseHashInput, normaliseDivisionRow } from './division'
import { normaliseCuratedDivision } from './curatedDivision'

test('publisher bounds neither enter Division storage nor affect its canonical hash', () => {
  const input = {
    id: 'bounds-test',
    country: 'HK',
    subtype: 'locality',
    class: 'village',
    names: { primary: 'Test Village' },
    geometry: { type: 'Point', coordinates: [114, 22] },
    hierarchies: [],
    sources: [],
  }
  const first = normaliseDivisionRow({ ...input, bbox: [113, 21, 115, 23] }).base
  const second = normaliseDivisionRow({ ...input, bbox: [114, 22, 114, 22] }).base
  expect(first).not.toHaveProperty('bbox')
  expect(buildDivisionBaseHashInput(first)).not.toHaveProperty('bbox')
  expect(buildDivisionBaseHashInput(first)).toEqual(buildDivisionBaseHashInput(second))
  const curated = normaliseCuratedDivision({
    id: first.id,
    record: {
      ...first,
      bbox: [113, 21, 115, 23],
      names: { en: { name: 'Test Village' } },
    },
  })
  expect(curated.base).not.toHaveProperty('bbox')
})
