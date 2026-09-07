import { dirname, resolve } from 'node:path'
import type { UploadTarget } from '../cli/options.ts'
import {
  mapLocalTargetPaths,
  resolveD1Targets,
  resolveSharedRemoteDbCacheDir,
} from '../dbCache/localDbCacheTargets.ts'
import { readDeliveryPlan } from '../localPipeline/sqlDelivery.ts'
import {
  readPendingSqlDelivery,
  assertSqlDeliveryPlanningAllowed,
} from '../localPipeline/sqlDeliveryPending.ts'
import { runSqlDeliveryCommand } from './sqlDelivery.ts'
import { processLocalAddressSqlUpload } from '../addressSql/processLocalAddressSqlUpload.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const recoveryDependencies = {
  readPendingSqlDelivery,
  readDeliveryPlan,
  runSqlDeliveryCommand,
  processLocalAddressSqlUpload,
  assertSqlDeliveryPlanningAllowed,
}

/** Recover the owning release before the initialiser reads or plans other releases. */
export async function resumeAddressInitialisation(
  target: UploadTarget,
  dependencies: Partial<typeof recoveryDependencies> = {},
) {
  const recovery = { ...recoveryDependencies, ...dependencies }
  const metaPath = !target.remote
    ? mapLocalTargetPaths(await resolveD1Targets('local')).DB_META
    : undefined
  if (!target.remote && !metaPath) throw new Error('Address recovery requires DB_META.')
  const cacheDir = target.remote
    ? resolveSharedRemoteDbCacheDir(target)
    : dirname(metaPath ?? '')
  const pending = await recovery.readPendingSqlDelivery(cacheDir)
  if (!pending) return
  const plans = await Promise.all(pending.directories.map(recovery.readDeliveryPlan))
  const primary = plans.find(plan => plan?.context.phase === 'address-data')
  const message = primary?.context.inputs.message as Record<string, unknown> | undefined
  if (
    message?.datasetCode !== 'ds-hk-hkgov-dpo-address' ||
    message.releaseId !== pending.releaseId
  )
    throw new Error(
      'Pending SQL delivery is not an official-address release; refusing automatic recovery.',
    )
  const environment = target.remote ? target.environment : 'local'
  for (const plan of plans) {
    if (
      !plan ||
      plan.context.releaseId !== pending.releaseId ||
      resolve(plan.context.cacheDir) !== resolve(cacheDir) ||
      plan.context.environment !== environment ||
      (plan !== primary &&
        (plan.context.phase !== 'address3d-data' ||
          plan.context.inputs.sourceVersion !== message.sourceVersion))
    ) {
      throw new Error(
        'Pending SQL delivery is not an official-address release for this target; refusing automatic recovery.',
      )
    }
  }
  const sourceVersion = message.sourceVersion
  const cohortKey = message.cohortKey
  if (
    typeof sourceVersion !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}\.\d+$/.test(sourceVersion) ||
    typeof cohortKey !== 'string'
  ) {
    throw new Error('Retained address SQL plan lacks its source version or cohort.')
  }
  for (const field of [
    'datasetId',
    'rawObjectKey',
    'releaseCode',
    'releaseId',
  ] as const) {
    if (typeof message[field] !== 'string' || !message[field])
      throw new Error(`Retained address SQL plan lacks ${field}.`)
  }
  if (message.regionCode !== 'hk' || typeof message.totalRows !== 'number')
    throw new Error('Retained address SQL plan lacks its region or row count.')
  console.log(`Resuming retained official-address SQL delivery for ${sourceVersion}.`)
  for (const directory of pending.directories) {
    await recovery.runSqlDeliveryCommand(
      { command: 'sql:resume', positionals: [], options: { plan: directory } },
      target,
      REPO_ROOT,
    )
  }
  if (await recovery.readPendingSqlDelivery(cacheDir)) {
    await recovery.processLocalAddressSqlUpload(
      target,
      {
        cohortKey,
        regionCode: 'hk',
        releaseCode: message.releaseCode as string,
        rowCount: message.totalRows,
        source: 'hkgov-dpo',
        sourceVersion,
        theme: 'addresses',
        type: 'address',
      },
      message as Record<string, string>,
      {
        filePath: resolve(
          REPO_ROOT,
          '.local/hkgov-dpo/prepared',
          `hkgov-hk-${sourceVersion}-address.parquet`,
        ),
        transformed: false,
        cleanup: async () => {},
      },
      {
        deferApiReleaseSet: true,
      },
    )
  }
  await recovery.assertSqlDeliveryPlanningAllowed(cacheDir)
}
