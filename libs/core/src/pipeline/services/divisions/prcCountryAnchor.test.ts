import { expect, test } from 'bun:test'
import { normaliseDivisionRow } from './division'

test('native country ancestry anchor retains metadata without an authored point', () => {
  const { base } = normaliseDivisionRow({
    id: 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be',
    subtype: 'country',
    country: 'CN',
    names: { primary: 'China' },
  })
  expect(base.divisionCode).toBe('PRC')
  expect(base.identifiers).toMatchObject({ wikidata: { id: 'Q148' } })
  expect(base.geometry).toBeNull()
  expect(base.cartography).toEqual({ minZoom: 2, maxZoom: 6, prominence: 100 })
  expect(base.sources).toEqual([
    {
      publisher: 'overture',
      dataset: 'ds-hk-overture-division',
      recordId: 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be',
    },
    {
      publisher: 'saanseoi',
      dataset: 'ds-hk-saanseoi-division',
      recordId: base.id,
      properties: [
        'cartography',
        'category',
        'class',
        'divisionCode',
        'hierarchies',
        'level',
      ],
    },
  ])
})
