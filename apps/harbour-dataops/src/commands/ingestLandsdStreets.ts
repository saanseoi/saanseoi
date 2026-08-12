import { log, note, outro, spinner } from '@clack/prompts'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import {
  LANDSD_STREET_DATASET_CODE,
  createLandsdStreetReleasePayload,
  ingestLandsdStreetSource,
  assignLandsdStreetBaselineIds,
  landsdStreetBaselineCandidatesFromRecords,
  reconcileLandsdStreetBaselineRecords,
  type LandsdStreetRecord,
} from '../../../harbour-cli/src/lib/sources/landsd/street/landsdStreetIngest.ts'
import { publishLandsdStreetReleasePayloads } from '../../../harbour-cli/src/lib/sources/landsd/street/landsdStreetPublish.ts'
import {
  loadDatasetFixtures,
  recordUpdateState,
  readUpdateState,
  writeUpdateState,
} from '../../../harbour-cli/src/lib/sources/sourceUpdates.ts'
import {
  describeTarget,
  formatField,
  formatMutedValue,
} from '../../../harbour-cli/src/lib/cli/display.ts'
import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../..')
const LANDSD_NOTICE_CUTOFF = '2016-01-22'
const OFFICIAL_EGAZETTE_START = '2000-05-19'
const OFFICIAL_EGAZETTE_END = '2016-01-21'

type StreetStage = 'baseline' | 'landsd-notices' | 'official-egazette'

type StagedStreetRecords = {
  records: LandsdStreetRecord[]
  sourceCursor: string[]
  stage: StreetStage
  target: UploadTarget
  version: 1
}

export async function runLandsdStreetStageCommand(
  args: ParsedArgs,
  target: UploadTarget,
  stage: StreetStage,
  printUsage: () => void,
) {
  if (args.positionals.length > 0) {
    printUsage()
    throw new Error(`${commandForStage(stage)} does not accept positional arguments.`)
  }
  const stagingDir = resolveStageDirectory(args, stage)
  const stagingRoot = resolveStagingRoot(args)
  const progress = createProgress('LandsD streets')

  try {
    const existingBaseline =
      stage === 'baseline'
        ? await readOptionalStage(join(stagingRoot, 'baseline'), 'baseline', target)
        : await readRequiredBaselineStage(stagingRoot, target)
    const baselineRecords = existingBaseline
      ? assignLandsdStreetBaselineIds(existingBaseline.records)
      : []
    if (
      existingBaseline &&
      baselineRecords.some(
        (record, index) =>
          record.streetId !== existingBaseline.records[index]?.streetId,
      )
    ) {
      await writeStage(join(stagingRoot, 'baseline'), {
        ...existingBaseline,
        records: baselineRecords,
      })
    }
    const result = await ingestLandsdStreetSource({
      ...stageOptions(stage),
      baselineCandidates: landsdStreetBaselineCandidatesFromRecords(baselineRecords),
      outputDir: stagingDir,
      promptForCuration: true,
      target,
      writeFixtures: false,
      onProgress: event => progress.show(event.message, event.waitingForInput ?? false),
    })
    const stagedRecords = assignLandsdStreetBaselineIds(
      result.releases.flatMap(release => release.records),
    )
    await writeStage(stagingDir, {
      records: stagedRecords,
      sourceCursor: result.sourceCursor,
      stage,
      target,
      version: 1,
    })
    progress.stop(`${stageLabel(stage)} staging complete`)
    note(
      formatStageResult({
        recordCount: stagedRecords.length,
        reportPath: result.reportPath,
        stage,
        target,
      }).join('\n'),
      'STREET STAGING',
    )
    outro(stageCompletionMessage(stage))
  } catch (error) {
    progress.error(error)
    throw error
  }
}

export async function runLandsdStreetAssembleCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  if (args.positionals.length > 0) {
    printUsage()
    throw new Error(
      'hkgov-landsd-streets:assemble does not accept positional arguments.',
    )
  }
  const stagingRoot = resolveStagingRoot(args)
  const outputDir =
    typeof args.options['out-dir'] === 'string'
      ? resolve(args.options['out-dir'])
      : join(REPO_ROOT, 'data/hkgov/landsd/street/assembly')
  const progress = createProgress('LandsD streets')
  try {
    progress.show('Loading staged baseline and Government Notice records')
    const stages = await Promise.all(
      (['baseline', 'landsd-notices', 'official-egazette'] as const).map(stage =>
        readStage(join(stagingRoot, stage), stage, target),
      ),
    )
    const records = reconcileLandsdStreetBaselineRecords(
      stages.flatMap(stage => stage.records),
    )
    assertUniqueRecordKeys(records)
    const sourceVersion = latestNoticeSourceVersion(records)
    progress.show(`Writing assembled street release ${sourceVersion}`)
    const release = await createLandsdStreetReleasePayload({
      outputDir,
      records,
      sourceVersion,
      writeFixture: true,
    })
    await publishLandsdStreetReleasePayloads(target, [release], {
      invocationCwd: process.env.SAANSEOI_INVOCATION_CWD ?? process.cwd(),
      onProgress: ({ current, sourceVersion: version, total }) =>
        progress.show(`Publishing release ${current + 1}/${total} (${version})`),
    })
    await recordStreetSourceCursor(
      target,
      stages.flatMap(stage => stage.sourceCursor),
      sourceVersion,
    )
    progress.stop('LandsD street assembly and publication complete')
    log.success(
      `Published ${records.length} staged street record(s) as ${release.sourceVersion}.`,
    )
    outro('LandsD street snapshot revision published')
  } catch (error) {
    progress.error(error)
    throw error
  }
}

function stageOptions(stage: StreetStage) {
  switch (stage) {
    case 'baseline':
      return { includeBaseline: true, includeLandsdNotices: false }
    case 'landsd-notices':
      return {
        includeBaseline: false,
        includeLandsdNotices: true,
        landsdNoticeDateRange: { from: LANDSD_NOTICE_CUTOFF },
      }
    case 'official-egazette':
      return {
        egazetteNoticeDateRange: {
          from: OFFICIAL_EGAZETTE_START,
          through: OFFICIAL_EGAZETTE_END,
        },
        includeBaseline: false,
        includeEgazetteHistory: true,
        includeLandsdNotices: false,
      }
  }
}

function resolveStageDirectory(args: ParsedArgs, stage: StreetStage) {
  if (typeof args.options['out-dir'] === 'string')
    return resolve(args.options['out-dir'])
  return join(resolveStagingRoot(args), stage)
}

function resolveStagingRoot(args: ParsedArgs) {
  return typeof args.options['staging-dir'] === 'string'
    ? resolve(args.options['staging-dir'])
    : join(REPO_ROOT, 'data/hkgov/landsd/street/staging')
}

function commandForStage(stage: StreetStage) {
  return `hkgov-landsd-streets:${stage}`
}

function stageLabel(stage: StreetStage) {
  return stage.replaceAll('-', ' ')
}

function formatStageResult(input: {
  recordCount: number
  reportPath: string
  stage: StreetStage
  target: UploadTarget
}) {
  const baselineIdentityStatus =
    input.stage === 'baseline'
      ? 'canonical street IDs minted and staged'
      : 'baseline canonical street IDs loaded'
  return [
    formatField('target', describeTarget(input.target).label),
    formatField('stage', stageLabel(input.stage)),
    formatField('status', 'staged'),
    formatField('records', input.recordCount),
    formatField('identity', baselineIdentityStatus),
    formatField('report', formatMutedValue(input.reportPath)),
  ]
}

function stageCompletionMessage(stage: StreetStage) {
  switch (stage) {
    case 'baseline':
      return 'Baseline staged with minted street IDs.'
    case 'landsd-notices':
      return 'LandsD notices staged against the baseline IDs; continue with the e-Gazette notice stage.'
    case 'official-egazette':
      return 'Historical e-Gazette notices staged; run hkgov-landsd-streets:assemble to publish.'
  }
}

