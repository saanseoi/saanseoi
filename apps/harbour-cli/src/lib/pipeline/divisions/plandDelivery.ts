import { currentSchema, historySchema, metaSchema, sourceSchema } from '@repo/db'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import { captureNativePlanningCopy } from '../local/nativePlanningCopy.ts'
import {
  prepareNativeSqlDelivery,
  runNativeSqlDelivery,
} from '../local/nativeSqlDelivery.ts'
import {
  deliverSqlPhase,
  sqlDeliveryPhaseDirectory,
  type SqlDeliveryPhase,
} from '../local/sqlDeliveryPhase.ts'

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
  return value as PlandDeliveryCounts
}

/** Local writers run only on disposable copies; remote writers use their scoped mirror. */
export async function deliverPlandWorkflow(
  input: SqlDeliveryPhase,
  planningContext: LocalAddressDbContext,
  generate: (context: LocalAddressDbContext) => Promise<PlandDeliveryCounts>,
) {
  if (input.context.state.target !== 'local') {
    let outputs: PlandDeliveryCounts | undefined
    const result = await deliverSqlPhase(
      {
        ...input,
        captureOutputs: () => ({ ...outputs }),
        validateOutputs: readPlandDeliveryCounts,
      },
      async () => {
        outputs = await generate(planningContext)
      },
    )
    return readPlandDeliveryCounts(result)
  }
  const context = input.context
  const files = context.state.files
  const history = context.historyBinding?.bindingName
  const source = context.sourceBinding?.bindingName
  if (!files || !history || !source)
    throw new Error('Planning delivery requires named native database files.')
  const schemas = {
    DB_META: metaSchema,
    DB_CURRENT: currentSchema,
    [history]: historySchema,
    [source]: sourceSchema,
  }
  const targets = Object.fromEntries(
    Object.entries(schemas).map(([binding, schema]) => {
      const path = files[binding]
      if (!path) throw new Error(`Missing Planning database ${binding}.`)
      return [binding, { path, schema }]
    }),
  )
  const directory = sqlDeliveryPhaseDirectory(input)
  const plan = await prepareNativeSqlDelivery({
    ...input,
    directory,
    files: Object.fromEntries(
      Object.entries(targets).map(([name, target]) => [name, target.path]),
    ),
    ownershipDirectory: context.state.dbCacheDir,
    generate: append =>
      captureNativePlanningCopy({
        targets,
        append,
        generate: databases =>
          generate({
            ...context,
            metaDb: databases.DB_META as unknown as typeof context.metaDb,
            currentDb: databases.DB_CURRENT as unknown as typeof context.currentDb,
            historyDb: databases[history] as unknown as typeof context.historyDb,
            sourceDb: databases[source] as unknown as typeof context.sourceDb,
          }),
      }),
  })
  const counts = readPlandDeliveryCounts(plan.outputs)
  await runNativeSqlDelivery(directory, { files, onProgress: input.onProgress })
  return counts
}
