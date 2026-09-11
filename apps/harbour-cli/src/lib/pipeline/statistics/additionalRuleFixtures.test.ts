import { expect, test } from 'bun:test'
import { wkbGeometryRule } from '@repo/core/pipeline/services/divisions/division'
import { censtatdSourceAssertionRule } from './processLocalHkgovCenstatdDistrictStatisticSqlUpload'
import { censtatdDistrictIdentityRule } from './censtatdDistrictBridge'
import {
  divisionAreaGeometryRule,
  divisionBoundaryGeometryRule,
} from '@repo/core/pipeline/services/divisions/divisionGeometry'
import { freezeRegisteredRule } from '../../api/retainedRule'
import sourceFixture from '../../../../../../fixtures/meta/processing-rules/censtatd-source-assertion.json'
import bridgeFixture from '../../../../../../fixtures/meta/processing-rules/censtatd-district-identity.json'
import wkbFixture from '../../../../../../fixtures/meta/processing-rules/wkb-geometry.json'

test('remaining rules expose the exact definitions consumed by their executors', () => {
  for (const [rule, fixture] of [
    [wkbGeometryRule, wkbFixture],
    [censtatdSourceAssertionRule, sourceFixture],
    [censtatdDistrictIdentityRule, bridgeFixture],
  ] as const)
    expect<unknown>(rule.declaration).toEqual(fixture)
  expect(wkbGeometryRule.execute(null)).toBeNull()
  expect(wkbGeometryRule.execute({ type: 'Point', coordinates: [114, 22] })).toEqual({
    type: 'Point',
    coordinates: [114, 22],
  })
})

test('source assertions validate periods and retain native evidence', async () => {
  const row = {
    id: 'fixture-record',
    reference_period_code: '2021',
    district_code: 1,
    name_en: 'Test district',
    name_zh_hant: '測試',
    land_area_sq_km: 1,
    mid_year_population_density_per_sq_km: 10,
    mid_year_population: 10,
    properties: '{"test":1}',
    source_geometry: 'null',
    reference_period_end_year: '2021',
    reference_period_granularity: 'year',
    sources: '[]',
  }
  const result = await censtatdSourceAssertionRule.execute([
    row,
    'release-id',
    'release-code',
    '2021',
  ])
  expect(result.properties).toEqual({ test: 1 })
  expect(result.sourceRecordId).toBe('fixture-record')
  expect(result.releaseId).toBe('release-id')
  const { properties: _, ...incomplete } = row
  await expect(
    censtatdSourceAssertionRule.execute([incomplete, 'r', 'r', '2021']),
  ).rejects.toThrow('source properties are missing; prepare the release again')
  await expect(
    censtatdSourceAssertionRule.execute([row, 'r', 'r', '2022']),
  ).rejects.toThrow('reference_period_code')
})

test('both geometry audits freeze the same dependency and its implementation revision', async () => {
  const area = await freezeRegisteredRule(divisionAreaGeometryRule.declaration)
  const boundary = await freezeRegisteredRule(divisionBoundaryGeometryRule.declaration)
  expect(area.dependencies).toEqual(boundary.dependencies)
  expect(area.dependencies?.[0]?.id).toBe('exclude-division-geometry')
  expect(area.dependencies?.[0]?.implementation).toHaveProperty('revision')
})
