import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { isCancel, note, select } from '@clack/prompts'
import { and, eq, inArray } from 'drizzle-orm'

import { inferSourceVersionFromPath } from '@repo/core/uploadLocal'
import { metaSchema } from '@repo/db'

import { formatField } from '../../../harbour-cli/src/lib/cli/display.ts'
import {
  emptyHkgovAlsIdentityDecisions,
  emptyHkgovAlsIdentityHistory,
  mergeHkgovAlsIdentityHistory,
  parseHkgovAlsIdentityDecisions,
  parseHkgovAlsIdentityHistory,
  type HkgovAlsIdentityDecisions,
  type HkgovAlsIdentityDriftCandidate,
  type HkgovAlsIdentityHistory,
} from '../../../harbour-cli/src/lib/sources/hkgov/hkgovAlsDrift.ts'
import { prepareHkgovAlsAddressParquet } from '../../../harbour-cli/src/lib/sources/hkgov/hkgovAls.ts'
import { resolveLocalAddressDbContext } from '../../../harbour-cli/src/lib/addressSql/localDbCache.ts'
import { runUploadCommand } from '../../../harbour-cli/src/lib/commands/upload.ts'
import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'

const HKGOV_ALS_CATALOGUE_URL = 'https://data.gov.hk/en-data/dataset/hk-dpo-als_01-als'
const DEFAULT_HISTORY_FILE = '.local/hkgov-dpo/als-identity-history.json'
const DEFAULT_DECISIONS_FILE = '.local/hkgov-dpo/als-identity-decisions.json'
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
      'Invalid arguments for `hkgov-dpo:prepare`. Pass <source-dir> and --cohort-key; include --source-version only when it cannot be inferred from the path.',
    )
  }
  const outputFile = await createHkgovAlsTempOutputFile(sourceVersion)
  const historyFile = stringOption(args, 'identity-history')
  const decisionsFile = stringOption(args, 'identity-decisions')
  const result = await prepareHkgovAlsRelease({
    args,
    addressCohortKey: sourceVersion,
    divisionCohortKey: cohortKey,
    decisions: decisionsFile
      ? await readDecisions(resolveInvocationPath(decisionsFile))
      : emptyHkgovAlsIdentityDecisions(),
    history: historyFile
      ? await readHistory(resolveInvocationPath(historyFile))
      : emptyHkgovAlsIdentityHistory(),
    outputFile,
    sourceDir,
    sourceVersion,
    target,
  })

  if (result.sourceDuplicateFeatureGroups.length > 0) {
    note(
      formatSourceDuplicateSummary(result.sourceDuplicateFeatureGroups),
      'SOURCE DUPLICATES REMOVED',
    )
  }
  if (result.identityEquivalentFeatureGroups.length > 0) {
    note(
      formatSourceDuplicateSummary(result.identityEquivalentFeatureGroups),
      'EQUIVALENT ALS PREMISE VARIANTS CONSOLIDATED (SAME COMPLETE PREMISE IDENTITY)',
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
}

/**
 * Ingest every chronological ALS release below a directory. Source processing
 * stays on the operator machine; the selected target provides the published
 * division cohort and receives the resulting address release.
 */
export async function runHkgovAlsIngestCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  const sourceRoot = args.positionals[0]
    ? resolveInvocationPath(args.positionals[0])
    : undefined
  const cohortKey = stringOption(args, 'cohort-key')
  if (!sourceRoot || !cohortKey) {
    printUsage()
    throw new Error(
      'Pass <ALS-source-root> and --cohort-key (used to choose the default start year) to `hkgov-dpo:backfill-local`.',
    )
  }
  const historyFile = resolveInvocationPath(
    stringOption(args, 'identity-history') ?? DEFAULT_HISTORY_FILE,
  )
  const decisionsFile = resolveInvocationPath(
    stringOption(args, 'identity-decisions') ?? DEFAULT_DECISIONS_FILE,
  )
  let history = await readHistory(historyFile)
  let decisions = await readDecisions(decisionsFile)
  const firstSourceVersion = normaliseAlsSourceVersion(
    stringOption(args, 'from-source-version') ?? `${cohortKey.slice(0, 4)}-01-01.0`,
  )
  const sourceReleases = await resolveAlsSourceReleases(
    target,
    resolveAlsReleaseVersions(await listAlsReleaseDirectories(sourceRoot)).filter(
      release => release.sourceVersion >= firstSourceVersion,
    ),
  )
  if (sourceReleases.length === 0) {
    throw new Error(
      `No ALS release directories found in ${resolve(sourceRoot)} on or after ${firstSourceVersion}.`,
    )
  }
  const ingestedSourceVersions = await listTargetPublishedAlsSourceVersions(
    target,
    sourceReleases[0]?.sourceVersion.slice(0, 4) ?? cohortKey.slice(0, 4),
  )
  const review = await reviewHkgovAlsIngest({
    args,
    decisions,
    history,
    sourceReleases,
    target,
  })
  note(
    [
      formatField('releases', String(sourceReleases.length)),
      formatField(
        'divisionCohorts',
        [...new Set(sourceReleases.map(release => release.divisionCohortKey))].join(
          ', ',
        ),
      ),
      formatField('identityDriftChoicesRequired', String(review.driftCandidates)),
    ].join('\n'),
    'ALS REVIEW REQUIRED BEFORE INGESTION',
  )

  for (const {
    addressCohortKey,
    divisionCohortKey,
    sourceDir,
    sourceVersion,
  } of sourceReleases) {
    if (ingestedSourceVersions.has(sourceVersion) && !args.options.force) {
      note(
        'A published local address release already exists for this source version; skipping it.',
        `ALREADY INGESTED — ${sourceVersion}`,
      )
      continue
    }
    const outputFile = resolveInvocationPath(
      '.local/hkgov-dpo/prepared',
      `hkgov-hk-${sourceVersion}-address.parquet`,
    )
    let result = await prepareHkgovAlsRelease({
      args,
      addressCohortKey,
      divisionCohortKey,
      decisions,
      history,
      outputFile,
      sourceDir,
      sourceVersion,
      target,
    })
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
      decisions = await promptForDriftDecisions(
        decisions,
        result.driftCandidates,
        nextDecisions => writeJson(decisionsFile, nextDecisions),
      )
      result = await prepareHkgovAlsRelease({
        args,
        addressCohortKey,
        divisionCohortKey,
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
        formatSourceDuplicateSummary(result.sourceDuplicateFeatureGroups),
        `SOURCE DUPLICATES REMOVED — ${sourceVersion}`,
      )
    }
    if (result.identityEquivalentFeatureGroups.length > 0) {
      note(
        formatSourceDuplicateSummary(result.identityEquivalentFeatureGroups),
        `EQUIVALENT ALS PREMISE VARIANTS CONSOLIDATED (SAME COMPLETE PREMISE IDENTITY) — ${sourceVersion}`,
      )
    }
    await runUploadCommand(
      {
        command: 'upload',
        positionals: [result.outputFile],
        options: {
          'cohort-key': addressCohortKey,
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
        divisionCohortKey,
        forceUpload: Boolean(args.options.force),
        invocationCwd: INVOCATION_CWD,
        processingActions: result.processingActions,
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

/** Keep the legacy command deliberately local; updater intake uses :ingest. */
export async function runHkgovAlsLocalIngestCommand(
  args: ParsedArgs,
  target: UploadTarget,
  printUsage: () => void,
) {
  if (target.remote) {
    throw new Error('`hkgov-dpo:backfill-local` only supports --target local.')
  }
  return runHkgovAlsIngestCommand(args, target, printUsage)
}

async function listTargetPublishedAlsSourceVersions(
  target: UploadTarget,
  shardYear: string,
) {
  const dbContext = await resolveLocalAddressDbContext(target, 'hk', shardYear, {
    cacheTableProfile: 'address',
  })
  try {
    const rows = await dbContext.metaDb
      .select({ sourceVersion: metaSchema.metaReleases.sourceVersion })
      .from(metaSchema.metaReleases)
      .innerJoin(
        metaSchema.metaDatasets,
        eq(metaSchema.metaReleases.datasetId, metaSchema.metaDatasets.id),
      )
      .where(
        and(
          eq(metaSchema.metaDatasets.code, 'ds-hk-hkgov-dpo-address'),
          eq(metaSchema.metaReleases.status, 'published'),
        ),
      )
      .all()
    return new Set(rows.map(row => row.sourceVersion))
  } finally {
    await dbContext.cleanup()
  }
}

async function prepareHkgovAlsRelease(args: {
  args: ParsedArgs
  addressCohortKey: string
  divisionCohortKey: string
  decisions?: HkgovAlsIdentityDecisions
  history?: HkgovAlsIdentityHistory
  outputFile: string
  sourceDir: string
  sourceVersion: string
  target: UploadTarget
  postProcessPremiseStructure?: boolean
  writeOutput?: boolean
}) {
  const explicitDbPath = stringOption(args.args, 'db')
  const dbContext = explicitDbPath
    ? null
    : await resolveLocalAddressDbContext(
        args.target,
        'hk',
        args.addressCohortKey.slice(0, 4),
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
      cohortKey: args.addressCohortKey,
      divisionCohortKey: args.divisionCohortKey,
      sourceDir: args.sourceDir,
      sourceVersion: args.sourceVersion,
      postProcessPremiseStructure: args.postProcessPremiseStructure,
      writeOutput: args.writeOutput,
    })
  } finally {
    await dbContext?.cleanup()
  }
}

async function reviewHkgovAlsIngest(args: {
  args: ParsedArgs
  decisions: HkgovAlsIdentityDecisions
  history: HkgovAlsIdentityHistory
  sourceReleases: AlsSourceRelease[]
  target: UploadTarget
}) {
  let history = args.history
  const driftCandidates = new Set<string>()
  for (const {
    addressCohortKey,
    divisionCohortKey,
    sourceDir,
    sourceVersion,
  } of args.sourceReleases) {
    const result = await prepareHkgovAlsRelease({
      args: args.args,
      addressCohortKey,
      divisionCohortKey,
      decisions: args.decisions,
      history,
      outputFile: join(tmpdir(), `hkgov-als-review-${sourceVersion}.parquet`),
      sourceDir,
      sourceVersion,
      target: args.target,
      writeOutput: false,
    })
    for (const candidate of result.driftCandidates) {
      const key = `${candidate.previous.identityKey}\u0000${candidate.current.identityKey}`
      driftCandidates.add(key)
    }
    history = mergeHkgovAlsIdentityHistory(history, result.identityRecords)
  }
  return {
    driftCandidates: driftCandidates.size,
  }
}

async function promptForDriftDecisions(
  decisions: HkgovAlsIdentityDecisions,
  candidates: HkgovAlsIdentityDriftCandidate[],
  persist: (decisions: HkgovAlsIdentityDecisions) => Promise<void> = async () => {},
) {
  const next = [...decisions.decisions]
  note(
    `Review ${candidates.length} premise ${candidates.length === 1 ? 'change' : 'changes'} and choose whether each should retain its existing ID.`,
    'LIKELY ALS PREMISE DRIFT',
  )
  for (const candidate of candidates) {
    const answer = await select({
      message: formatDriftPrompt(candidate),
      showInstructions: false,
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
    await persist({ authority: 'hkgov-dpo', decisions: next, version: 1 })
  }
  return { authority: 'hkgov-dpo' as const, decisions: next, version: 1 as const }
}

function formatDriftPrompt(candidate: HkgovAlsIdentityDriftCandidate) {
  const before = formatIdentitySummary(candidate.previous.summary)
  const after = formatIdentitySummary(candidate.current.summary)
  const differences = Object.entries(candidate.current.summary)
    .filter(([key, value]) => candidate.previous.summary[key] !== value)
    .map(
      ([key, value]) =>
        `${formatIdentityFieldName(key)}: ${formatIdentityFieldValue(
          candidate.previous.summary[key],
          key,
        )} ⟶ ${formatIdentityFieldValue(value, key)}`,
    )
  return [`old: ${before}`, `new: ${after}`, '', ...differences, ''].join('\n')
}

function formatIdentityFieldName(key: string) {
  return (
    {
      blockDescriptor: 'Block descriptor',
      blockNumber: 'Block number',
      buildingName: 'Building name',
      estateName: 'Estate name',
      phaseName: 'Phase name',
      phaseNumber: 'Phase number',
      unitDescriptor: 'Unit descriptor',
      unitNumber: 'Unit number',
    }[key] ?? key
  )
}

function formatIdentityFieldValue(value: string | null | undefined, field: string) {
  return colorAddressElement(value == null ? '—' : value, field)
}

function formatIdentitySummary(summary: Record<string, string | null>) {
  return IDENTITY_SUMMARY_FIELDS.map(field => {
    const value = summary[field]
    return value ? colorAddressElement(value, field) : null
  })
    .filter((value): value is string => value != null)
    .join(' · ')
}

const IDENTITY_SUMMARY_FIELDS = [
  'buildingName',
  'blockDescriptor',
  'blockNumber',
  'estateName',
  'phaseName',
  'phaseNumber',
  'numberFrom',
  'numberTo',
  'routeName',
  'districtName',
  'csuId',
  'geoAddress',
] as const

// Keep each premise component the same colour in the old and new summaries so
// a reviewer can scan for additions, removals, and moved values at a glance.
const ADDRESS_ELEMENT_COLOURS = [196, 202, 220, 46, 48, 51, 39, 69, 93, 129, 201, 213]

function colorAddressElement(value: string, field: string) {
  const index = IDENTITY_SUMMARY_FIELDS.indexOf(
    field as (typeof IDENTITY_SUMMARY_FIELDS)[number],
  )
  if (index < 0) return value
  return `\u001B[38;5;${ADDRESS_ELEMENT_COLOURS[index]}m${value}\u001B[39m`
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

type AlsSourceRelease = {
  addressCohortKey: string
  divisionCohortKey: string
  sourceDir: string
  sourceVersion: string
}

/**
 * An address release must reference a published division snapshot from the same
 * database-shard year. Within that year use the latest snapshot not newer than
 * the ALS release; if none exists, use the first available snapshot.
 */
async function resolveAlsSourceReleases(
  target: UploadTarget,
  sourceReleases: Array<Pick<AlsSourceRelease, 'sourceDir' | 'sourceVersion'>>,
): Promise<AlsSourceRelease[]> {
  const cohortsByYear = new Map<string, string[]>()

  for (const year of new Set(
    sourceReleases.map(release => release.sourceVersion.slice(0, 4)),
  )) {
    const dbContext = await resolveLocalAddressDbContext(target, 'hk', year, {
      cacheTableProfile: 'address',
    })
    try {
      const rows = await dbContext.metaDb
        .select({
          cohortKey: metaSchema.metaSnapshots.cohortKey,
        })
        .from(metaSchema.metaSnapshotSources)
        .innerJoin(
          metaSchema.metaReleases,
          and(
            eq(
              metaSchema.metaReleases.id,
              metaSchema.metaSnapshotSources.sourceReleaseId,
            ),
            eq(
              metaSchema.metaReleases.datasetId,
              metaSchema.metaSnapshotSources.datasetId,
            ),
          ),
        )
        .innerJoin(
          metaSchema.metaDatasets,
          eq(metaSchema.metaDatasets.id, metaSchema.metaSnapshotSources.datasetId),
        )
        .innerJoin(
          metaSchema.metaSnapshots,
          eq(metaSchema.metaSnapshots.id, metaSchema.metaSnapshotSources.snapshotId),
        )
        .innerJoin(
          metaSchema.metaSnapshotLineages,
          eq(
            metaSchema.metaSnapshots.snapshotLineageId,
            metaSchema.metaSnapshotLineages.id,
          ),
        )
        .where(
          and(
            // Overture source releases are superseded by later monthly releases,
            // but their published division snapshots remain valid historical
            // anchors for same-year ALS shards.
            inArray(metaSchema.metaReleases.status, ['published', 'superseded']),
            eq(metaSchema.metaDatasets.code, 'ds-hk-overture-division'),
            eq(metaSchema.metaDatasets.regionCode, 'hk'),
            eq(metaSchema.metaSnapshots.resourceType, 'division'),
            eq(metaSchema.metaSnapshots.status, 'published'),
            eq(metaSchema.metaSnapshotLineages.regionCode, 'hk'),
            eq(metaSchema.metaSnapshotLineages.variant, 'overture'),
            eq(metaSchema.metaSnapshotSources.role, 'primary'),
          ),
        )
        .all()
      cohortsByYear.set(
        year,
        [
          ...new Set(rows.map(row => row.cohortKey).filter(isSameYearCohort(year))),
        ].sort(),
      )
    } finally {
      await dbContext.cleanup()
    }
  }

  return sourceReleases.map(release => {
    const divisionCohortKey = selectAlsDivisionCohort(
      release.sourceVersion,
      cohortsByYear.get(release.sourceVersion.slice(0, 4)) ?? [],
    )
    return {
      ...release,
      addressCohortKey: release.sourceVersion,
      divisionCohortKey,
    }
  })
}

/** Select the latest same-year cohort not later than the ALS release. */
export function selectAlsDivisionCohort(
  sourceVersion: string,
  publishedCohorts: readonly string[],
) {
  const year = sourceVersion.slice(0, 4)
  const cohorts = [...new Set(publishedCohorts.filter(isSameYearCohort(year)))].sort()
  const cohort = cohorts.filter(value => value <= sourceVersion).at(-1) ?? cohorts[0]
  if (!cohort) {
    throw new Error(
      `No published Overture division snapshot is available for the ${year} ALS shard. ` +
        'Publish a same-year division release before ingesting these addresses.',
    )
  }
  return cohort
}

function isSameYearCohort(year: string) {
  return (cohortKey: string) => cohortKey.startsWith(`${year}-`)
}

function resolveAlsSourceVersion(args: ParsedArgs, sourceDir: string | undefined) {
  const sourceVersion =
    stringOption(args, 'source-version') ??
    inferSourceVersionFromPath(sourceDir ?? '') ??
    inferAlsSourceVersionFromPath(sourceDir ?? '')

  return sourceVersion ? normaliseAlsSourceVersion(sourceVersion) : null
}

/**
 * ALS directory names include a delivery time (`YYYYMMDD-HHMM`) rather than a
 * provider correction sequence. Release versions use the date and a compact,
 * zero-based correction number instead. The delivery time only orders multiple
 * files delivered on one date.
 */
export function resolveAlsReleaseVersions(sourceDirs: string[]) {
  const releases = sourceDirs.flatMap(sourceDir => {
    const deliveryVersion = inferAlsDeliveryVersionFromPath(sourceDir)
    return deliveryVersion ? [{ sourceDir, deliveryVersion }] : []
  })
  const correctionByDate = new Map<string, number>()

  return releases
    .sort((left, right) => left.deliveryVersion.localeCompare(right.deliveryVersion))
    .map(({ sourceDir, deliveryVersion }) => {
      const date = deliveryVersion.slice(0, 10)
      const correction = correctionByDate.get(date) ?? 0
      correctionByDate.set(date, correction + 1)
      return { sourceDir, sourceVersion: `${date}.${correction}` }
    })
}

function normaliseAlsSourceVersion(value: string) {
  const match = value.match(/^(20\d{2}-\d{2}-\d{2})(?:\.(\d+))?$/)
  if (!match) {
    return value
  }

  const [, date, correction] = match
  // Legacy ALS inputs used HHMM as this suffix. Preserve intentional compact
  // correction values while collapsing the legacy timestamp form to .0.
  return `${date}.${correction && correction.length < 3 ? correction : '0'}`
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

export function formatSourceDuplicateSummary(
  groups: Array<{
    address: string
    canonicalRecord?: Record<string, unknown>
    ignoredRecords?: Array<Record<string, unknown>>
    occurrences: Array<{
      featureIndexOneBased: number
      sourceFile: string
    }>
  }>,
) {
  const sourceFeatures = groups.reduce(
    (count, group) => count + group.occurrences.length,
    0,
  )
  const sourceFiles = new Set(
    groups.flatMap(group => group.occurrences.map(occurrence => occurrence.sourceFile)),
  )

  return [
    formatField('affectedPremises', String(groups.length)),
    formatField('sourceFeaturesInvolved', String(sourceFeatures)),
    formatField('sourceFeaturesRemoved', String(sourceFeatures - groups.length)),
    formatField('sourceFilesInvolved', String(sourceFiles.size)),
  ].join('\n')
}

export function inferAlsSourceVersionFromPath(value: string) {
  const deliveryVersion = inferAlsDeliveryVersionFromPath(value)
  return deliveryVersion ? `${deliveryVersion.slice(0, 10)}.0` : null
}

function inferAlsDeliveryVersionFromPath(value: string) {
  const match = value.match(
    /(?:^|[/\\])(20\d{2})(\d{2})(\d{2})-(\d{4})-ALS-GeoJSON(?:[/\\]|$)/i,
  )
  return match ? `${match[1]}-${match[2]}-${match[3]}.${match[4]}` : null
}

async function createHkgovAlsTempOutputFile(sourceVersion: string) {
  const tempDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-dpo-'))
  return join(tempDir, `hkgov-hk-${sourceVersion}-address.parquet`)
}
