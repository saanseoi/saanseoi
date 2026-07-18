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
import {
  emptyHkgovAlsPrecedenceVariantDecisions,
  parseHkgovAlsPrecedenceVariantDecisions,
  type HkgovAlsPrecedenceVariantDecisions,
} from '../hkgovAlsVariants.ts'
import {
  prepareHkgovAlsAddressParquet,
  type HkgovAlsPrecedenceVariantCandidate,
} from '../hkgovAls.ts'
import { resolveLocalAddressDbContext } from '../addressSql/localDbCache.ts'
import { runUploadCommand } from './upload.ts'
import type { ParsedArgs, UploadTarget } from '../options.ts'

const HKGOV_ALS_CATALOGUE_URL = 'https://data.gov.hk/en-data/dataset/hk-dpo-als_01-als'
const DEFAULT_HISTORY_FILE = '.local/hkgov-dpo/als-identity-history.json'
const DEFAULT_DECISIONS_FILE = '.local/hkgov-dpo/als-identity-decisions.json'
const DEFAULT_PRECEDENCE_VARIANT_DECISIONS_FILE =
  '.local/hkgov-dpo/als-precedence-variant-decisions.json'
const INVOCATION_CWD = resolve(
  process.env.SAANSEOI_INVOCATION_CWD ?? process.env.INIT_CWD ?? process.cwd(),
)

