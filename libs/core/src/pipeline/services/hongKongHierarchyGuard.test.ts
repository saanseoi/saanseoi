import { expect, test } from 'bun:test'
import {
  checkHongKongHierarchy,
  createHongKongHierarchyGuard,
} from './hongKongHierarchyGuard'
import { normaliseDivisionRow, divisionNormalisationRule } from './division'
import {
  OVERTURE_HONG_KONG_SAR_DIVISION_ID,
  overtureHongKongAreaDivisionId,
} from './overtureHongKongAreas'
import { auditActionCategory, type IndividualAudit } from '../../provenance'

const sar = {
  division_id: OVERTURE_HONG_KONG_SAR_DIVISION_ID,
  level: 0,
  type: 'sar',
  i18n: {},
}
const area = {
  division_id: overtureHongKongAreaDivisionId('new-territories')!,
  level: 1,
  type: 'area',
  i18n: {},
}
const district = {
  division_id: 'north',
  level: 2,
  type: 'district',
  i18n: { en: { name: 'North District' } },
}
const child = {
  id: 'village',
  country: 'HK',
  type: 'village',
  level: 5,
  hierarchy: [sar, area, district],
}

test('bulk normalisation inserts Area before the independent guard checks it', () => {
  const hierarchyGuard = createHongKongHierarchyGuard()
  const result = normaliseDivisionRow(
    {
      id: 'north',
      country: 'HK',
      subtype: 'region',
      names: { common: { en: 'North District' } },
      hierarchies: [
        [
          {
            division_id: sar.division_id,
            subtype: 'dependency',
            name: 'Hong Kong SAR',
          },
        ],
      ],
    },
    { hierarchyGuard },
  )
  expect(result.base.hierarchy).toMatchObject([
    sar,
    { division_id: area.division_id, level: 1, type: 'area' },
  ])
  expect(hierarchyGuard).toMatchObject({ status: 'passed', checked: 1, failed: 0 })
})

test('district descendants require a single correctly ordered recognised Area', () => {
  const guard = createHongKongHierarchyGuard()
  checkHongKongHierarchy(child, guard)
  expect(guard.status).toBe('passed')
  for (const hierarchy of [
    [sar, district],
    [area, sar, district],
    [sar, { ...area, division_id: 'wrong-area' }, district],
    [sar, area, area, district],
    [sar, area, { ...district, level: 3 }],
    [sar, area, { ...district, i18n: { en: { name: 'Unrecognised District' } } }],
  ]) {
    expect(() => checkHongKongHierarchy({ ...child, hierarchy })).toThrow(
      'Requires reviewed hierarchy resolution',
    )
  }
})

test('reviewed replacements defer only the intermediate hierarchy guard', () => {
  const hierarchyGuard = createHongKongHierarchyGuard()
  const row = {
    id: '17009785-57fd-4e5b-af86-2d27352e4718',
    country: 'HK',
    subtype: 'locality',
    names: { common: { en: 'Kowloon' } },
    hierarchies: [
      [
        { division_id: sar.division_id, subtype: 'dependency', name: 'Hong Kong SAR' },
        { division_id: 'district', subtype: 'region', name: 'Yau Tsim Mong District' },
      ],
    ],
  }
  expect(() => normaliseDivisionRow(row)).toThrow(
    'Requires reviewed hierarchy resolution',
  )
  normaliseDivisionRow(row, { hierarchyGuard, deferHierarchyGuard: true })
  expect(hierarchyGuard.checked).toBe(0)
  const final = normaliseDivisionRow(
    { ...row, hierarchies: [[row.hierarchies[0]![0]!]] },
    { hierarchyGuard },
  )
  expect(final.base.type).toBe('area')
  expect(final.base.hierarchy).toHaveLength(1)
  expect(() =>
    normaliseDivisionRow({ ...row, id: '' }, { deferHierarchyGuard: true }),
  ).toThrow('missing `id`')
})

test('unknown districts fail after attempted normalisation; unrelated branches are not inferred', () => {
  const guard = createHongKongHierarchyGuard()
  expect(() =>
    normaliseDivisionRow(
      {
        id: 'unknown',
        country: 'HK',
        subtype: 'region',
        names: { common: { en: 'Unknown District' } },
      },
      { hierarchyGuard: guard },
    ),
  ).toThrow('Requires reviewed hierarchy resolution')
  expect(guard).toMatchObject({ status: 'failed', checked: 1, failed: 1 })
  const irrelevant = createHongKongHierarchyGuard()
  checkHongKongHierarchy({ ...child, country: 'MO', hierarchy: [] }, irrelevant)
  checkHongKongHierarchy({ ...child, hierarchy: [sar] }, irrelevant)
  expect(irrelevant).toMatchObject({ status: 'not-applicable', checked: 0 })
})

test('registered QA corrections are patches, while area assignment remains a code rule', () => {
  expect(divisionNormalisationRule.declaration).toMatchObject({
    basis: 'code',
    scope: 'bulk',
  })
  const action = (operation: string, basis: 'code' | 'fixture') =>
    ({ operation, basis }) as IndividualAudit
  expect(
    auditActionCategory(
      action('overture_hong_kong_lok_ma_chau_loop_reclassified', 'fixture'),
    ),
  ).toBe('patches')
  expect(
    auditActionCategory(
      action('overture_division_hong_kong_area_hierarchy_assigned', 'code'),
    ),
  ).toBe('rules')
})
