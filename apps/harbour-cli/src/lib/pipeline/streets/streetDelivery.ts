import { join } from 'node:path'
import { currentSchema, historySchema, metaSchema, sourceSchema } from '@repo/db'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { captureNativePlanningCopy } from '../local/nativePlanningCopy.ts'
import { deliverSqlPhase } from '../local/sqlDeliveryPhase.ts'
import { executeSqlText } from '../local/sqlImport.ts'

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
  return value as StreetDeliveryCounts
}

/** Seal source, history, projection and preparation evidence into one resumable delivery. */
export async function deliverStreetWorkflow(
  context: LocalAddressDbContext,
  releaseId: string,
  inputs: Record<string, unknown>,
  generate: (context: LocalAddressDbContext) => Promise<StreetDeliveryCounts>,
) {
  const history =
    context.historyBinding?.bindingName ??
    context.historyTargets.find(item => item.db === context.historyDb)?.bindingName
  const source =
    context.sourceBinding?.bindingName ??
    context.sourceTargets.find(item => item.db === context.sourceDb)?.bindingName
  if (!history || !source)
    throw new Error('Street delivery requires named source/history bindings.')
  const schemas = {
    DB_META: metaSchema,
    DB_CURRENT: currentSchema,
    [history]: historySchema,
    [source]: sourceSchema,
  }
  const targets = Object.fromEntries(
    Object.entries(schemas).map(([binding, schema]) => [
      binding,
      {
        path:
          context.state.files?.[binding] ??
          join(context.state.dbCacheDir, `${binding}.sqlite`),
        schema,
      },
    ]),
  )
  let outputs: StreetDeliveryCounts | undefined
  const result = await deliverSqlPhase(
    {
      context,
      releaseId,
      phase: 'street-data',
      nativeLocal: true,
      inputs,
      captureOutputs: () => ({ ...outputs }),
      validateOutputs: readStreetDeliveryCounts,
    },
    async () => {
      outputs = await captureNativePlanningCopy({
        targets,
        append: async (target, bytes) => {
          const binding = target.bindingName!
          await executeSqlText(
            {
              binding: { bindingName: binding },
              databaseId:
                context.state.target === 'local'
                  ? binding
                  : (context.state.bindings[binding]?.databaseId ?? null),
              name:
                binding === 'DB_CURRENT'
                  ? 'current'
                  : binding === 'DB_META'
                    ? 'meta'
                    : binding === history
                      ? 'history'
                      : 'source',
            },
            new TextDecoder().decode(bytes),
            { isLocal: context.state.target === 'local' },
          )
        },
        generate: databases =>
          generate({
            ...context,
            metaDb: databases.DB_META as unknown as typeof context.metaDb,
            currentDb: databases.DB_CURRENT as unknown as typeof context.currentDb,
            historyDb: databases[history] as unknown as typeof context.historyDb,
            sourceDb: databases[source] as unknown as typeof context.sourceDb,
          }),
      })
    },
  )
  return readStreetDeliveryCounts(result)
}