export async function runHkgovAlsPrepCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const sourceDir = args.positionals[0]
    ? resolveInvocationPath(args.positionals[0])
    : undefined
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
  const precedenceVariantDecisionsFile = stringOption(
    args,
    'precedence-variant-decisions',
  )
  const result = await prepareHkgovAlsRelease({
    args,
    cohortKey,
    decisions: decisionsFile
      ? await readDecisions(resolveInvocationPath(decisionsFile))
      : emptyHkgovAlsIdentityDecisions(),
    history: historyFile
      ? await readHistory(resolveInvocationPath(historyFile))
      : emptyHkgovAlsIdentityHistory(),
    precedenceVariantDecisions: precedenceVariantDecisionsFile
      ? await readPrecedenceVariantDecisions(
          resolveInvocationPath(precedenceVariantDecisionsFile),
        )
      : emptyHkgovAlsPrecedenceVariantDecisions(),
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
      formatField(
        'precedenceVariantChoicesRequired',
        String(result.precedenceVariantCandidates.length),
      ),
      ...(driftReportFile && result.driftCandidates.length > 0
        ? [formatField('identityDriftReport', resolveInvocationPath(driftReportFile))]
        : []),
    ].join('\n'),
    'PREP RESULT',
  )
  if (result.driftCandidates.length > 0) {
    throw new Error(
      'ALS identity drift needs an explicit decision before this release can be ingested.',
    )
  }
  if (result.precedenceVariantCandidates.length > 0) {
    throw new Error(
      'ALS source variants with a missing BlockDescriptorPrecedenceIndicator need an explicit decision before this release can be ingested.',
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
    ? resolveInvocationPath(args.positionals[0])
    : undefined
  const cohortKey = stringOption(args, 'cohort-key')
  if (!sourceRoot || !cohortKey) {
    printUsage()
    throw new Error(
      'Pass <ALS-source-root> and --cohort-key to `ingest-hkgov-dpo-local`.',
    )
  }
  const historyFile = resolveInvocationPath(
    stringOption(args, 'identity-history') ?? DEFAULT_HISTORY_FILE,
  )
  const decisionsFile = resolveInvocationPath(
    stringOption(args, 'identity-decisions') ?? DEFAULT_DECISIONS_FILE,
  )
  const precedenceVariantDecisionsFile = resolveInvocationPath(
    stringOption(args, 'precedence-variant-decisions') ??
      DEFAULT_PRECEDENCE_VARIANT_DECISIONS_FILE,
  )
  let history = await readHistory(historyFile)
  let decisions = await readDecisions(decisionsFile)
  let precedenceVariantDecisions = await readPrecedenceVariantDecisions(
    precedenceVariantDecisionsFile,
  )
  const firstSourceVersion =
    stringOption(args, 'from-source-version') ?? `${cohortKey.slice(0, 4)}-01-01.0000`
  const sourceDirs = (await listAlsReleaseDirectories(sourceRoot)).filter(sourceDir => {
    const sourceVersion = inferAlsSourceVersionFromPath(sourceDir)
    return sourceVersion !== null && sourceVersion >= firstSourceVersion
  })
  if (sourceDirs.length === 0) {
    throw new Error(
      `No ALS release directories found in ${resolve(sourceRoot)} on or after ${firstSourceVersion}.`,
    )
  }
  const review = await reviewHkgovAlsIngest({
    args,
    cohortKey,
    decisions,
    history,
    precedenceVariantDecisions,
    sourceDirs,
    target,
  })
  note(
    [
      formatField('releases', String(sourceDirs.length)),
      formatField(
        'precedenceVariantChoicesRequired',
        String(review.precedenceVariantCandidates),
      ),
      formatField('identityDriftChoicesRequired', String(review.driftCandidates)),
    ].join('\n'),
    'ALS REVIEW REQUIRED BEFORE INGESTION',
  )

  for (const sourceDir of sourceDirs) {
    const sourceVersion = inferAlsSourceVersionFromPath(sourceDir)
    if (!sourceVersion) continue
    const outputFile = resolveInvocationPath(
      '.local/hkgov-dpo/prepared',
      `hkgov-hk-${sourceVersion}-address.parquet`,
    )
    let result = await prepareHkgovAlsRelease({
      args,
      cohortKey,
      decisions,
      history,
      precedenceVariantDecisions,
      outputFile,
      sourceDir,
      sourceVersion,
      target,
    })
    if (result.precedenceVariantCandidates.length > 0) {
      if (args.options.yes) {
        throw new Error(
          `ALS precedence-variant choices require review. Run without --yes; decisions are retained in ${precedenceVariantDecisionsFile}.`,
        )
      }
      precedenceVariantDecisions = await promptForPrecedenceVariantDecisions(
        precedenceVariantDecisions,
        result.precedenceVariantCandidates,
      )
      await writeJson(precedenceVariantDecisionsFile, precedenceVariantDecisions)
      result = await prepareHkgovAlsRelease({
        args,
        cohortKey,
        decisions,
        history,
        precedenceVariantDecisions,
        outputFile,
        sourceDir,
        sourceVersion,
        target,
      })
    }
    if (result.driftCandidates.length > 0) {
      const reportFile = resolveInvocationPath(
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
        precedenceVariantDecisions,
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
        invocationCwd: INVOCATION_CWD,
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
  precedenceVariantDecisions?: HkgovAlsPrecedenceVariantDecisions
  outputFile: string
  sourceDir: string
  sourceVersion: string
  target: UploadTarget
  writeOutput?: boolean
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
      precedenceVariantDecisions: args.precedenceVariantDecisions,
      metaDb: dbContext?.metaDb,
      outputFile: args.outputFile,
      cohortKey: args.cohortKey,
      sourceDir: args.sourceDir,
      sourceVersion: args.sourceVersion,
      writeOutput: args.writeOutput,
    })
  } finally {
    await dbContext?.cleanup()
  }
}

async function reviewHkgovAlsIngest(args: {
  args: ParsedArgs
  cohortKey: string
  decisions: HkgovAlsIdentityDecisions
  history: HkgovAlsIdentityHistory
  precedenceVariantDecisions: HkgovAlsPrecedenceVariantDecisions
  sourceDirs: string[]
  target: UploadTarget
}) {
  let history = args.history
  const precedenceVariantCandidates = new Set<string>()
  const driftCandidates = new Set<string>()
  for (const sourceDir of args.sourceDirs) {
    const sourceVersion = inferAlsSourceVersionFromPath(sourceDir)
    if (!sourceVersion) continue
    const result = await prepareHkgovAlsRelease({
      args: args.args,
      cohortKey: args.cohortKey,
      decisions: args.decisions,
      history,
      outputFile: join(tmpdir(), `hkgov-als-review-${sourceVersion}.parquet`),
      precedenceVariantDecisions: args.precedenceVariantDecisions,
      sourceDir,
      sourceVersion,
      target: args.target,
      writeOutput: false,
    })
    for (const candidate of result.precedenceVariantCandidates) {
      precedenceVariantCandidates.add(candidate.identityKey)
    }
    for (const candidate of result.driftCandidates) {
      driftCandidates.add(
        `${candidate.previous.identityKey}\u0000${candidate.current.identityKey}`,
      )
    }
    history = mergeHkgovAlsIdentityHistory(history, result.identityRecords)
  }
  return {
    driftCandidates: driftCandidates.size,
    precedenceVariantCandidates: precedenceVariantCandidates.size,
  }
}

async function promptForPrecedenceVariantDecisions(
  decisions: HkgovAlsPrecedenceVariantDecisions,
  candidates: HkgovAlsPrecedenceVariantCandidate[],
) {
  const next = new Map(
    decisions.decisions.map(decision => [decision.identityKey, decision]),
  )
  for (const candidate of candidates) {
    const answer = await select({
      message:
        `Same ALS premise, conflicting source variants\n${candidate.address}\n` +
        'Choose which BlockDescriptorPrecedenceIndicator representation to retain.',
      options: candidate.variants.map((variant, index) => ({
        hint: `${variant.sourceFile} #${variant.featureIndexOneBased}`,
        label:
          variant.blockDescriptorPrecedenceIndicator == null
            ? 'Indicator absent'
            : `Indicator: ${variant.blockDescriptorPrecedenceIndicator}`,
        value: String(index),
      })),
    })
    if (isCancel(answer)) throw new Error('ALS precedence-variant review cancelled.')
    const selected = candidate.variants[Number(answer)]
    if (!selected) throw new Error('Invalid ALS precedence-variant selection.')
    next.set(candidate.identityKey, {
      blockDescriptorPrecedenceIndicator: selected.blockDescriptorPrecedenceIndicator,
      identityKey: candidate.identityKey,
    })
  }
  return {
    authority: 'hkgov-dpo' as const,
    decisions: [...next.values()].sort((left, right) =>
      left.identityKey.localeCompare(right.identityKey),
    ),
    version: 1 as const,
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

function resolveInvocationPath(...segments: string[]) {
  return resolve(INVOCATION_CWD, ...segments)
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

async function readPrecedenceVariantDecisions(filePath: string) {
  try {
    return parseHkgovAlsPrecedenceVariantDecisions(
      JSON.parse(await readFile(filePath, 'utf8')),
    )
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return emptyHkgovAlsPrecedenceVariantDecisions()
    }
    throw error
  }
}

async function writeDriftReport(
  filePath: string,
  sourceVersion: string,
  candidates: HkgovAlsIdentityDriftCandidate[],
) {
  await writeJson(resolveInvocationPath(filePath), {
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
