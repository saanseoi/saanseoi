import { expect, test } from 'bun:test'
import {
  normaliseDivisionRow,
  prepareCuratedDivisionRow,
  createDivisionBranchCounts,
  buildDivisionHierarchyLookup,
} from './division'

for (const klass of [null, 'unknown']) {
  test(`unmapped publisher class ${klass} cannot be inferred from level or parent`, () => {
    for (const level of [0, 1, 2, 3, 4, 5, 6]) {
      const row = {
        id: 'unclassified',
        subtype: 'locality',
        class: klass,
        level,
        admin_level: String(level),
        parent_division_id: 'parent',
      }
      expect(() => normaliseDivisionRow(row)).toThrow(
        'explicit SaanSeoi classification',
      )
      expect(() => prepareCuratedDivisionRow(row)).toThrow(
        'explicit SaanSeoi classification',
      )
    }
  })
}

test('Lantau fills an absent publisher class from its reviewed island decision', async () => {
  const row = {
    id: '3707878f-080b-42cf-aecf-89fef56a066a',
    subtype: 'locality',
    class: null,
    names: { primary: 'Lantau' },
    hierarchies: [],
  }
  const branchCounts = createDivisionBranchCounts()
  expect(prepareCuratedDivisionRow(row, { branchCounts }).base).toMatchObject({
    class: 'major_island',
    level: null,
  })
  expect(
    Object.keys(branchCounts).filter(id => id.startsWith('class.fallback')),
  ).toEqual([])
  const original = structuredClone(row)
  const normalised = normaliseDivisionRow(row)
  expect(normalised.base).toMatchObject({
    class: 'major_island',
    category: 'landform',
    level: null,
  })
  expect(normalised.overtureHongKongDivisionClassificationCorrection).toEqual({
    class: 'major_island',
    level: null,
  })
  const lookup = await buildDivisionHierarchyLookup(
    { rows: [row] },
    { source: 'overture', sourceVersion: '2025-11-19.0' },
  )
  expect(lookup.get(row.id)).toMatchObject({ class: 'major_island', level: null })
  expect(row).toEqual(original)
  expect(normaliseDivisionRow({ ...row, class: 'village' }).base).toMatchObject({
    class: 'village',
    level: 5,
  })
  expect(() => normaliseDivisionRow({ ...row, class: 'unknown' })).toThrow(row.id)
  expect(() =>
    normaliseDivisionRow(row, {
      source: { source: 'other-publisher', sourceVersion: '2025-11-19.0' },
    }),
  ).toThrow(row.id)
})

test('hierarchy lookup rejects the same unmapped publisher classification', async () => {
  await expect(
    buildDivisionHierarchyLookup(
      { rows: [{ id: 'unclassified', subtype: 'locality', class: null }] },
      { source: 'overture', sourceVersion: '2026-09-23.0' },
    ),
  ).rejects.toThrow('explicit SaanSeoi classification')
})

test('C&SD hierarchy lookup preserves its native classification and null HMA level', async () => {
  const lookup = await buildDivisionHierarchyLookup(
    {
      rows: [
        {
          id: 'hma',
          canonical_type: 'housing-market-area',
          canonical_level: null,
          geometry: { type: 'Point', coordinates: [114, 22] },
          names: { common: { en: 'Example HMA' } },
        },
      ],
    },
    {
      source: 'hkgov-censtatd',
      sourceVersion: '2021',
      datasetCode:
        'ds-hk-hkgov-censtatd-division-statistic-housing-market-areas-building-groups',
    },
  )
  expect(lookup.get('hma')).toMatchObject({ class: 'housing-market-area', level: null })
})
