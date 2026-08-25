import { note, outro } from '@clack/prompts'

import { formatField } from '../cli/display.ts'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { reconcileDraftReleaseSets } from '../upload/upload.ts'
import { recordInitialisationSummaryEvent } from './initialisationSummary.ts'

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
