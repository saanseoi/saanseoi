import { registerRule, ruleDeclarationFromFixture } from '@repo/core/provenance'
import ruleFixture from '../../../../../../fixtures/meta/processing-rules/place-address-analysis.json'
import type { PlaceRecordCache } from './placeRecordCache.ts'
import type { PlaceAddressDefinition } from './placeAddressMatcher.ts'
import {
  createSupplementaryAddressAnalyserInternal,
  type AddressObservation,
  type PreviousAddressLink,
  type SupplementaryCuration,
} from './supplementaryPlaceAddress.ts'
import { reuseAddressAnalysis } from './placeAddressAnalysisCache.ts'

export const placeAddressAnalysisRule = registerRule(
  ruleDeclarationFromFixture(ruleFixture),
  (input: {
    definitions: PlaceAddressDefinition[]
    officialIds: Set<string>
    geometry: Map<string, { lng: number; lat: number }>
    fixture: SupplementaryCuration
    recordCache?: PlaceRecordCache
  }) => {
    let analyse:
      | ReturnType<typeof createSupplementaryAddressAnalyserInternal>
      | undefined
    return (observation: AddressObservation, previous: PreviousAddressLink | null) => {
      analyse ??= createSupplementaryAddressAnalyserInternal(
        input.definitions,
        input.officialIds,
        input.geometry,
        input.fixture,
        input.recordCache,
      )
      return analyse(observation, previous)
    }
  },
)

export function createSupplementaryAddressAnalyser(
  definitions: PlaceAddressDefinition[],
  officialIds: Set<string>,
  geometry: Map<string, { lng: number; lat: number }>,
  fixture: SupplementaryCuration,
  recordCache?: PlaceRecordCache,
  compactResolved = false,
) {
  const analyse = placeAddressAnalysisRule.execute({
    definitions,
    officialIds,
    geometry,
    fixture,
    recordCache,
  })
  return reuseAddressAnalysis(
    analyse,
    definitions,
    officialIds,
    geometry,
    fixture,
    recordCache,
    compactResolved,
  )
}
