import { expect, test } from 'bun:test'
import {
  normaliseDivisionRow,
  normaliseDivisionI18n,
  buildDivisionHierarchyLookup,
} from './division'
import { readDivisionRowsWithFixtures } from './divisionFixtures'
import { normaliseDivisionAreaGeometryRow } from './divisionGeometry'
import classifications from '../../../../../../fixtures/meta/patches/overture-division-classification.json'
import exclusions from '../../../../../../fixtures/meta/patches/overture-division-exclusions.json'

test('publisher normalisation ignores identity-specific editorial classifications and names', async () => {
  const row = {
    id: classifications.entries[0]!.divisionId,
    subtype: 'locality',
    class: 'village',
    names: { common: { en: 'Publisher name' } },
    hierarchies: [],
  }
  const ordinary = normaliseDivisionRow({ ...row, id: 'unreviewed-publisher-id' })
  const reviewed = normaliseDivisionRow(row)
  expect(reviewed.base.class).toBe(ordinary.base.class)
  expect(reviewed.base.level).toBe(ordinary.base.level)
  expect(reviewed.base.category).toBe(ordinary.base.category)
  expect(reviewed.i18n.map(value => value.name)).toEqual(['Publisher name'])
  expect(reviewed.overtureHongKongDivisionClassificationCorrection).toBeNull()
  expect(reviewed.overtureHongKongAreaHierarchyAssignment).toBeNull()
  const lookup = await buildDivisionHierarchyLookup(
    { rows: [row] },
    { source: 'overture', sourceVersion: '2026-09-23.0' },
  )
  expect(lookup.size).toBe(1)
  expect(lookup.get(row.id)?.class).toBe(reviewed.base.class)
})

test('publisher batches retain excluded identities and never inject curated or reference fixtures', async () => {
  const row = {
    id: exclusions.entries[0]!.divisionId,
    names: { primary: 'Publisher name' },
  }
  const batches = []
  for await (const batch of readDivisionRowsWithFixtures(
    { rows: [row] },
    { source: 'overture', regionCode: 'hk', resourceType: 'division' },
    100,
    [{ id: 'editorial-addition' }],
  ))
    batches.push(batch)
  expect(batches.flatMap(batch => batch.rows)).toEqual([row])
  expect(batches.flatMap(batch => batch.processingActions)).toEqual([])
})

test('Overture geometry retains editorially excluded IDs and excludes only CN-GD', () => {
  const row = {
    id: 'publisher-area',
    division_id: exclusions.entries[0]!.divisionId,
    class: 'land',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 0],
        ],
      ],
    },
  }
  expect(normaliseDivisionAreaGeometryRow(row)?.canonical.divisionId).toBe(
    row.division_id,
  )
  expect(normaliseDivisionAreaGeometryRow({ ...row, region: 'CN-GD' })).toBeNull()
})

test('bilingual inference deduplicates localised rule values without retaining the combined value', () => {
  const rows = normaliseDivisionI18n('publisher', {
    rules: [
      { language: 'en', value: 'Hong Heong Lo Valley', variant: 'alternate' },
      { language: 'zh', value: '紅香爐大坑', variant: 'alternate' },
      {
        language: null,
        value: '紅香爐大坑 Hong Heong Lo Valley',
        variant: 'alternate',
      },
    ],
  })
  expect(rows.map(row => [row.locale, row.nameRules])).toEqual([
    ['en', [{ value: 'Hong Heong Lo Valley', variant: 'alternate' }]],
    ['zh-hant', [{ value: '紅香爐大坑', variant: 'alternate' }]],
  ])
})
