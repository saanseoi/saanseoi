import fixture from '../../../../../../fixtures/divisions/hk/geographic-hierarchy-patch.json'
import declaration from '../../../../../../fixtures/meta/processing-rules/assembly/geographic-hierarchy-patch.json'
import {
  registerRule,
  ruleDeclarationFromFixture,
  ProcessingGuardError,
} from '../../../provenance'
import type { DivisionHierarchies } from '@repo/db'
import type { HierarchyPatch } from './geographicReview'

export const geographicHierarchyFixture = fixture as HierarchyPatch
const patch = geographicHierarchyFixture
const entries = new Map(patch.entries.map(entry => [entry.divisionId, entry]))
if (
  patch.schemaVersion !== 1 ||
  patch.kind !== 'geographic-hierarchy-patch' ||
  patch.domain !== 'geographic' ||
  entries.size !== patch.entries.length
)
  throw new Error('Invalid geographic hierarchy patch.')
for (const entry of patch.entries) {
  for (const paths of Object.values(entry.hierarchies))
    for (const path of paths) {
      if (
        new Set(path.map(parent => parent.id)).size !== path.length ||
        path.some(parent => parent.id === entry.divisionId || !entries.has(parent.id))
      )
        throw new Error(`Invalid geographic hierarchy path for ${entry.divisionId}.`)
    }
}

export const geographicHierarchyPatchRule = registerRule(
  ruleDeclarationFromFixture(declaration),
  (input: {
    id: string
    class: string
    hierarchies: DivisionHierarchies
    source?: { source: string; regionCode?: string; sourceVersion?: string }
  }) => {
    if (
      input.source?.source !== 'overture' ||
      input.source.regionCode !== patch.region ||
      input.source.sourceVersion !== patch.cohort
    )
      return input.hierarchies
    const entry = entries.get(input.id)
    if (!entry || entry.status === 'unresolved' || entry.expectedClass !== input.class)
      throw new ProcessingGuardError(
        'Geographic hierarchy fixture does not match the selected division.',
        [
          {
            id: 'geographic-hierarchy-patch',
            summary: 'Require the reviewed cohort and canonical identity/class.',
            consequence: 'block-ingestion',
            status: 'failed',
            checked: 1,
            failed: 1,
            reason: `Review ${input.id} before applying the geographic hierarchy patch.`,
          },
        ],
      )
    return structuredClone(entry.hierarchies)
  },
)

export function buildGeographicHierarchyProcessingActions(
  id: string,
  source: { source: string; regionCode?: string; sourceVersion?: string },
  names: string[] = [],
): import('../../db/processingActions').ReleaseProcessingAction[] {
  if (
    source.source !== 'overture' ||
    source.regionCode !== patch.region ||
    source.sourceVersion !== patch.cohort
  )
    return []
  const decision = entries.get(id)
  if (!decision || decision.status === 'unresolved') return []
  return [
    {
      action: geographicHierarchyPatchRule.declaration.id,
      affectedRecordCount: 1,
      mode: 'automatic',
      summary: `Applied ${decision.status} geographic ancestry for ${names[0] ?? id}.`,
      evidence: {
        divisionId: id,
        names,
        cohort: patch.cohort,
        status: decision.status,
        fixturePointer: `/entries/${patch.entries.indexOf(decision)}`,
        parentIds: decision.parentIds,
        competingParentIds: decision.competingParentIds,
        geometryEvidence: decision.evidence,
      },
    },
  ]
}
