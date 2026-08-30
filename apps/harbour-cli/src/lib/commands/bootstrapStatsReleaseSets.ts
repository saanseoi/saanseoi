import { note, outro } from '@clack/prompts'

import { formatField } from '../cli/display.ts'
import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { createApiReleaseSetInitialDraft } from './docs.ts'
import { recordInitialisationSummaryEvent } from './initialisationSummary.ts'
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
  await Promise.all(
    result.createdReleaseSetCodes.map(apiReleaseSetCode =>
      recordInitialisationSummaryEvent({
        apiReleaseSetCode,
        type: 'published-api-release-set',
      }),
    ),
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
        'created',
        result.createdReleaseSetCodes.length > 0
          ? result.createdReleaseSetCodes.join(', ')
          : '-',
      ),
      formatField(
        'skipped cohorts',
        result.skippedCohortKeys.length > 0 ? result.skippedCohortKeys.join(', ') : '-',
      ),
      formatField(
        'drafted notes',
        draftedPaths.length > 0 ? draftedPaths.join(', ') : '-',
      ),
    ].join('\n'),
    'STATISTICS RELEASE-SET BOOTSTRAP',
  )
  outro('Statistics release-set bootstrap complete')
}

function optionRegionCode(
  value: string | boolean | undefined,
): 'hk' | 'mo' | undefined {
  if (value === undefined) return undefined
  if (value === 'hk' || value === 'mo') return value
  throw new Error('--region must be hk or mo.')
}
