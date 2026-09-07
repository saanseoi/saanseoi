import { join, resolve } from 'node:path'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import {
  resolveD1Targets,
  mapLocalTargetPaths,
} from '../dbCache/localDbCacheTargets.ts'
import { runNativeSqlDelivery } from '../localPipeline/nativeSqlDelivery.ts'
import { refreshRemoteMetaCache } from '../dbCache/localDbCacheReplay.ts'
import { readDeliveryPlan, runSqlDelivery } from '../localPipeline/sqlDelivery.ts'
import {
  readDeliveryProgress,
  withDeliveryLock,
} from '../localPipeline/sqlDeliveryFiles.ts'
import { completeSqlDeliveryRelease } from '../localPipeline/sqlDeliveryPending.ts'
import { createCloudflareD1QueryClient } from '../dbCache/remoteD1Client.ts'
import {
  resolveCloudflareAccountId,
  resolveCloudflareD1ApiToken,
} from '../addressSql/processLocalAddressSqlUploadImport.ts'

export async function runSqlDeliveryCommand(
  args: ParsedArgs,
  target: UploadTarget,
  invocationCwd: string,
) {
  const path = args.options.plan
  const mode = args.options.mode ?? 'both'
  if (
    typeof path !== 'string' ||
    (!target.remote && mode === 'remote') ||
    !['both', 'remote', 'local'].includes(String(mode)) ||
    args.positionals.length ||
    Object.keys(args.options).some(key => !['plan', 'target', 'mode'].includes(key))
  ) {
    throw new Error(
      'Use sql:status|sql:resume --plan PATH --target local|preview|production [--mode remote|local|both]. Native local plans cannot use remote mode.',
    )
  }
  const directory = resolve(invocationCwd, path)
  const plan = await readDeliveryPlan(directory)
  if (!plan) throw new Error('No sealed SQL delivery plan exists at that path.')
  const environment = !target.remote
    ? 'local'
    : target.environment === 'production'
      ? 'production'
      : 'preview'
  if (plan.context.environment !== environment)
    throw new Error('SQL delivery environment does not match --target.')
  if (args.command === 'sql:status') {
    console.log(
      JSON.stringify(
        { plan, progress: await readDeliveryProgress(directory, plan) },
        null,
        2,
      ),
    )
    return
  }
  if (environment === 'local') {
    const result = await runNativeSqlDelivery(directory, {
      files: mapLocalTargetPaths(await resolveD1Targets('local')),
      onProgress: (completed, total) =>
        console.log(`local: ${completed}/${total} confirmed SQL batches`),
    })
    console.log(JSON.stringify(result))
    console.log(
      'Native local SQL recovered. Resume the owning release workflow to finish publication and release its database ownership.',
    )
    return
  }
  const accountId = resolveCloudflareAccountId(target)
  const apiToken = resolveCloudflareD1ApiToken()
  if (!accountId || !apiToken)
    throw new Error(
      'SQL recovery requires CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_D1_TOKEN.',
    )
  const targets = Object.fromEntries(
    (await resolveD1Targets(environment)).flatMap(record =>
      record.databaseId ? [[record.bindingName, record.databaseId]] : [],
    ),
  )
  for (const operation of mode === 'both'
    ? (['remote', 'local'] as const)
    : [mode as 'remote' | 'local']) {
    const result = await runSqlDelivery(directory, {
      accountId,
      apiToken,
      targets,
      mode: operation,
      onProgress: (completed, total) =>
        console.log(`${operation}: ${completed}/${total} confirmed SQL batches`),
    })
    console.log(JSON.stringify({ mode: operation, ...result }))
  }
  if (mode !== 'remote') {
    await withDeliveryLock(
      join(plan.context.cacheDir, 'sql-delivery-lock'),
      async () => {
        await refreshRemoteMetaCache(environment, plan.context.cacheDir)
        const databaseId = targets.DB_META
        if (!databaseId)
          throw new Error('SQL recovery requires the configured DB_META target.')
        const rows = await createCloudflareD1QueryClient({
          accountId,
          apiToken,
          databaseId,
        }).query(
          `SELECT status FROM releases WHERE id = '${plan.context.releaseId.replaceAll("'", "''")}';`,
        )
        const complete =
          rows[0]?.status === 'published' &&
          (await completeSqlDeliveryRelease(
            plan.context.cacheDir,
            plan.context.releaseId,
          ))
        if (!complete)
          console.log(
            'Mirror ownership retained: the release must be published and every SQL plan reconciled before another release can use this mirror.',
          )
      },
    )
  }
  console.log(
    'Prepared SQL delivery recovered. This command does not publish a release or rerun source preparation; resume the release workflow to finish its remaining stages.',
  )
}
