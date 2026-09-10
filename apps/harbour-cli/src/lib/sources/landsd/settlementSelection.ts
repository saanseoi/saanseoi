import { registerRule, ruleDeclarationFromFixture } from '@repo/core/provenance'
import fixture from '../../../../../../fixtures/meta/processing-rules/landsd-settlement-selection.json'

export const landsdSettlementSelectionRule = registerRule(
  { ...ruleDeclarationFromFixture(fixture), parameters: fixture.parameters },
  (properties: Record<string, unknown>, parameters) => {
    const value = properties.PLACE_CLASS
    if (value === parameters.includedClass) return 'selected'
    if (typeof value !== 'string' || value.trim() === '') return 'missing-class'
    if (parameters.excludedClasses.includes(value)) return value
    return 'unexpected-class'
  },
)

/** Counts source eligibility, not successful downstream materialisation. */
export function landsdSettlementSelectionAudit(properties: Record<string, unknown>[]) {
  const decisions: Record<string, number> = {
    selected: 0,
    Hydrographic: 0,
    Topographic: 0,
    'missing-class': 0,
    'unexpected-class': 0,
  }
  for (const record of properties) {
    const outcome = landsdSettlementSelectionRule.execute(record)
    decisions[outcome] = (decisions[outcome] ?? 0) + 1
  }
  const selected = decisions.selected ?? 0
  return {
    declaration: landsdSettlementSelectionRule.declaration,
    inputs: { 'native-place-name-records': properties.length },
    outputs: {
      'selected-settlements': selected,
      'excluded-from-divisions': properties.length - selected,
    },
    recordsAffected: properties.length,
    decisions,
  }
}
