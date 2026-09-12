import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { deliverResolvedSqlPhase } from '../local/resolvedSqlPhase.ts'
import { familyMutationTargets } from '../local/familyMutationPolicy.ts'

export type StreetDeliveryCounts = {
  importedRows: number
  changedRows: number
  sourceRowsChanged: number
}

export function readStreetDeliveryCounts(
  value: Record<string, unknown> | undefined,
): StreetDeliveryCounts {
  for (const key of ['importedRows', 'changedRows', 'sourceRowsChanged'])
    if (!Number.isSafeInteger(value?.[key]) || (value?.[key] as number) < 0)
      throw new Error(`Invalid retained Street ${key}.`)
  return {
    importedRows: value!.importedRows as number,
    changedRows: value!.changedRows as number,
    sourceRowsChanged: value!.sourceRowsChanged as number,
  }
}

/** Resolve source, history and current locally before sealing final mutations. */
export async function deliverStreetWorkflow(
  context: LocalAddressDbContext,
  releaseId: string,
  inputs: Record<string, unknown>,
  generate: (context: LocalAddressDbContext) => Promise<StreetDeliveryCounts>,
) {
  const result = await deliverResolvedSqlPhase(
    {
      context,
      releaseId,
      phase: 'street-data',
      inputs,
      targets: familyMutationTargets(context, 'street'),
      publicationTables: ['streetPublicationState'],
      validateOutputs: readStreetDeliveryCounts,
    },
    generate,
  )
  return readStreetDeliveryCounts(result)
}
