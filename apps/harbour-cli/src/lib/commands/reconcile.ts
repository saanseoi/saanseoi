import { note, outro } from '@clack/prompts'

import { formatField } from '../cli/display.ts'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { reconcileDraftReleaseSets } from '../upload/upload.ts'
import { recordInitialisationSummaryEvent } from './initialisationSummary.ts'
import { calculateAndStoreApiReleaseSetStats } from '../api/apiReleaseSetStats.ts'
import { createHarbourControlClient } from '../api/harbourControl.ts'
import { resolveLocalAddressDbContext } from '../dbCache/localDbCache.ts'
import { LocalUploadProgress } from '../upload/localUploadProgress.ts'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'

export async function runReconcileDraftReleaseSetsCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  if (args.positionals.length > 0) {
    printUsage()
    throw new Error('release-sets:reconcile does not accept positional arguments.')
  }

  const apiFamily = optionApiFamily(args.options['api-family'])
  const regionCode = optionRegionCode(args.options.region)
  const unsupportedOptions = Object.keys(args.options).filter(
    key => key !== 'api-family' && key !== 'region' && key !== 'target',
  )
  if (unsupportedOptions.length > 0) {
    printUsage()
    throw new Error(
      `release-sets:reconcile does not support --${unsupportedOptions.join(', --')}.`,
    )
  }

  const result = await reconcileDraftReleaseSets(target, { apiFamily, regionCode })
  if (result.publishedReleaseSetStatsTargets.length > 0) {
    const firstTarget = result.publishedReleaseSetStatsTargets[0]
    if (!firstTarget) throw new Error('Missing reconciled stats target.')
    const dbContext = await resolveLocalAddressDbContext(
      target,
      regionCode ?? 'hk',
      firstTarget.cohortKey.slice(0, 4),
      {
        cacheTableProfile: undefined,
        includePreviousShardYears: true,
        requireExistingRemoteCache: target.remote,
      },
    )
    try {
      for (const statsTarget of result.publishedReleaseSetStatsTargets) {
        await calculateAndStoreApiReleaseSetStats({
          currentDb: dbContext.currentDb as unknown as HarbourReadableDb,
          family: statsTarget.family,
          harbourClient: createHarbourControlClient(target) as HarbourClient,
          importOptions: {
            accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
            apiToken: process.env.CLOUDFLARE_D1_TOKEN,
            isLocal: !target.remote,
            metaBinding: dbContext.metaBinding,
            metaDatabaseId: dbContext.state.bindings.DB_META?.databaseId ?? null,
          },
          metaDb: dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
          progress: new LocalUploadProgress(),
          releaseCode: statsTarget.releaseCode,
          releaseId: statsTarget.releaseId,
          target: {
            apiReleaseSetId: statsTarget.apiReleaseSetId,
            snapshotId: statsTarget.snapshotId,
          },
        })
      }
    } finally {
      dbContext.cleanup()
    }
  }
  for (const apiReleaseSetCode of result.publishedReleaseSetCodes) {
    await recordInitialisationSummaryEvent({
      apiReleaseSetCode,
      type: 'published-api-release-set',
    })
  }
  note(
    [
      formatField('inspected', String(result.inspected)),
      formatField(
        'published',
        result.publishedReleaseSetCodes.length > 0
          ? result.publishedReleaseSetCodes.join(', ')
          : '-',
      ),
      formatField(
        'pending',
        result.pendingReleaseSetCodes.length > 0
          ? result.pendingReleaseSetCodes.join(', ')
          : '-',
      ),
    ].join('\n'),
    'DRAFT RELEASE-SET RECONCILIATION',
  )
  outro('Harbour draft release-set reconciliation complete')
}

function optionApiFamily(
  value: string | boolean | undefined,
): 'addresses' | 'divisions' | 'places' | 'stats' | 'streets' | undefined {
  if (value === undefined) return undefined
  if (
    value === 'addresses' ||
    value === 'divisions' ||
    value === 'places' ||
    value === 'stats' ||
    value === 'streets'
  ) {
    return value
  }
  throw new Error(
    '--api-family must be addresses, divisions, places, stats, or streets.',
  )
}

function optionRegionCode(
  value: string | boolean | undefined,
): 'hk' | 'mo' | undefined {
  if (value === undefined) return undefined
  if (value === 'hk' || value === 'mo') return value
  throw new Error('--region must be hk or mo.')
}
