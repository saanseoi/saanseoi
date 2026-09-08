import { retainDivisionProvenance as retainCore } from '@repo/core/pipeline/services/divisionProvenance'
import { retainRegisteredRule } from '../api/retainedRule'
import { identityCurationRule } from '../identityCurations'
import { syntheticHongKongAreaRule } from './processLocalDivisionGeometrySqlUploadSyntheticGeometry'
export function retainDivisionProvenance(
  store: Parameters<typeof retainCore>[0],
  input: Parameters<typeof retainCore>[1],
) {
  return retainCore(store, {
    ...input,
    identityCurationDefinition: identityCurationRule.declaration,
    actionDeclarations: {
      [syntheticHongKongAreaRule.declaration.id]: syntheticHongKongAreaRule.declaration,
      ...input.actionDeclarations,
    },
    retainDeclaration: declaration => retainRegisteredRule(store, declaration),
  })
}
