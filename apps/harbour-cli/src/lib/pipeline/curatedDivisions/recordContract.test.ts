import { expect, test } from 'bun:test'
import islandGroups from '../../../../../../fixtures/meta/curations/saanseoi-division/island-groups.json'
import { curatedRecordSources } from '@repo/core/pipeline/services/sources/curatedRecordSources'
import {
  applyCuratedAreaContract,
  applyCuratedRecordContract,
  curatedNameObject,
  groupCuratedUpstreamAttribution,
} from './recordContract'

test('assembly preserves flat upstream attribution through its grouped evidence workspace', () => {
  const attribution = [
    {
      publisher: 'openstreetmap',
      dataset: 'OpenStreetMap',
      property: '/names',
      version: '123',
      confidence: 0.9,
    },
  ]
  const row: any = {
    id: 'new',
    class: 'neighbourhood',
    sources: groupCuratedUpstreamAttribution(attribution),
  }
  applyCuratedRecordContract([row])
  expect(curatedRecordSources(row.sources, row.id)).toEqual(attribution)
  expect(attribution[0]).not.toHaveProperty('contributions')
})
test('curated records have no bounds, grouped identifiers and classified cartography with attribution', () => {
  const row: any = {
    id: 'new',
    class: 'neighbourhood',
    geometry: { type: 'Point', coordinates: [114, 22] },
    sources: {},
  }
  applyCuratedRecordContract([row])
  expect(row).not.toHaveProperty('bbox')
  expect(row).not.toHaveProperty('wikidata')
  expect(row.cartography).toEqual({ minZoom: 14, maxZoom: 18, prominence: 60 })
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
  const rows = [
    {
      sources: {
        overture: [
          {
            dataset: 'ds-hk-overture-division',
            recordId: 'area',
            contributions: ['geometry'],
          },
        ],
      },
    },
  ]
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

test('prepared PRC archive carries its country metadata into canonical ingestion', () => {
  const row: any = {
    id: 'fb68fc73-3ac6-41c9-a692-22fcf20cb5be',
    class: 'country',
    category: 'administrative',
    geometry: null,
    sources: {},
  }
  applyCuratedRecordContract([row])
  expect(row.divisionCode).toBe('PRC')
  expect(row.identifiers.wikidata.id).toBe('Q148')
  expect(row.geometry).toEqual({ type: 'Point', coordinates: [103, 35] })
  expect(row.cartography).toEqual({ minZoom: 2, maxZoom: 6, prominence: 100 })
  expect(curatedRecordSources(row.sources, row.id)).toContainEqual({
    publisher: 'overture',
    dataset: 'ds-hk-overture-division',
    recordId: row.id,
  })
})

test('every reviewed island group retains authored geometry attribution', () => {
  for (const group of islandGroups.entries) {
    const row = {
      sources: {
        saanseoi: [
          {
            dataset: 'island-groups',
            recordId: group.divisionId,
            islandGroup: {
              memberIds: group.seedMemberIds,
              method: 'seed-bounds-whole-island-v1',
            },
          },
        ],
      },
    }
    applyCuratedAreaContract([row])
    expect(curatedRecordSources(row.sources, group.divisionId)).toEqual([
      {
        publisher: 'saanseoi',
        dataset: 'ds-hk-saanseoi-division',
        recordId: group.divisionId,
      },
    ])
  }
})
