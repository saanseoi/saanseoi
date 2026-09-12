import { retainDivisionProvenance as retainCore } from '@repo/core/pipeline/services/divisions/divisionProvenance'
import { retainRegisteredRule } from '../../api/retainedRule'
import { identityCurationRule } from '../../identityCurations'
import { overtureHongKongAreaGeometryPatchDeclaration } from './processLocalDivisionGeometrySqlUploadSyntheticGeometry'
import geometryPatchFixture from '../../../../../../fixtures/meta/patches/overture-hong-kong-area-geometry-restoration.json'
export function retainDivisionProvenance(
  store: Parameters<typeof retainCore>[0],
  input: Parameters<typeof retainCore>[1],
) {
  return retainCore(store, {
    ...input,
    identityCurationDefinition: identityCurationRule.declaration,
    patchDefinitions: {
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
