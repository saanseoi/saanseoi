import { retainDivisionProvenance as retainCore } from '@repo/core/pipeline/services/divisions/divisionProvenance'
import { retainRegisteredRule } from '../../api/retainedRule'
import { identityCurationRule } from '../../identityCurations'
import { overtureHongKongAreaGeometryPatchDeclaration } from './processLocalDivisionGeometrySqlUploadSyntheticGeometry'
import geometryPatchFixture from '../../../../../../fixtures/meta/patches/overture-hong-kong-area-geometry-restoration.json'
import administrativeHierarchyDeclaration from '../../../../../../fixtures/meta/processing-rules/assembly/native-administrative-hierarchy.json'
import administrativeHierarchyPins from '../../../../../../fixtures/meta/datasetInputs/native-division-administrative-hierarchy.json'
import { ruleDeclarationFromFixture } from '@repo/core/provenance'
export function retainDivisionProvenance(
  store: Parameters<typeof retainCore>[0],
  input: Parameters<typeof retainCore>[1],
) {
  const inferred = input.actions.filter(
    action => action.action === administrativeHierarchyDeclaration.id,
  )
  const inferenceFixture = {
    inputs: administrativeHierarchyPins,
    policy: administrativeHierarchyDeclaration.parameters,
    entries: inferred.map(action => action.evidence),
  }
  return retainCore(store, {
    ...input,
    actions: input.actions.map(action =>
      action.action === administrativeHierarchyDeclaration.id
        ? {
            ...action,
            evidence: {
              ...(action.evidence as Record<string, unknown>),
              fixturePointer: `/entries/${inferred.indexOf(action)}`,
            },
          }
        : action,
    ),
    identityCurationDefinition: identityCurationRule.declaration,
    patchDefinitions: {
      [administrativeHierarchyDeclaration.id]: {
        declaration: ruleDeclarationFromFixture(administrativeHierarchyDeclaration),
        fixture: inferenceFixture,
        reason: administrativeHierarchyDeclaration.summary,
      },
      [overtureHongKongAreaGeometryPatchDeclaration.id]: {
        declaration: overtureHongKongAreaGeometryPatchDeclaration,
        fixture: geometryPatchFixture,
        reason: geometryPatchFixture.reason,
      },
      ...input.patchDefinitions,
    },
    retainDeclaration: declaration => retainRegisteredRule(store, declaration),
  })
}

export { retainDivisionSourceAudit } from './divisionSourceAudit'
