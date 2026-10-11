import { computeVersionHash } from '@repo/db'
import {
  recordProcessingRun,
  readProcessingCheckpoint,
} from '@repo/core/db/processingRuns'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { processingStageForPhase } from '@repo/core/pipeline/processingStages'
import { readDeliveryPlan } from './sqlDeliveryFiles'
import { resolve } from 'node:path'
import type { LocalAddressDbContext } from '../../dbCache/localDbCacheTypes.ts'
import {
  resolveCloudflareAccountId,
  resolveCloudflareD1ApiToken,
} from '../addresses/processLocalAddressSqlUploadImport.ts'
import {
  prepareReleaseSqlDelivery,
  executeReleaseSqlDelivery,
} from './releaseSqlDelivery.ts'
import { captureSqlDeliveryBatches } from './sqlDeliveryBatchCapture.ts'
import { prepareNativeSqlDelivery, runNativeSqlDelivery } from './nativeSqlDelivery.ts'
import { deliverResolvedSqlPhase } from './resolvedSqlPhase.ts'
import { familyMutationTargets, type ResolvedFamily } from './familyMutationPolicy.ts'
import { withSqlDeliveryCapture } from './sqlDeliveryCapture.ts'
import type { PublicationTable } from '@repo/core/pipeline/services/publication/sql.ts'

export type SqlDeliveryPhase = {
  context: LocalAddressDbContext
  resourceReleaseId: string
  phase: string
  inputs: Record<string, unknown>
  nativeLocal?: boolean
  resolvedFamily?: ResolvedFamily
  publicationTables?: PublicationTable[]
  captureOutputs?: () => Record<string, unknown>
  /** Validate family continuation data before any retained SQL is replayed. */
  validateOutputs?: (outputs: Record<string, unknown> | undefined) => unknown
  mode?: 'remote' | 'local'
  onProgress?: (completed: number, total: number) => void | Promise<void>
}

export function sqlDeliveryPhaseDirectory(input: SqlDeliveryPhase) {
  // Release IDs can contain publisher punctuation; encode them as one path component.
  return resolve(
    import.meta.dir,
    '../../../../../../.local/harbour-sql/deliveries',
    input.context.state.target,
    `release-${encodeURIComponent(input.resourceReleaseId)}`,
    input.phase,
  )
}

/** Capture existing family SQL builders without introducing a second planning context. */
async function executeSqlPhase(
  input: SqlDeliveryPhase,
  generate: () => Promise<unknown>,
) {
  if (input.resolvedFamily) {
    return deliverResolvedSqlPhase(
      { ...input, targets: familyMutationTargets(input.context, input.resolvedFamily) },
      async (_context, candidates) => {
        const local = input.context.state.target === 'local'
        await withSqlDeliveryCapture(
          async (target, bytes) => {
            const binding = local
              ? target.databaseId
              : Object.entries(input.context.state.bindings).find(
                  ([, value]) => value.databaseId === target.databaseId,
                )?.[0]
            if (!binding || !candidates[binding])
              throw new Error('Captured family SQL targets an unknown candidate.')
            candidates[binding]!.execute(bytes)
          },
          generate,
          local,
        )
        return input.captureOutputs?.() ?? {}
      },
    )
  }
  if (input.context.state.target === 'local') {
    if (input.nativeLocal) {
      if (!/^[a-z0-9-]+$/.test(input.phase))
        throw new Error('Invalid SQL delivery phase name.')
      const files = input.context.state.files
      if (!files)
        throw new Error('Native delivery requires resolved local database paths.')
      const directory = sqlDeliveryPhaseDirectory(input)
      const plan = await prepareNativeSqlDelivery({
        ...input,
        directory,
        files,
        ownershipDirectory: input.context.state.dbCacheDir,
        generate: async append => {
          await captureSqlDeliveryBatches(
            async (target, bytes) => {
              if (!target.databaseId || !files[target.databaseId])
                throw new Error('Unknown native SQL binding.')
              await append(
                { databaseId: target.databaseId, bindingName: target.databaseId },
                bytes,
              )
            },
            generate,
            64 * 1024 * 1024,
            true,
          )
          return input.captureOutputs?.()
        },
      })
      input.validateOutputs?.(plan.outputs)
      await runNativeSqlDelivery(directory, { files, onProgress: input.onProgress })
      return plan.outputs
    }
    await generate()
    return
  }
  if (!/^[a-z0-9-]+$/.test(input.phase))
    throw new Error('Invalid SQL delivery phase name.')
  const accountId = resolveCloudflareAccountId({
    remote: true,
    environment: input.context.state.target,
  })
  const apiToken = resolveCloudflareD1ApiToken()
  if (!accountId || !apiToken)
    throw new Error('SQL delivery requires Cloudflare account and D1 credentials.')
  const directory = sqlDeliveryPhaseDirectory(input)
  const plan = await prepareReleaseSqlDelivery({
    ...input,
    directory,
    generate: async capture => {
      await captureSqlDeliveryBatches(capture, generate)
      return input.captureOutputs?.()
    },
  })
  input.validateOutputs?.(plan.outputs)
  const execution = { ...input, directory, accountId, apiToken }
  if (input.mode !== 'local')
    await executeReleaseSqlDelivery({ ...execution, mode: 'remote' })
  if (input.mode !== 'remote')
    await executeReleaseSqlDelivery({ ...execution, mode: 'local' })
  return plan.outputs
}

/** The run points to the sealed delivery plan; receipts remain owned by delivery. */
export async function deliverSqlPhase(
  input: SqlDeliveryPhase,
  generate: () => Promise<unknown>,
) {
  const db = input.context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const owner = { resourceReleaseId: input.resourceReleaseId }
  const phase = `sql:${input.phase}`
  const stage = processingStageForPhase(input.phase)
  // SQL materialisation is ingestion/assembly; composition is recorded by publication.
  const runStage = stage === 'composition' ? 'assembly' : stage
  const identityHash = computeVersionHash({
    inputs: input.inputs,
    target: input.context.state.target,
    bindings: input.context.state.bindings ?? {},
    files: input.context.state.files ?? {},
  })
  await readProcessingCheckpoint(db, owner, phase, identityHash)
  await recordProcessingRun(db, { ...owner, phase, stage: runStage, status: 'running' })
  const directory = sqlDeliveryPhaseDirectory(input)
  const checkpoint = async () => {
    const plan = await readDeliveryPlan(directory)
    return plan
      ? { version: 1 as const, identityHash, artefact: `${directory}/plan.json` }
      : null
  }
  try {
    const outputs = await executeSqlPhase(input, generate)
    await recordProcessingRun(db, {
      ...owner,
      phase,
      stage: runStage,
      status: 'completed',
      checkpoint: await checkpoint(),
      results: { outputAvailable: outputs !== undefined },
    })
    return outputs
  } catch (error) {
    await recordProcessingRun(db, {
      ...owner,
      phase,
      stage: runStage,
      status: 'error',
      checkpoint: await checkpoint(),
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
