import { expect, test } from 'bun:test'
import {
  checkPreparedHierarchy,
  finishPreparationRules,
  normaliseAuditedIngredient,
} from './preparationRules'
import {
  overtureHongKongAreas,
  overtureHongKongAreaDivisionId,
  OVERTURE_HONG_KONG_SAR_DIVISION_ID,
} from '@repo/core/pipeline/services/divisions/overtureHongKongAreas'
import type { BranchCounts } from '@repo/core/provenance'

const sar = { id: OVERTURE_HONG_KONG_SAR_DIVISION_ID, class: 'sar', level: 0 }
const area = {
  id: overtureHongKongAreaDivisionId(overtureHongKongAreas[0].code)!,
  class: 'area',
  level: 1,
}
const district = {
  id: 'district',
  class: 'district',
  level: 2,
  hierarchies: { administrative: [[sar, area]], full: [[sar, area]] },
}
const names = [
  {
    divisionId: district.id,
    locale: 'en',
    name: overtureHongKongAreas[0].districtNames[0],
  },
]

test('checks final administrative paths, including each branch of shared ancestry', () => {
  const child = {
    id: 'child',
    class: 'islet',
    level: null,
    hierarchies: {
      full: [[sar, area, district]],
      administrative: [
        [sar, area, district],
        [sar, area, district],
      ],
    },
  }
  expect(checkPreparedHierarchy([sar, area, district, child], names)).toMatchObject({
    status: 'passed',
    checked: 2,
    failed: 0,
  })
  child.hierarchies.administrative[1] = [sar, district]
  expect(checkPreparedHierarchy([sar, area, district, child], names)).toMatchObject({
    status: 'failed',
    checked: 2,
    failed: 1,
  })
  expect(
    checkPreparedHierarchy(
      [sar, area, { ...district, hierarchies: { administrative: [] } }],
      names,
    ),
  ).toMatchObject({ status: 'failed', checked: 1 })
})

test('counts executed normalisation only for final identities and distinguishes changed locales', () => {
  const counts = new Map<string, BranchCounts>()
  const raw = {
    id: 'one',
    subtype: 'locality',
    class: 'hamlet',
    names: { primary: '香港' },
  }
  normaliseAuditedIngredient(raw, counts)
  normaliseAuditedIngredient({ ...raw, id: 'excluded' }, counts)
  const evidence = finishPreparationRules(
    {
      records: [
        { id: 'one', class: 'hamlet', level: 6, hierarchies: { administrative: [] } },
      ],
      names: [],
      changes: [
        {
          id: 'one',
          names: {
            before: [{ locale: 'en', name: 'Name' }],
            after: [
              { locale: 'en', name: 'Name' },
              { locale: 'zh-hant', name: '香港' },
            ],
          },
        },
      ],
    },
    counts,
    new Map([['one', raw]]),
  )
  expect(evidence.normalised).toBe(1)
  expect(evidence.branches['level.locality.hamlet']).toEqual({ matched: 1, changed: 1 })
  expect(evidence.branches['inference.han']).toEqual({ matched: 1, changed: 1 })
  expect(evidence.branches['prepared-locale.en.present']).toEqual({
    matched: 1,
    changed: 0,
  })
  expect(evidence.branches['prepared-locale.zh-hant.present']).toEqual({
    matched: 1,
    changed: 1,
  })
  expect(evidence.branches['prepared-locale.zh-hans.absent']).toEqual({
    matched: 1,
    changed: 0,
  })
})

test('rejects broken full ancestry even when administrative ancestry passes', () => {
  const child = {
    id: 'child',
    class: 'hamlet',
    level: 6,
    hierarchies: { administrative: [[sar, area, district]], full: [[sar, district]] },
  }
  expect(checkPreparedHierarchy([sar, area, district, child], names)).toMatchObject({
    failed: 1,
  })
  child.hierarchies.full = [[sar, area, district]]
  expect(checkPreparedHierarchy([sar, area, district, child], names)).toMatchObject({
    failed: 0,
  })
  child.hierarchies.full = []
  expect(checkPreparedHierarchy([sar, area, district, child], names)).toMatchObject({
    failed: 1,
  })
})

test('rejects different district ancestry between administrative and full paths', () => {
  const other = { ...district, id: 'other-district' }
  const child = {
    id: 'child',
    class: 'hamlet',
    level: 6,
    hierarchies: {
      administrative: [[sar, area, district]],
      full: [[sar, area, other]],
    },
  }
  expect(
    checkPreparedHierarchy(
      [sar, area, district, other, child],
      [
        ...names,
        {
          divisionId: other.id,
          locale: 'en',
          name: overtureHongKongAreas[0].districtNames[1],
        },
      ],
    ),
  ).toMatchObject({ status: 'failed', checked: 3, failed: 1 })
})
