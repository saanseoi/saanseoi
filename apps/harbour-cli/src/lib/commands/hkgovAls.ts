import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { isCancel, note, select } from '@clack/prompts'

import { inferSourceVersionFromPath } from '@repo/core/uploadLocal'

import { formatField } from '../display.ts'
import {
  emptyHkgovAlsIdentityDecisions,
  emptyHkgovAlsIdentityHistory,
  mergeHkgovAlsIdentityHistory,
  parseHkgovAlsIdentityDecisions,
  parseHkgovAlsIdentityHistory,
  type HkgovAlsIdentityDecisions,
  type HkgovAlsIdentityDriftCandidate,
  type HkgovAlsIdentityHistory,
} from '../hkgovAlsDrift.ts'
import { prepareHkgovAlsAddressParquet } from '../hkgovAls.ts'
import { resolveLocalAddressDbContext } from '../addressSql/localDbCache.ts'
import { runUploadCommand } from './upload.ts'
import type { ParsedArgs, UploadTarget } from '../options.ts'

const HKGOV_ALS_CATALOGUE_URL = 'https://data.gov.hk/en-data/dataset/hk-dpo-als_01-als'
const DEFAULT_HISTORY_FILE = '.local/hkgov-dpo/als-identity-history.json'
const DEFAULT_DECISIONS_FILE = '.local/hkgov-dpo/als-identity-decisions.json'

export async function runHkgovAlsPrepCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const sourceDir = args.positionals[0]
  const sourceVersion = resolveAlsSourceVersion(args, sourceDir)
  const cohortKey = stringOption(args, 'cohort-key')

  if (!sourceDir || !sourceVersion || !cohortKey) {
    printUsage()
    throw new Error(
      'Invalid arguments for `prep-hkgov-dpo`. Pass <source-dir> and --cohort-key; include --source-version only when it cannot be inferred from the path.',
    )
  }
  const outputFile = await createHkgovAlsTempOutputFile(sourceVersion)
  const historyFile = stringOption(args, 'identity-history')
  const decisionsFile = stringOption(args, 'identity-decisions')
  const result = await prepareHkgovAlsRelease({
    args,
    cohortKey,
    decisions: decisionsFile
      ? await readDecisions(resolve(decisionsFile))
      : emptyHkgovAlsIdentityDecisions(),
    history: historyFile
      ? await readHistory(resolve(historyFile))
      : emptyHkgovAlsIdentityHistory(),
    outputFile,
    sourceDir,
    sourceVersion,
    target,
  })

  if (result.sourceDuplicateFeatureGroups.length > 0) {
    note(
      formatSourceDuplicateTable(result.sourceDuplicateFeatureGroups),
      'SOURCE DUPLICATES REMOVED',
    )
  }
  if (result.identityEquivalentFeatureGroups.length > 0) {
    note(
      formatSourceDuplicateTable(result.identityEquivalentFeatureGroups),
      'EQUIVALENT ALS PREMISE VARIANTS CONSOLIDATED',
    )
  }
  const driftReportFile = stringOption(args, 'identity-drift-report')
  if (result.driftCandidates.length > 0 && driftReportFile) {
    await writeDriftReport(driftReportFile, sourceVersion, result.driftCandidates)
  }
  note(
    [
      formatField('outputFile', result.outputFile),
      formatField('sourceFiles', String(result.sourceFileCount)),
      formatField('featureCount', String(result.featureCount)),
      formatField(
        'exactSourceDuplicatesRemoved',
        String(result.deduplicatedFeatureCount),
      ),
      formatField('preparedPremises', String(result.identityRecords.length)),
      formatField(
        'equivalentPremiseVariantsConsolidated',
        String(result.identityConsolidatedFeatureCount),
      ),
      formatField('identityDriftCandidates', String(result.driftCandidates.length)),
      ...(driftReportFile && result.driftCandidates.length > 0
        ? [formatField('identityDriftReport', resolve(driftReportFile))]
        : []),
    ].join('\n'),
    'PREP RESULT',
  )
  if (result.driftCandidates.length > 0) {
    throw new Error(
      'ALS identity drift needs an explicit decision before this release can be ingested.',
    )
  }
}

