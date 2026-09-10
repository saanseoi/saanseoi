import { expect, test } from 'bun:test'
import type { PlaceAddressDefinition } from './placeAddressMatcher.ts'
import { suggestBuildingInitialVariants } from './placeAddressReviewSuggestions.ts'

const definition: PlaceAddressDefinition = {
  addressId: '0429912693T20050430',
  locale: 'en',
  formattedAddress: null,
  buildingName: 'TIN NING HSE',
  estateName: 'LUNG TIN ESTATE',
  streetName: null,
  buildingNumberExpression: null,
  buildingNumberFrom: null,
  buildingNumberTo: null,
  blockExpression: null,
  phaseExpression: null,
}
test('Tin Ling House suggests ALS Tin Ning Hse within Lung Tin Estate for review only', () => {
  expect(
    suggestBuildingInitialVariants('Tin Ling House', 'Lung Tin Estate', [definition]),
  ).toEqual([
    {
      addressId: definition.addressId,
      sourceBuildingName: 'Tin Ling House',
      canonicalBuildingName: 'TIN NING HSE',
      estateName: 'LUNG TIN ESTATE',
      reason: 'same-estate-single-l-n-initial',
      reviewRequired: true,
    },
  ])
})
test('does not suggest across estates or without estate context', () => {
  for (const estate of ['OTHER ESTATE', ''])
    expect(
      suggestBuildingInitialVariants('Tin Ling House', estate, [definition]),
    ).toEqual([])
})
test('does not accept arbitrary spelling changes or exact names as initial variants', () => {
  for (const name of ['Tin Ming House', 'Tin Long House', 'Tin Ning House'])
    expect(
      suggestBuildingInitialVariants(name, 'Lung Tin Estate', [definition]),
    ).toEqual([])
})
test('retains ambiguous suggestions rather than selecting one', () => {
  expect(
    suggestBuildingInitialVariants('Tin Ling House', 'Lung Tin Estate', [
      definition,
      { ...definition, addressId: 'other' },
    ]),
  ).toHaveLength(2)
})
