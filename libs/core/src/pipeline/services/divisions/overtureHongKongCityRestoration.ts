import fixture from '../../../../../../fixtures/meta/patches/overture-hong-kong-city-restoration.json'
import type { ReleaseProcessingAction } from '../../db/processingActions'
import type { RuleDeclaration } from '../../../provenance'
import { overtureHongKongCities } from './overtureHongKongCities'

export const overtureHongKongCityRestorationFixture = fixture
export const overtureHongKongCityRestorationDeclaration: RuleDeclaration = {
  kind: 'processing-rule',
  schemaVersion: 1,
  id: fixture.id,
  scope: 'individual',
  basis: 'fixture',
  review: { kind: 'patch' },
  summary: fixture.reason,
  inputs: ['source-divisions'],
  outputs: ['divisions'],
  parameters: {},
  implementation: {
    path: 'libs/core/src/pipeline/services/divisions/overtureHongKongCityRestoration.ts',
    symbol: 'overtureHongKongCityRestorationActions',
  },
}

export function overtureHongKongCityRestorationActions(
  supplementalRows: readonly Record<string, unknown>[],
): ReleaseProcessingAction[] {
  // Kowloon has its own retained restoration declaration.
  const city = overtureHongKongCities[1]
  const replacement = supplementalRows.find(row => row.id === city.id)
  if (!replacement) return []
  return [
    {
      action: fixture.id,
      affectedRecordCount: 1,
      mode: 'automatic',
      summary: fixture.reason,
      evidence: {
        decision: 'restore-missing-source-row',
        divisionId: city.id,
        names: Object.values(city.names),
        reason: fixture.reason,
        districtNames: [...city.districtNames],
        replacement,
      },
    },
  ]
}
