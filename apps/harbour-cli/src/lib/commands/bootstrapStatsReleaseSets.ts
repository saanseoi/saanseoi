import { runReconcileDraftReleaseSetsCommand } from './reconcile'
import { note, outro } from '@clack/prompts'

import { formatField } from '../cli/display.ts'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { createApiReleaseSetInitialDraft } from './docs.ts'
import { logApiReleaseSetPublication } from './uploadDisplay.ts'
import { bootstrapStatsReleaseSets } from '../upload/upload.ts'

/** Creates initial, cohort-complete Statistics release sets from prepared snapshots. */
export async function runBootstrapStatsReleaseSetsCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  if (args.positionals.length > 0) {
    printUsage()
    throw new Error(
      'release-sets:bootstrap-stats does not accept positional arguments.',
    )
  }

  const regionCode = optionRegionCode(args.options.region)
  const unsupportedOptions = Object.keys(args.options).filter(
    key => key !== 'region' && key !== 'target',
  )
  if (unsupportedOptions.length > 0) {
    printUsage()
    throw new Error(
      `release-sets:bootstrap-stats does not support --${unsupportedOptions.join(', --')}.`,
    )
  }

  const result = await bootstrapStatsReleaseSets(target, { regionCode })
  if (result.createdReleaseSetCodes.length === 0) {
    return
  }
  await logApiReleaseSetPublication({
    apiReleaseSetPublications: result.createdReleaseSetCodes.map(apiReleaseSetCode => ({
      apiReleaseSetCode,
    })),
  })
  await runReconcileDraftReleaseSetsCommand(
    { ...args, options: { ...args.options, 'api-family': 'stats' } },
    target,
    printUsage,
  )
  const draftedPaths: string[] = []
  for (const code of result.createdReleaseSetCodes) {
    try {
      const draft = await createApiReleaseSetInitialDraft(code, target)
      if (draft?.status === 'created') draftedPaths.push(draft.path)
    } catch (error) {
      console.warn(
        `Statistics release-set bootstrap created ${code}, but could not draft its documentation: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  note(
    [
      formatField('inspected snapshots', String(result.inspectedSnapshots)),
      formatField(
        'published release sets',
        String(result.createdReleaseSetCodes.length),
      ),
      formatField('skipped cohorts', String(result.skippedCohortKeys.length)),
      formatField('drafted notes', String(draftedPaths.length)),
    ].join('\n'),
    'STATISTICS RELEASE-SET BOOTSTRAP',
  )
  outro('Statistics release-set bootstrap complete: new release sets published ✓')
}

function optionRegionCode(
  value: string | boolean | undefined,
): 'hk' | 'mo' | undefined {
  if (value === undefined) return undefined
  if (value === 'hk' || value === 'mo') return value
  throw new Error('--region must be hk or mo.')
}
