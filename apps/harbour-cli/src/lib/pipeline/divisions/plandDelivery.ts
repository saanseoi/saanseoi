import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import type { SqlDeliveryPhase } from '../local/sqlDeliveryPhase.ts'
import { deliverResolvedSqlPhase } from '../local/resolvedSqlPhase.ts'
import { familyMutationTargets } from '../local/familyMutationPolicy.ts'

export type PlandDeliveryCounts = {
  importedRows: number
  changedRows: number
  deletedRows: number
}

export function readPlandDeliveryCounts(
  value: Record<string, unknown> | undefined,
): PlandDeliveryCounts {
  for (const key of ['importedRows', 'changedRows', 'deletedRows']) {
    if (!Number.isSafeInteger(value?.[key]) || (value?.[key] as number) < 0)
      throw new Error(`Invalid retained Planning Division ${key}.`)
  }
  return {
    importedRows: value!.importedRows as number,
    changedRows: value!.changedRows as number,
    deletedRows: value!.deletedRows as number,
  }
}

/** All preparation reads and writes use the same isolated candidate. */
export async function deliverPlandWorkflow(
  input: SqlDeliveryPhase,
  _planningContext: LocalAddressDbContext,
  generate: (context: LocalAddressDbContext) => Promise<PlandDeliveryCounts>,
) {
  const result = await deliverResolvedSqlPhase(
    {
      ...input,
      targets: familyMutationTargets(input.context, 'division'),
      publicationTables: ['divisionPublicationState'],
      validateOutputs: readPlandDeliveryCounts,
    },
    generate,
  )
  return readPlandDeliveryCounts(result)
}
