import { expect, test } from 'bun:test'
import {
  formatPlaceAddressComponents,
  deferChineseAddressReview,
  reviewPlaceAddressCurations,
} from './placeAddressCurationUi.ts'

test('Chinese and mixed-language source addresses are deferred, English remains reviewable', () => {
  expect(
    deferChineseAddressReview({ sourceTexts: ['香港葵涌梨木道79號亞洲貿易中心'] }),
  ).toBe(true)
  expect(
    deferChineseAddressReview({ sourceTexts: ['Asia Trade Centre', '亞洲貿易中心'] }),
  ).toBe(true)
  expect(deferChineseAddressReview({ sourceTexts: ['79 Lei Muk Road 香港'] })).toBe(
    true,
  )
  expect(
    deferChineseAddressReview({ sourceTexts: ['Asia Trade Centre, 79 Lei Muk Road'] }),
  ).toBe(false)
})

test('component colours have text labels and source control sequences are stripped', () => {
  const value = {
    buildingName: 'Citygate\u001b[2J',
    streetName: 'Tat Tung Road',
    buildingNumberExpression: '20',
  }
  expect(formatPlaceAddressComponents(value, true)).toContain(
    '\u001b[36mBuilding: Citygate [2J\u001b[0m',
  )
  expect(formatPlaceAddressComponents(value, true)).toContain('\u001b[32mNumber: 20')
  expect(formatPlaceAddressComponents(value, false)).not.toContain('\u001b')
  expect(formatPlaceAddressComponents(value, false)).toContain('Street: Tat Tung Road')
})

test('non-interactive review never opens or modifies a policy', async () => {
  if (process.stdin.isTTY) return
  expect(
    await reviewPlaceAddressCurations({
      rows: (async function* () {})(),
      definitions: [],
      geometry: new Map(),
      curationPath: '/missing/policy.json',
      sourceRelease: '2025-09-24.0',
      total: 1,
    }),
  ).toBe(0)
})
