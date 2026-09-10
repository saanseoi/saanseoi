import { join, resolve } from 'node:path'
import { Database } from 'bun:sqlite'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import {
  resolveD1Targets,
  mapLocalTargetPaths,
} from '../dbCache/localDbCacheTargets.ts'
import { runNativeSqlDelivery } from '../localPipeline/nativeSqlDelivery.ts'
import { refreshRemoteMetaCache } from '../dbCache/localDbCacheReplay.ts'
import {
  readDeliveryPlan,
  runSqlDelivery,
  resolveDeliveryMirrorFiles,
} from '../localPipeline/sqlDelivery.ts'
import {
  readDeliveryProgress,
  withDeliveryLock,
} from '../localPipeline/sqlDeliveryFiles.ts'
import { completeSqlDeliveryRelease } from '../localPipeline/sqlDeliveryPending.ts'
import { registerPendingSqlDelivery } from '../localPipeline/sqlDeliveryPending.ts'
import { assertSqlDeliveryGeneration } from '../localPipeline/sqlDeliveryGeneration.ts'
import { sqlDeliveryRecoveryStatusSql } from '../localPipeline/sqlDeliveryRecoveryStatus.ts'
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
    const localFiles = mapLocalTargetPaths(await resolveD1Targets('local'))
    const result = await runNativeSqlDelivery(directory, {
      files: localFiles,
      onProgress: (completed, total) =>
        console.log(`local: ${completed}/${total} confirmed SQL batches`),
    })
    console.log(JSON.stringify(result))
    const metaPath = localFiles.DB_META
    if (!metaPath)
      throw new Error('Local SQL recovery requires the configured DB_META binding.')
    const metaDb = new Database(metaPath, { readonly: true })
    let published = false
    try {
      published =
        metaDb
          .query<{ status: string }, [string]>(
            'SELECT status FROM releases WHERE id = ? LIMIT 1',
          )
          .get(plan.context.releaseId)?.status === 'published'
    } finally {
      metaDb.close()
    }
    const released =
      published &&
      (await completeSqlDeliveryRelease(plan.context.cacheDir, plan.context.releaseId))
    if (released) {
      console.log(
        'Native local SQL recovered and the published release released its database ownership.',
      )
      return
    }
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
  if (mode !== 'local') {
    await withDeliveryLock(
      join(plan.context.cacheDir, 'sql-delivery-lock'),
      async () => {
        await assertSqlDeliveryGeneration(
          plan.context.cacheDir,
          plan.context.releaseId,
          plan.context.inputs.resetGeneration,
        )
        for (const batch of plan.batches) {
          if (targets[batch.target.bindingName] !== batch.target.databaseId)
            throw new Error(
              `SQL delivery target changed for ${batch.target.bindingName}.`,
            )
        }
        await resolveDeliveryMirrorFiles(plan)
        await registerPendingSqlDelivery(
          plan.context.cacheDir,
          plan.context.releaseId,
          directory,
        )
        const databaseId = targets.DB_META
        if (!databaseId)
          throw new Error('SQL recovery requires the configured DB_META target.')
        const client = createCloudflareD1QueryClient({
          accountId,
          apiToken,
          databaseId,
        })
        const resumed = await client.query(
          sqlDeliveryRecoveryStatusSql(plan.context.releaseId),
        )
        const rows = await client.query(
          `SELECT status FROM releases WHERE id = '${plan.context.releaseId.replaceAll("'", "''")}';`,
        )
        if (!rows.length || rows[0]?.status === 'failed')
          throw new Error(
            'SQL recovery cannot reopen this missing or published-snapshot release.',
          )
        // Audit SQL requires an editable release. Synchronise only metadata before
        // local replay; data-shard baselines and the mirror generation stay frozen.
        if (plan.batches.some(batch => batch.target.bindingName === 'DB_META'))
          await refreshRemoteMetaCache(environment, plan.context.cacheDir)
        if (resumed.length)
          console.log(`Resumed failed release ${plan.context.releaseId} as processing.`)
      },
    )
  }
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
    const published = await withDeliveryLock(
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
        return rows[0]?.status === 'published'
      },
    )
    // Completion acquires this lock itself and rechecks ownership and every
    // plan's receipts. Calling it inside the refresh lock deadlocks SQLite.
    const complete =
      published &&
      (await completeSqlDeliveryRelease(plan.context.cacheDir, plan.context.releaseId))
    if (!complete)
      console.log(
        'Mirror ownership retained: the release must be published and every SQL plan reconciled before another release can use this mirror.',
      )
  }
  console.log(
    'Prepared SQL delivery recovered. This command does not publish a release or rerun source preparation; resume the release workflow to finish its remaining stages.',
  )
}