/** Ingest every chronological ALS release below a directory into the local database. */
export async function runHkgovAlsLocalIngestCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  if (target.remote) {
    throw new Error('`ingest-hkgov-dpo-local` only supports --target local.')
  }
  const sourceRoot = args.positionals[0]
  const cohortKey = stringOption(args, 'cohort-key')
  if (!sourceRoot || !cohortKey) {
    printUsage()
    throw new Error(
      'Pass <ALS-source-root> and --cohort-key to `ingest-hkgov-dpo-local`.',
    )
  }
  const historyFile = resolve(
    stringOption(args, 'identity-history') ?? DEFAULT_HISTORY_FILE,
  )
  const decisionsFile = resolve(
    stringOption(args, 'identity-decisions') ?? DEFAULT_DECISIONS_FILE,
  )
  let history = await readHistory(historyFile)
  let decisions = await readDecisions(decisionsFile)
  const sourceDirs = await listAlsReleaseDirectories(sourceRoot)
  if (sourceDirs.length === 0) {
    throw new Error(`No ALS release directories found in ${resolve(sourceRoot)}.`)
  }

  for (const sourceDir of sourceDirs) {
    const sourceVersion = inferAlsSourceVersionFromPath(sourceDir)
    if (!sourceVersion) continue
    const outputFile = resolve(
      '.local/hkgov-dpo/prepared',
      `hkgov-hk-${sourceVersion}-address.parquet`,
    )
    let result = await prepareHkgovAlsRelease({
      args,
      cohortKey,
      decisions,
      history,
      outputFile,
      sourceDir,
      sourceVersion,
      target,
    })
    if (result.driftCandidates.length > 0) {
      const reportFile = resolve(
        '.local/hkgov-dpo/identity-drift',
        `${sourceVersion}.json`,
      )
      await writeDriftReport(reportFile, sourceVersion, result.driftCandidates)
      if (args.options.yes) {
        throw new Error(
          `ALS identity drift requires review. Wrote ${reportFile}; add decisions and run again.`,
        )
      }
      decisions = await promptForDriftDecisions(decisions, result.driftCandidates)
      await writeJson(decisionsFile, decisions)
      result = await prepareHkgovAlsRelease({
        args,
        cohortKey,
        decisions,
        history,
        outputFile,
        sourceDir,
        sourceVersion,
        target,
      })
    }

    if (result.sourceDuplicateFeatureGroups.length > 0) {
      note(
        formatSourceDuplicateTable(result.sourceDuplicateFeatureGroups),
        `SOURCE DUPLICATES REMOVED — ${sourceVersion}`,
      )
    }
    if (result.identityEquivalentFeatureGroups.length > 0) {
      note(
        formatSourceDuplicateTable(result.identityEquivalentFeatureGroups),
        `EQUIVALENT ALS PREMISE VARIANTS CONSOLIDATED — ${sourceVersion}`,
      )
    }
    await runUploadCommand(
      {
        command: 'upload',
        positionals: [result.outputFile],
        options: {
          'cohort-key': cohortKey,
          'release-notes-url':
            stringOption(args, 'release-notes-url') ?? HKGOV_ALS_CATALOGUE_URL,
          region: 'hk',
          source: 'hkgov-dpo',
          'source-version': sourceVersion,
          theme: 'addresses',
          type: 'address',
          yes: true,
        },
      },
      target,
      {
        dryRun: Boolean(args.options['dry-run']),
        forceUpload: Boolean(args.options.force),
        invocationCwd: process.cwd(),
        printUsage,
        skipConfirm: true,
        skipSnapshotCleanup: Boolean(args.options['skip-cleanup']),
        validateGeometry: Boolean(args.options['validate-geometry']),
      },
    )
    if (!args.options['dry-run']) {
      history = mergeHkgovAlsIdentityHistory(history, result.identityRecords)
      await writeJson(historyFile, history)
    }
  }
}

async function prepareHkgovAlsRelease(args: {
  args: ParsedArgs
  cohortKey: string
  decisions?: HkgovAlsIdentityDecisions
  history?: HkgovAlsIdentityHistory
  outputFile: string
  sourceDir: string
  sourceVersion: string
  target: UploadTarget
}) {
  const explicitDbPath = stringOption(args.args, 'db')
  const dbContext = explicitDbPath
    ? null
    : await resolveLocalAddressDbContext(
        args.target,
        'hk',
        args.cohortKey.slice(0, 4),
        {
          cacheTableProfile: 'address',
        },
      )
  try {
    return await prepareHkgovAlsAddressParquet({
      dbPath: explicitDbPath,
      currentDb: dbContext?.currentDb,
      environment: args.target.environment,
      identityDecisions: args.decisions,
      identityHistory: args.history,
      metaDb: dbContext?.metaDb,
      outputFile: args.outputFile,
      cohortKey: args.cohortKey,
      sourceDir: args.sourceDir,
      sourceVersion: args.sourceVersion,
    })
  } finally {
    await dbContext?.cleanup()
  }
}

