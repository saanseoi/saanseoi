import fixture from '../../../../../../fixtures/meta/curations/saanseoi-division/division-hierarchy.json'
import pins from '../../../../../../fixtures/meta/datasetInputs/saanseoi-division-review.json'
import declaration from '../../../../../../fixtures/meta/processing-rules/assembly/geographic-hierarchy-patch.json'
import { registerRule, ruleDeclarationFromFixture } from '../../../provenance'
import type { DivisionHierarchies } from '@repo/db'
import type { ReviewInventory } from './geographicReview'
import { curationHierarchy } from './curationInventory'

export const geographicHierarchyFixture = fixture
export const geographicHierarchyPatchRule = registerRule(
  ruleDeclarationFromFixture(declaration),
  (input: {
    id: string
    class: string
    hierarchies: DivisionHierarchies
    inventory: ReviewInventory
  }) => {
    const entry = curationHierarchy(input.inventory).entries.find(
      row => row.divisionId === input.id,
    )
    if (!entry) return input.hierarchies
    if (entry.expectedClass !== input.class)
      throw Error('Geographic hierarchy curation does not match the selected division.')
    return structuredClone(entry.hierarchies)
  },
)

export function buildGeographicHierarchyProcessingActions(
  id: string,
  source: { source: string; regionCode?: string; sourceVersion?: string },
  names: string[] = [],
): import('../../../provenance/processingAction').ReleaseProcessingAction[] {
  if (
    source.source !== 'overture' ||
    source.regionCode !== 'hk' ||
    source.sourceVersion !== pins.cohort
  )
    return []
  const decision = fixture.entries.find(row => row.divisionId === id)
  if (!decision) return []
  return [
    {
      action: geographicHierarchyPatchRule.declaration.id,
      affectedRecordCount: 1,
      mode: 'automatic',
      summary: `Retained explicit geographic ancestry for ${names[0] ?? id}.`,
      evidence: {
        divisionId: id,
        names,
        cohort: pins.cohort,
        fixturePointer: `/entries/${fixture.entries.indexOf(decision)}`,
        parentIds: [...new Set(decision.paths.flat())],
        reason: decision.reason,
      },
    },
  ]
}
