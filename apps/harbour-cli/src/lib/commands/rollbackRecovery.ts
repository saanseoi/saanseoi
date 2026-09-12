import type { UploadTarget } from '../cli/options.ts'
import type { SqlDeliveryPlan } from '../pipeline/local/sqlDeliveryTypes.ts'
import type { RollbackTerminal } from './rollbackDelivery.ts'
import { runNativeSqlDelivery } from '../pipeline/local/nativeSqlDelivery.ts'
import {
  runSqlDelivery,
  resolveDeliveryMirrorFiles,
} from '../pipeline/local/sqlDelivery.ts'
import {
  mapLocalTargetPaths,
  resolveD1Targets,
} from '../dbCache/localDbCacheTargets.ts'
import { completeSqlDeliveryRelease } from '../pipeline/local/sqlDeliveryPending.ts'
import {
  resolveCloudflareAccountId,
  resolveCloudflareD1ApiToken,
} from '../pipeline/addresses/processLocalAddressSqlUploadImport.ts'
import { verifyRollbackTerminal } from './reconstructRollback.ts'

/** Rollback recovery never reopens ingestion or replaces its frozen metadata baseline. */
export async function resumeRollbackDelivery(
  directory: string,
  plan: SqlDeliveryPlan,
  target: UploadTarget,
  mode: 'both' | 'remote' | 'local',
) {
  const terminal = plan.outputs?.terminal as RollbackTerminal | undefined
  if (
    terminal?.operation !== 'rollback' ||
    terminal.releaseId !== plan.context.releaseId
  )
    throw new Error('Invalid sealed rollback completion contract.')
  let files: Record<string, string>
  if (plan.context.environment === 'local') {
    files = mapLocalTargetPaths(await resolveD1Targets('local'))
    await runNativeSqlDelivery(directory, { files })
  } else {
    const accountId = resolveCloudflareAccountId(target)
    const apiToken = resolveCloudflareD1ApiToken()
    if (!accountId || !apiToken)
      throw new Error('Rollback recovery requires Cloudflare D1 credentials.')
    const targets = Object.fromEntries(
      (await resolveD1Targets(plan.context.environment)).flatMap(record =>
        record.databaseId ? [[record.bindingName, record.databaseId]] : [],
      ),
    )
    for (const operation of mode === 'both' ? (['remote', 'local'] as const) : [mode])
      await runSqlDelivery(directory, { accountId, apiToken, targets, mode: operation })
    if (mode === 'remote') {
      console.log(
        'Rollback remote batches acknowledged; local replay is required before mirror ownership can be released.',
      )
      return
    }
    files = await resolveDeliveryMirrorFiles(plan)
  }
  await verifyRollbackTerminal(files, terminal)
  if (
    !(await completeSqlDeliveryRelease(plan.context.cacheDir, plan.context.releaseId))
  )
    throw new Error('Rollback recovery has unacknowledged batches.')
  console.log(
    'Rollback recovered, predecessor readiness verified, and mirror ownership released.',
  )
}
