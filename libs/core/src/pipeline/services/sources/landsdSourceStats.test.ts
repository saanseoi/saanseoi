import { expect, test } from 'bun:test'
import { buildLandsdSourceStats } from './landsdSourceStats'

const record = (placeClass: string, name: string | null) => ({
  properties: {
    placeClass,
    placeNames: [{ nameEn: 'Name', nameZhHant: name, nameStatus: 'Official' }],
  },
  sourceGeometry: { type: 'Point', coordinates: [830000, 820000] },
})
test('source stats count every class and compare source changes outside settlements', () => {
  const previous = new Map([
    ['village', record('Settlement', '村')],
    ['stream', record('Hydrographic', '溪')],
  ])
  const current = new Map([
    ['village', record('Settlement', '村')],
    ['stream', record('Hydrographic', '河')],
    ['hill', record('Topographic', null)],
  ])
  const rows = buildLandsdSourceStats(previous, current)
  expect(rows).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ category: 'records', dimension: null, value: 3 }),
      expect.objectContaining({
        category: 'records',
        dimensionValue: 'Hydrographic',
        value: 1,
      }),
      expect.objectContaining({
        category: 'records',
        dimensionValue: 'Topographic',
        value: 1,
      }),
      expect.objectContaining({
        category: 'changes',
        measure: 'changed_count',
        dimension: null,
        value: 1,
      }),
      expect.objectContaining({
        category: 'changes',
        measure: 'added_count',
        dimension: null,
        value: 1,
      }),
      expect.objectContaining({
        category: 'completeness',
        measure: 'locale_count',
        dimensionValue: 'zh-hant',
        value: 2,
      }),
    ]),
  )
  expect(rows.some(row => row.category === 'quality')).toBe(false)
})
