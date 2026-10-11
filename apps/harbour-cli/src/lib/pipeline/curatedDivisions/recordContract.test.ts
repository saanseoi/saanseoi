import { expect, test } from 'bun:test'
import { applyCuratedRecordContract, curatedNameObject } from './recordContract'
test('curated records have point bounds, grouped identifiers and classified cartography with attribution', () => {
  const row: any = {
    id: 'new',
    class: 'neighbourhood',
    geometry: { type: 'Point', coordinates: [114, 22] },
    sources: { evidence: [{ record_id: 'new' }] },
  }
  applyCuratedRecordContract([row])
  expect(row.bbox).toEqual([114, 22, 114, 22])
  expect(row).not.toHaveProperty('wikidata')
  expect(row.cartography).toEqual({ minZoom: 14, maxZoom: 24, prominence: 60 })
  expect(row.sources.evidence).toBeUndefined()
  expect(row.sources.saanseoi[0].contributions).toContain('identity')
})
test('nested name arrays stay structured and null keys are omitted', () => {
  expect(
    curatedNameObject({
      name: 'Name',
      nameVariant: '["Name"]',
      nameRules: '[{"value":"Alias","variant":"alternate"}]',
      nameAlts: null,
    }),
  ).toEqual({
    name: 'Name',
    nameVariant: ['Name'],
    nameRules: [{ value: 'Alias', variant: 'alternate' }],
  })
})
