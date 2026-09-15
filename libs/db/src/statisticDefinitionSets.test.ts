import { expect, test } from 'bun:test'
import { statisticDefinitionSet } from './statisticDefinitionSets'

test('definition selections share identity across key order and distinguish changed field meanings', () => {
  expect(statisticDefinitionSet({ population: 'v1', area: 'v2' })).toEqual(
    statisticDefinitionSet({ area: 'v2', population: 'v1' }),
  )
  expect(statisticDefinitionSet({ population: 'v1' }).id).not.toBe(
    statisticDefinitionSet({ population: 'v2' }).id,
  )
})
