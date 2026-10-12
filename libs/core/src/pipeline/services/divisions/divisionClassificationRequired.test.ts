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

test('Lantau uses its explicit curated class despite absent publisher class', () => {
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
  expect(() => normaliseDivisionRow(row)).toThrow(row.id)
})

test('hierarchy lookup rejects the same unmapped publisher classification', async () => {
  await expect(
    buildDivisionHierarchyLookup(
      { rows: [{ id: 'unclassified', subtype: 'locality', class: null }] },
      { source: 'overture', sourceVersion: '2026-09-23.0' },
    ),
  ).rejects.toThrow('explicit SaanSeoi classification')
})
