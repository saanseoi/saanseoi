import { retainDivisionProvenance as retainCore } from '@repo/core/pipeline/services/divisionProvenance'
import { retainRegisteredRule } from '../api/retainedRule'
export function retainDivisionProvenance(
  store: Parameters<typeof retainCore>[0],
  input: Parameters<typeof retainCore>[1],
) {
  return retainCore(store, {
    ...input,
    retainDeclaration: declaration => retainRegisteredRule(store, declaration),
  })
}