async function promptForDriftDecisions(
  decisions: HkgovAlsIdentityDecisions,
  candidates: HkgovAlsIdentityDriftCandidate[],
) {
  const next = [...decisions.decisions]
  for (const candidate of candidates) {
    const answer = await select({
      message: formatDriftPrompt(candidate),
      options: [
        {
          label: 'Keep existing ID',
          value: 'keep-existing-id',
          hint: 'This is the same premise with changed ALS details.',
        },
        {
          label: 'Generate a new ID',
          value: 'new-id',
          hint: 'This is a different premise.',
        },
      ],
    })
    if (isCancel(answer)) throw new Error('ALS identity review cancelled.')
    next.push({
      currentIdentityKey: candidate.current.identityKey,
      previousIdentityKey: candidate.previous.identityKey,
      resolution: answer,
    })
  }
  return { authority: 'hkgov-dpo' as const, decisions: next, version: 1 as const }
}

function formatDriftPrompt(candidate: HkgovAlsIdentityDriftCandidate) {
  const before = formatIdentitySummary(candidate.previous.summary)
  const after = formatIdentitySummary(candidate.current.summary)
  return `Likely ALS premise drift\nold: ${before}\nnew: ${after}`
}

function formatIdentitySummary(summary: Record<string, string | null>) {
  return [
    summary.buildingName,
    summary.blockDescriptor,
    summary.blockNumber,
    summary.estateName,
    summary.phaseName,
    summary.phaseNumber,
    summary.numberFrom,
    summary.numberTo,
    summary.routeName,
    summary.districtName,
    summary.csuId,
    summary.geoAddress,
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ')
}

async function listAlsReleaseDirectories(sourceRoot: string) {
  const root = resolve(sourceRoot)
  const entries = await readdir(root, { withFileTypes: true })
  return entries
    .filter(
      entry => entry.isDirectory() && /^20\d{6}-\d{4}-ALS-GeoJSON$/i.test(entry.name),
    )
    .map(entry => join(root, entry.name))
    .sort()
}

function resolveAlsSourceVersion(args: ParsedArgs, sourceDir: string | undefined) {
  return (
    stringOption(args, 'source-version') ??
    inferSourceVersionFromPath(sourceDir ?? '') ??
    inferAlsSourceVersionFromPath(sourceDir ?? '')
  )
}

function stringOption(args: ParsedArgs, key: string) {
  const value = args.options[key]
  return typeof value === 'string' ? value : undefined
}

async function readHistory(filePath: string) {
  try {
    return parseHkgovAlsIdentityHistory(JSON.parse(await readFile(filePath, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyHkgovAlsIdentityHistory()
    }
    throw error
  }
}

async function readDecisions(filePath: string) {
  try {
    return parseHkgovAlsIdentityDecisions(JSON.parse(await readFile(filePath, 'utf8')))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyHkgovAlsIdentityDecisions()
    }
    throw error
  }
}

async function writeDriftReport(
  filePath: string,
  sourceVersion: string,
  candidates: HkgovAlsIdentityDriftCandidate[],
) {
  await writeJson(resolve(filePath), {
    authority: 'hkgov-dpo',
    candidates,
    generatedAt: new Date().toISOString(),
    sourceVersion,
    version: 1,
  })
}

async function writeJson(filePath: string, value: unknown) {
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function formatSourceDuplicateTable(
  groups: Array<{
    address: string
    occurrences: Array<{
      featureIndexOneBased: number
      sourceFile: string
    }>
  }>,
) {
  const rows = groups.map((group, index) => [
    String(index + 1),
    group.address.replaceAll('|', '\\|'),
    group.occurrences
      .map(occurrence => `${occurrence.sourceFile} #${occurrence.featureIndexOneBased}`)
      .join(', '),
  ])
  const header = ['Record', 'Address', 'Source feature positions (one-based)']
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ].join('\n')
}

export function inferAlsSourceVersionFromPath(value: string) {
  const match = value.match(
    /(?:^|[/\\])(20\d{2})(\d{2})(\d{2})-(\d{4})-ALS-GeoJSON(?:[/\\]|$)/i,
  )
  return match ? `${match[1]}-${match[2]}-${match[3]}.${match[4]}` : null
}

async function createHkgovAlsTempOutputFile(sourceVersion: string) {
  const tempDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-dpo-'))
  return join(tempDir, `hkgov-hk-${sourceVersion}-address.parquet`)
}