async function writeStage(dir: string, stage: StagedStreetRecords) {
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'stage.json'), `${JSON.stringify(stage, null, 2)}\n`)
}

async function readStage(
  dir: string,
  expectedStage: StreetStage,
  target: UploadTarget,
): Promise<StagedStreetRecords> {
  const path = join(dir, 'stage.json')
  let value: unknown
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(
      `Cannot read staged ${expectedStage} records at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (!value || typeof value !== 'object') throw new Error(`${path} must be an object.`)
  const stage = value as Partial<StagedStreetRecords>
  if (
    stage.version !== 1 ||
    stage.stage !== expectedStage ||
    !Array.isArray(stage.records)
  ) {
    throw new Error(`${path} is not a valid ${expectedStage} stage.`)
  }
  if (
    stage.target?.environment !== target.environment ||
    stage.target?.remote !== target.remote
  ) {
    throw new Error(
      `${path} was prepared for a different target; source assets must be assembled in the same environment.`,
    )
  }
  return {
    records: stage.records,
    sourceCursor: Array.isArray(stage.sourceCursor) ? stage.sourceCursor : [],
    stage: expectedStage,
    target,
    version: 1,
  }
}

async function readOptionalStage(
  dir: string,
  expectedStage: StreetStage,
  target: UploadTarget,
) {
  try {
    return await readStage(dir, expectedStage, target)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(`Cannot read staged ${expectedStage} records`) &&
      error.message.includes('ENOENT')
    )
      return null
    throw error
  }
}

async function readRequiredBaselineStage(stagingRoot: string, target: UploadTarget) {
  try {
    return await readStage(join(stagingRoot, 'baseline'), 'baseline', target)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Cannot read staged baseline records') &&
      error.message.includes('ENOENT')
    )
      throw new Error(
        'LandsD notice stages require a staged baseline with canonical street IDs. Run hkgov-landsd-streets:baseline first.',
      )
    throw error
  }
}

function latestNoticeSourceVersion(records: LandsdStreetRecord[]) {
  const date = records
    .map(record => record.gazetteDate)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1)
  if (!date)
    throw new Error('The assembled street release has no Government Notice date.')
  return `${date}.0`
}

function assertUniqueRecordKeys(records: LandsdStreetRecord[]) {
  const seen = new Set<string>()
  for (const record of records) {
    if (seen.has(record.recordKey)) {
      throw new Error(
        `Staged street records duplicate immutable source record ${record.recordKey}. Check the 22 January 2016 cutoff.`,
      )
    }
    seen.add(record.recordKey)
  }
}

async function recordStreetSourceCursor(
  _target: UploadTarget,
  sourceCursor: string[],
  sourceVersion: string,
) {
  const dataset = (await loadDatasetFixtures(new Set([LANDSD_STREET_DATASET_CODE])))[0]
  if (!dataset) throw new Error(`Missing fixture ${LANDSD_STREET_DATASET_CODE}.`)
  const state = await readUpdateState()
  recordUpdateState(state, dataset.code, {
    checkedAt: new Date().toISOString(),
    dataset,
    releaseLastRevisedAt: sourceVersion.slice(0, 10),
    sourceCursor: [...new Set(sourceCursor)].sort(),
    sourceKey: dataset.code,
    status: 'current',
    version: sourceVersion,
    versionKey: sourceVersion,
  })
  await writeUpdateState(state)
}

function createProgress(label: string) {
  const progress = spinner({ withGuide: false })
  let active = false
  return {
    error(error: unknown) {
      if (!active) return
      progress.error(
        `${label}: ${error instanceof Error ? error.message : String(error)}`,
      )
      active = false
    },
    show(message: string, waitingForInput = false) {
      if (waitingForInput) {
        if (active) progress.stop(`${label}: ${message}`)
        active = false
        return
      }
      if (active) progress.message(`${label}: ${message}`)
      else {
        progress.start(`${label}: ${message}`)
        active = true
      }
    },
    stop(message: string) {
      if (active) progress.stop(`${label}: ${message}`)
      active = false
    },
  }
}
