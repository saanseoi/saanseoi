import { createHash } from 'node:crypto'
import { currentSchema, historySchema, sourceSchema } from '@repo/db'
import { captureNativePlanningCopy } from '../localPipeline/nativePlanningCopy.ts'
import {
  prepareNativeSqlDelivery,
  runNativeSqlDelivery,
} from '../localPipeline/nativeSqlDelivery.ts'
import { sqlDeliveryPhaseDirectory } from '../localPipeline/sqlDeliveryPhase.ts'
import { writeGeometryRows } from './processLocalDivisionGeometrySqlUploadRows.ts'
import { readDeliveryPlan } from '../localPipeline/sqlDeliveryFiles.ts'

type Churn = Awaited<ReturnType<typeof writeGeometryRows>>['churn']

export async function readNativeGeometryVersion(
  context: Parameters<typeof writeGeometryRows>[0],
  releaseId: string,
  type: Parameters<typeof writeGeometryRows>[1],
  transform?: 'simplified',
) {
  if (context.state.target !== 'local') return null
  const plan = await readDeliveryPlan(
    sqlDeliveryPhaseDirectory({
      context,
      releaseId,
      phase: `native-geometry-${type.toLowerCase()}-${transform ?? 'exact'}`,
      inputs: {},
    }),
  )
  if (!plan) return null
  const version = plan.context.inputs.version as
    | Parameters<typeof writeGeometryRows>[3]
    | undefined
  if (
    plan.context.environment !== 'local' ||
    plan.context.releaseId !== releaseId ||
    !version ||
    version.releaseId !== releaseId ||
    typeof version.snapshotId !== 'string'
  )
    throw new Error('Invalid retained native geometry version.')
  return version
}

export async function writeGeometryRowsDurably(
  ...[context, type, rows, version, onProgress]: Parameters<typeof writeGeometryRows>
) {
  if (context.state.target !== 'local')
    return writeGeometryRows(context, type, rows, version, onProgress)
  const files = context.state.files
  const history = context.historyBinding?.bindingName
  const source = context.sourceBinding?.bindingName
  if (!files || !history || !source)
    throw new Error('Native geometry delivery requires named local database files.')
  const targets = Object.fromEntries(
    [
      ['DB_CURRENT', currentSchema],
      [history, historySchema],
      [source, sourceSchema],
    ].map(([binding, schema]) => {
      const name = binding as string
      const path = files[name]
      if (!path) throw new Error(`Missing native geometry database ${name}.`)
      return [name, { path, schema: schema as Record<string, unknown> }]
    }),
  )
  const hash = createHash('sha256')
  for (const row of rows) hash.update(JSON.stringify(row)).update('\n')
  const phase = `native-geometry-${type.toLowerCase()}-${version.transform ?? 'exact'}`
  const input = {
    context,
    releaseId: version.releaseId,
    phase,
    inputs: { version, normalisedSha256: hash.digest('hex') },
  }
  const directory = sqlDeliveryPhaseDirectory(input)
  const plan = await prepareNativeSqlDelivery({
    ...input,
    directory,
    ownershipDirectory: context.state.dbCacheDir,
    files: Object.fromEntries(
      Object.entries(targets).map(([name, target]) => [name, target.path]),
    ),
    generate: append =>
      captureNativePlanningCopy({
        targets,
        append,
        generate: async databases => {
          const result = await writeGeometryRows(
            {
              ...context,
              currentDb: databases.DB_CURRENT as unknown as typeof context.currentDb,
              historyDb: databases[history] as unknown as typeof context.historyDb,
              sourceDb: databases[source] as unknown as typeof context.sourceDb,
            },
            type,
            rows,
            version,
            onProgress,
          )
          return { churn: encodeChurn(result.churn) }
        },
      }),
  })
  // Validate continuation output before making any target mutation.
  const churn = decodeChurn(plan.outputs?.churn)
  await runNativeSqlDelivery(directory, { files })
  return { churn }
}

function encodeChurn(churn: Churn): Record<string, unknown> {
  return {
    ...churn,
    byType: [...churn.byType].map(([name, value]) => [name, encodeChurn(value)]),
  }
}

function decodeChurn(value: unknown): Churn {
  if (!value || typeof value !== 'object')
    throw new Error('Missing native geometry churn output.')
  const row = value as Record<string, unknown>
  for (const key of ['added', 'changed', 'count', 'removed', 'unchanged'])
    if (!Number.isSafeInteger(row[key]) || (row[key] as number) < 0)
      throw new Error('Invalid native geometry churn count.')
  if (!Array.isArray(row.byType))
    throw new Error('Invalid native geometry churn types.')
  const byType = new Map<string, Churn>()
  for (const entry of row.byType) {
    if (
      !Array.isArray(entry) ||
      entry.length !== 2 ||
      typeof entry[0] !== 'string' ||
      byType.has(entry[0])
    )
      throw new Error('Invalid native geometry churn type.')
    byType.set(entry[0], decodeChurn(entry[1]))
  }
  return {
    added: row.added as number,
    changed: row.changed as number,
    count: row.count as number,
    removed: row.removed as number,
    unchanged: row.unchanged as number,
    byType,
  }
}
