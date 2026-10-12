import { expect, test } from 'bun:test'
import {
  applyCuratedAreaContract,
  applyCuratedRecordContract,
  curatedNameObject,
} from './recordContract'
test('curated records have no bounds, grouped identifiers and classified cartography with attribution', () => {
  const row: any = {
    id: 'new',
    class: 'neighbourhood',
    geometry: { type: 'Point', coordinates: [114, 22] },
    sources: { sourceResolutions: { entityId: 'new' } },
  }
  applyCuratedRecordContract([row])
  expect(row).not.toHaveProperty('bbox')
  expect(row).not.toHaveProperty('wikidata')
  expect(row.cartography).toEqual({ minZoom: 14, maxZoom: 18, prominence: 60 })
  expect(row.sources.sourceResolutions).toBeUndefined()
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

test('geometry references the dataset without embedding its release', () => {
  const rows = [{ sources: { sourceResolutions: { entityId: 'area' } } }]
  applyCuratedAreaContract(rows)
  expect((rows[0]!.sources as any).overture).toEqual([
    {
      dataset: 'ds-hk-overture-division',
      recordId: 'area',
      contributions: ['geometry'],
    },
  ])
})

test('area contract preserves explicit selection and geometry contributions', () => {
  const rows = [
    {
      sources: {
        saanseoi: [
          { dataset: 'island-areas', recordId: 'island', contributions: ['selection'] },
        ],
        protomaps: [
          {
            dataset: 'ds-hk-protomaps-island',
            recordId: 'OSM:a42',
            contributions: ['geometry'],
          },
        ],
      },
    },
  ]
  applyCuratedAreaContract(rows)
  expect(rows[0]!.sources.saanseoi[0]!.contributions).toEqual(['selection'])
  expect(rows[0]!.sources.protomaps[0]!.contributions).toEqual(['geometry'])
})
