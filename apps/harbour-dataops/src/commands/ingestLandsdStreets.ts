import { log, outro, spinner } from '@clack/prompts'
import { join, resolve } from 'node:path'

import {
  LANDSD_STREET_DATASET_CODE,
  ingestLandsdStreetSource,
} from '../../../harbour-cli/src/lib/landsdStreet/landsdStreetIngest.ts'
import { publishLandsdStreetReleasePayloads } from '../../../harbour-cli/src/lib/landsdStreet/landsdStreetPublish.ts'
import {
  loadDatasetFixtures,
  recordUpdateState,
  readUpdateState,
  writeUpdateState,
} from '../../../harbour-cli/src/lib/sourceUpdates.ts'
import type { ParsedArgs, UploadTarget } from '../../../harbour-cli/src/lib/options.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../..')

export async function runLandsdStreetIngestCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  if (args.positionals.length > 0) {
    printUsage()
    throw new Error(
      'hkgov-landsd-streets:backfill does not accept positional arguments.',
    )
  }
  const requestedNoticeIds = readCsvOption(args.options['notice-id'])
  const outputDir =
    typeof args.options['out-dir'] === 'string'
      ? resolve(args.options['out-dir'])
      : join(
          REPO_ROOT,
          'data/hkgov/landsd/street',
          requestedNoticeIds.length ? 'incremental' : 'backfill',
        )
  const progress = spinner({ withGuide: false })
  let progressActive = false
  const showProgress = (message: string, waitingForInput = false) => {
    if (waitingForInput) {
      if (progressActive) progress.stop(message)
      progressActive = false
      return
    }
    if (progressActive) {
      progress.message(message)
    } else {
      progress.start(message)
      progressActive = true
    }
  }

  showProgress('LandsD streets: starting ingestion')
  try {
    const result = await ingestLandsdStreetSource({
      includeBaseline: true,
      includeEgazetteHistory: true,
      ...(requestedNoticeIds.length > 0 ? { noticeIds: requestedNoticeIds } : {}),
      outputDir,
      target,
      promptForCuration: true,
      onProgress: event =>
        showProgress(`LandsD streets: ${event.message}`, event.waitingForInput),
    })

    await publishLandsdStreetReleasePayloads(target, result.releases, {
      invocationCwd: process.env.SAANSEOI_INVOCATION_CWD ?? process.cwd(),
      onProgress: ({ current, sourceVersion, total }) =>
        showProgress(
          `LandsD streets: publishing release ${current + 1}/${total} (${sourceVersion})`,
        ),
    })

    // The cursor moves only after all generated release payloads, immutable
    // assets/manifests, translations, fixtures, SQL rows and publications have
    // completed.
    showProgress('LandsD streets: recording source cursor')
    const dataset = (
      await loadDatasetFixtures(new Set([LANDSD_STREET_DATASET_CODE]))
    )[0]
    if (!dataset) throw new Error(`Missing fixture ${LANDSD_STREET_DATASET_CODE}.`)
    const state = await readUpdateState()
    const latestSourceVersion = result.releases
      .map(release => release.sourceVersion)
      .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }))
      .at(-1)
    if (!latestSourceVersion)
      throw new Error('LandsD ingestion did not produce a release payload.')
    recordUpdateState(state, dataset.code, {
      checkedAt: new Date().toISOString(),
      dataset,
      releaseLastRevisedAt: latestSourceVersion.slice(0, 10),
      sourceCursor: result.sourceCursor,
      sourceKey: dataset.code,
      status: 'current',
      version: latestSourceVersion,
      versionKey: latestSourceVersion,
    })
    await writeUpdateState(state)
    if (progressActive) {
      progress.stop('LandsD streets: ingestion complete')
      progressActive = false
    }

    log.success(
      `Prepared ${result.releases.length} LandsD street release payload(s); report: ${result.reportPath}`,
    )
    outro('LandsD street ingestion complete')
  } catch (error) {
    if (progressActive) {
      progress.error(
        `LandsD streets: ${error instanceof Error ? error.message : String(error)}`,
      )
      progressActive = false
    }
    throw error
  }
}

function readCsvOption(value: string | boolean | undefined) {
  return typeof value === 'string'
    ? value
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    : []
}
