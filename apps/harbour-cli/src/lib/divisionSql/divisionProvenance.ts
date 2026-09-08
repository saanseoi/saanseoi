import { retainDivisionProvenance as retainCore } from '@repo/core/pipeline/services/divisionProvenance'
import { retainRegisteredRule } from '../api/retainedRule'
import { identityCurationRule } from '../identityCurations'
import { syntheticHongKongAreaRule } from './processLocalDivisionGeometrySqlUploadSyntheticGeometry'
export function retainDivisionProvenance(
  store: Parameters<typeof retainCore>[0],
  input: Parameters<typeof retainCore>[1],
) {
  const syntheticActions = input.actions.filter(
    action => action.action === syntheticHongKongAreaRule.declaration.id,
  )
  const syntheticDistrictIds = new Set(
    syntheticActions.flatMap(action => {
      const evidence = action.evidence
      if (!evidence || typeof evidence !== 'object') return []
      const ids = (evidence as { districtDivisionIds?: unknown }).districtDivisionIds
      return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []
    }),
  )
  return retainCore(store, {
    ...input,
    identityCurationDefinition: identityCurationRule.declaration,
    actionDeclarations: {
      [syntheticHongKongAreaRule.declaration.id]: syntheticHongKongAreaRule.declaration,
      ...input.actionDeclarations,
    },
    actionCounts: {
      ...(syntheticActions.length
        ? {
            [syntheticHongKongAreaRule.declaration.id]: {
              inputs: {
                'district-land-geometries': syntheticDistrictIds.size,
                'exclusion-area': 1,
              },
              outputs: {
                divisionAreas: syntheticActions.reduce(
                  (count, action) => count + action.affectedRecordCount,
                  0,
                ),
              },
            },
          }
        : {}),
      ...input.actionCounts,
    },
    retainDeclaration: declaration => retainRegisteredRule(store, declaration),
  })
}
