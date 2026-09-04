import { mkdir, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { isCancel, log, note, select } from '@clack/prompts'
import { and, eq, inArray } from 'drizzle-orm'

import { inferSourceVersionFromPath } from '@repo/core/uploadLocal'
import { currentSchema, historySchema, metaSchema, toIsoTimestamp } from '@repo/db'

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
import {
  prepareHkgovAlsAddressParquet,
  type HkgovAlsDivisionQuality,
} from '../../../harbour-cli/src/lib/sources/hkgov/hkgovAls.ts'
import { resolveLocalAddressDbContext } from '../../../harbour-cli/src/lib/dbCache/localDbCache.ts'
import { runUploadCommand } from '../../../harbour-cli/src/lib/commands/upload.ts'
import { resolveSnapshotReplayPlan } from '@repo/core/db/metaRegistry'
import {
  groupResolvedVersionsByShard,
  resolveSnapshotVersionState,
  type ResolvedSnapshotVersion,
} from '@repo/core/pipeline/db/snapshotReplay'
import {
  hasAllOvertureHongKongAreaDivisions,
  overtureHongKongAreas,
  overtureHongKongAreaDivisionId,
} from '@repo/core/pipeline/services/overtureHongKongAreas'
import type {
  ParsedArgs,
  UploadTarget,
} from '../../../harbour-cli/src/lib/cli/options.ts'
import { terminalSafeText } from '../lib/terminal.ts'

const HKGOV_ALS_CATALOGUE_URL = 'https://data.gov.hk/en-data/dataset/hk-dpo-als_01-als'
const REPO_ROOT = resolve(import.meta.dir, '../../../..')
const DEFAULT_HISTORY_FILE = resolve(
  REPO_ROOT,
  '.local/hkgov-dpo/als-identity-history.json',
)
export const HKGOV_ALS_IDENTITY_CURATION_PATH = resolve(
  REPO_ROOT,
  'fixtures/meta/curations/hkgov-dpo-address.json',
)
const DEFAULT_DECISIONS_FILE = HKGOV_ALS_IDENTITY_CURATION_PATH
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
      : await readDecisions(DEFAULT_DECISIONS_FILE),
    history: historyFile
      ? await readHistory(resolveInvocationPath(historyFile))
      : emptyHkgovAlsIdentityHistory(),
    outputFile,
    sourceDir,
    sourceVersion,
    target,
  })

  if (result.divisionQuality.issues.length > 0) {
    note(
      formatAlsDivisionQualitySummary(sourceVersion, result.divisionQuality),
      'ALS DIVISION LINKAGE ISSUES',
    )
  }

  if (result.sourceDuplicateFeatureGroups.length > 0) {
    note(
      formatAlsPreflightReleaseSummary(
        sourceVersion,
        result.sourceDuplicateFeatureGroups,
      ),
      'DEDUPLICATION',
    )
  }
  if (result.identityEquivalentFeatureGroups.length > 0) {
    note(
      formatAlsPreflightReleaseSummary(
        sourceVersion,
        result.identityEquivalentFeatureGroups,
      ),
      'CONSOLIDATION',
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
  options: HkgovAlsIngestOptions = {},
) {
  const sourceRoot = args.positionals[0]
    ? resolveInvocationPath(args.positionals[0])
    : undefined
  const cohortKey = stringOption(args, 'cohort-key')
  if (!sourceRoot || !cohortKey) {
    printUsage()
    throw new Error(
      `Pass <ALS-source-root> and --cohort-key (used to choose the default start year) to \`${args.command}\`.`,
    )
  }
  const historyFile = resolveInvocationPath(
    stringOption(args, 'identity-history') ?? DEFAULT_HISTORY_FILE,
  )
  const decisionsOption = stringOption(args, 'identity-decisions')
  const decisionsFile = decisionsOption
    ? resolveInvocationPath(decisionsOption)
    : DEFAULT_DECISIONS_FILE
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
  for (const divisionCohortKey of new Set(
    sourceReleases.map(release => release.divisionCohortKey),
  )) {
    await materialiseDivisionSnapshotForAddressRelease(target, divisionCohortKey)
  }
  const completedSourceVersions = await listTargetCompletedAlsSourceVersions(
    target,
    sourceReleases[0]?.sourceVersion.slice(0, 4) ?? cohortKey.slice(0, 4),
    shouldIncludeSupersededAlsSourceVersions({
      allowHistoricalCohort: options.allowHistoricalCohort,
      continue: args.options.continue === true,
    }),
  )
  const review = await reviewHkgovAlsIngest({
    args,
    decisions,
    history,
    sourceReleases,
    target,
  })
  log.message('\u001B[36mALS Preflight Checks\u001B[39m')
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
    'DATASETS',
  )

  for (const {
    addressCohortKey,
    divisionCohortKey,
    sourceDir,
    sourceVersion,
  } of sourceReleases) {
    if (completedSourceVersions.has(sourceVersion) && !args.options.force) {
      note(
        'A completed local address release already exists for this source version; skipping it.',
        `ALREADY COMPLETED — ${sourceVersion}`,
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
          [
            'ALS identity drift requires interactive review; --yes cannot choose premise identities.',
            `Wrote ${reportFile}.`,
            'Review this release with:',
            formatAlsReviewCommand({
              cohortKey: addressCohortKey,
              sourceVersion,
              target,
            }),
            'After the decisions are saved, rerun the update with --yes.',
          ].join('\n'),
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
        formatAlsPreflightReleaseSummary(
          sourceVersion,
          result.sourceDuplicateFeatureGroups,
        ),
        'DEDUPLICATION',
      )
    }
    if (result.identityEquivalentFeatureGroups.length > 0) {
      note(
        formatAlsPreflightReleaseSummary(
          sourceVersion,
          result.identityEquivalentFeatureGroups,
        ),
        'CONSOLIDATION',
      )
    }
    await runUploadCommand(
      {
        command: 'upload',
        positionals: [result.outputFile],
        options: {
          'cohort-key': addressCohortKey,
          ...(args.options.continue === true ? { continue: true } : {}),
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
        ...(options.allowHistoricalCohort ? { allowHistoricalCohort: true } : {}),
        deferApiReleaseSet: args.options['defer-api-release-set'] === true,
        dryRun: Boolean(args.options['dry-run']),
        divisionCohortKey,
        forceUpload: Boolean(args.options.force),
        invocationCwd: INVOCATION_CWD,
        processingActions: result.processingActions,
        quality: result.divisionQuality,
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

function formatAlsReviewCommand(input: {
  cohortKey: string
  sourceVersion: string
  target: UploadTarget
}) {
  return [
    'bun run dataops -- hkgov-dpo:ingest',
    'data/hkgov/dpo/ALS',
    `--target ${input.target.environment === 'dev' ? 'local' : input.target.environment}`,
    `--cohort-key ${input.cohortKey}`,
    `--from-source-version ${input.sourceVersion}`,
  ].join(' ')
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
  return runHkgovAlsIngestCommand(args, target, printUsage, {
    allowHistoricalCohort: true,
  })
}

type HkgovAlsIngestOptions = {
  /**
   * A local historical backfill creates an independent address cohort. It must
   * not supersede the newer active source release or API cohort.
   */
  allowHistoricalCohort?: boolean
}

export function shouldIncludeSupersededAlsSourceVersions(input: {
  allowHistoricalCohort?: boolean
  continue?: boolean
}) {
  // A historical backfill starts before the newest release. Every later
  // completed release is normally superseded, so treating only the active
  // release as complete would needlessly reprocess the rest of the series.
  return input.allowHistoricalCohort === true || input.continue === true
}

async function listTargetCompletedAlsSourceVersions(
  target: UploadTarget,
  shardYear: string,
  includeSuperseded: boolean,
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
          inArray(
            metaSchema.metaReleases.status,
            includeSuperseded ? ['published', 'superseded'] : ['published'],
          ),
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
      historyDb: dbContext?.historyDb,
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

/**
 * Address rows retain the exact division snapshot selected for their cohort.
 * Current storage may evict an older projection, while immutable history keeps
 * it; restore that projection before ALS preparation builds its division lookup
 * and before address SQL introduces its foreign keys. History is a delta journal,
 * so replay the complete parent-to-target snapshot rather than reading one
 * snapshot's history rows in isolation.
 */
async function materialiseDivisionSnapshotForAddressRelease(
  target: UploadTarget,
  cohortKey: string,
) {
  const context = await resolveLocalAddressDbContext(
    target,
    'hk',
    cohortKey.slice(0, 4),
    {
      cacheTableProfile: 'address',
      includeAllHistoryShardYears: true,
    },
  )
  try {
    const snapshot = await context.metaDb
      .select({ id: metaSchema.metaSnapshots.id })
      .from(metaSchema.metaSnapshots)
      .innerJoin(
        metaSchema.metaSnapshotLineages,
        eq(
          metaSchema.metaSnapshots.snapshotLineageId,
          metaSchema.metaSnapshotLineages.id,
        ),
      )
      .where(
        and(
          eq(metaSchema.metaSnapshots.resourceType, 'division'),
          eq(metaSchema.metaSnapshots.status, 'published'),
          eq(metaSchema.metaSnapshots.cohortKey, cohortKey),
          eq(metaSchema.metaSnapshotLineages.variant, 'overture'),
        ),
      )
      .limit(1)
      .get()
    if (!snapshot) {
      throw new Error(
        `No published Overture division snapshot found for cohort ${cohortKey}.`,
      )
    }
    const [presentDivisions, presentI18n] = await Promise.all([
      context.currentDb
        .select({ id: currentSchema.divisions.id })
        .from(currentSchema.divisions)
        .where(eq(currentSchema.divisions.snapshotId, snapshot.id))
        .all(),
      context.currentDb
        .select({
          divisionId: currentSchema.divisionsI18n.divisionId,
          locale: currentSchema.divisionsI18n.locale,
        })
        .from(currentSchema.divisionsI18n)
        .where(eq(currentSchema.divisionsI18n.snapshotId, snapshot.id))
        .all(),
    ])
    const historyShards = new Map(
      context.historyTargets.map(target => [
        target.bindingName,
        {
          bindingName: target.bindingName,
          db: target.db as never,
        },
      ]),
    )
    const replayPlan = await resolveSnapshotReplayPlan(
      context.metaDb as never,
      snapshot.id,
    )
    const replayedVersions = await resolveSnapshotVersionState(
      replayPlan,
      historyShards,
      ['division', 'divisionI18n'],
    )
    const divisionVersions = [...replayedVersions.values()].filter(
      version => version.recordType === 'division',
    )
    const i18nVersions = [...replayedVersions.values()].filter(
      version => version.recordType === 'divisionI18n',
    )
    const [divisions, i18n] = await Promise.all([
      loadReplayedDivisionRows(divisionVersions),
      loadReplayedDivisionI18nRows(i18nVersions),
    ])
    if (divisions.length === 0) {
      throw new Error(
        `Division snapshot ${snapshot.id} is absent from both current storage and immutable history.`,
      )
    }
    if (!hasAllOvertureHongKongAreaDivisions(divisions.map(row => row.id))) {
      const areaNames = overtureHongKongAreas
        .filter(
          area =>
            !divisions.some(
              row => row.id === overtureHongKongAreaDivisionId(area.code),
            ),
        )
        .map(area => area.names.en)
        .join(', ')
      throw new Error(
        `Replayed division snapshot ${snapshot.id} is missing canonical Hong Kong Area rows (${areaNames}).`,
      )
    }
    const materialisedI18n = filterDivisionI18nToKnownDivisions(
      i18n,
      new Set(divisions.map(row => row.id)),
    )
    if (
      !hasAllOvertureHongKongAreaDivisions(materialisedI18n.map(row => row.divisionId))
    ) {
      const areaNames = overtureHongKongAreas
        .filter(
          area =>
            !materialisedI18n.some(
              row => row.divisionId === overtureHongKongAreaDivisionId(area.code),
            ),
        )
        .map(area => area.names.en)
        .join(', ')
      throw new Error(
        `Replayed division snapshot ${snapshot.id} is missing Hong Kong Area translations (${areaNames}).`,
      )
    }
    const expectedDivisionIds = new Set(divisions.map(row => row.id))
    const presentDivisionIds = new Set(presentDivisions.map(row => row.id))
    const expectedI18nKeys = new Set(
      materialisedI18n.map(row => `${row.divisionId}\u0000${row.locale}`),
    )
    const presentI18nKeys = new Set(
      presentI18n.map(row => `${row.divisionId}\u0000${row.locale}`),
    )
    if (
      expectedDivisionIds.size === presentDivisionIds.size &&
      [...expectedDivisionIds].every(id => presentDivisionIds.has(id)) &&
      expectedI18nKeys.size === presentI18nKeys.size &&
      [...expectedI18nKeys].every(key => presentI18nKeys.has(key))
    ) {
      return
    }

    const now = toIsoTimestamp()
    for (const rows of chunk(divisions, 8)) {
      await context.currentDb
        .insert(currentSchema.divisions)
        .values(
          rows.map(row => ({
            ...row,
            createdAt: now,
            snapshotId: snapshot.id,
            updatedAt: now,
          })),
        )
        .onConflictDoNothing()
        .run()
    }
    for (const rows of chunk(materialisedI18n, 8)) {
      await context.currentDb
        .insert(currentSchema.divisionsI18n)
        .values(
          rows.map(row => ({
            ...row,
            createdAt: now,
            snapshotId: snapshot.id,
            updatedAt: now,
          })),
        )
        .onConflictDoNothing()
        .run()
    }
  } finally {
    context.cleanup()
  }
}

const SNAPSHOT_REPLAY_QUERY_BATCH_SIZE = 80

export function filterDivisionI18nToKnownDivisions<T extends { divisionId: string }>(
  rows: readonly T[],
  divisionIds: ReadonlySet<string>,
) {
  return rows.filter(row => divisionIds.has(row.divisionId))
}

async function loadReplayedDivisionRows(versions: ResolvedSnapshotVersion[]) {
  const rows: Array<
    Omit<
      typeof currentSchema.divisions.$inferSelect,
      'snapshotId' | 'createdAt' | 'updatedAt'
    > & { versionHash: string }
  > = []

  for (const shardVersions of groupResolvedVersionsByShard(versions).values()) {
    const expected = new Set(
      shardVersions.map(version => `${version.recordId}\u0000${version.versionHash}`),
    )
    const db = shardVersions[0]?.shard.db
    if (!db) continue

    for (const versionBatch of chunk(shardVersions, SNAPSHOT_REPLAY_QUERY_BATCH_SIZE)) {
      const versionHashes = [
        ...new Set(versionBatch.map(version => version.versionHash)),
      ]
      const batchRows = await db
        .select({
          bbox: historySchema.divisions.bbox,
          cartography: historySchema.divisions.cartography,
          divisionCode: historySchema.divisions.divisionCode,
          geometry: historySchema.divisions.geometry,
          hierarchy: historySchema.divisions.hierarchy,
          id: historySchema.divisions.id,
          identifiers: historySchema.divisions.identifiers,
          level: historySchema.divisions.level,
          sourceKeys: historySchema.divisions.sourceKeys,
          sources: historySchema.divisions.sources,
          type: historySchema.divisions.type,
          versionHash: historySchema.divisions.versionHash,
          wikidata: historySchema.divisions.wikidata,
        })
        .from(historySchema.divisions)
        .where(inArray(historySchema.divisions.versionHash, versionHashes))
        .all()

      rows.push(
        ...batchRows.filter(row => expected.has(`${row.id}\u0000${row.versionHash}`)),
      )
    }
  }

  return rows.map(({ versionHash: _versionHash, ...row }) => row)
}

async function loadReplayedDivisionI18nRows(versions: ResolvedSnapshotVersion[]) {
  const rows: Array<
    Omit<
      typeof currentSchema.divisionsI18n.$inferSelect,
      'snapshotId' | 'createdAt' | 'updatedAt'
    > & { versionHash: string }
  > = []

  for (const shardVersions of groupResolvedVersionsByShard(versions).values()) {
    const expected = new Set(
      shardVersions.map(
        version =>
          `${version.recordId}\u0000${version.versionHash}\u0000${version.locale}`,
      ),
    )
    const db = shardVersions[0]?.shard.db
    if (!db) continue

    for (const versionBatch of chunk(shardVersions, SNAPSHOT_REPLAY_QUERY_BATCH_SIZE)) {
      const versionHashes = [
        ...new Set(versionBatch.map(version => version.versionHash)),
      ]
      const batchRows = await db
        .select({
          divisionId: historySchema.divisionsI18n.divisionId,
          isLocaleInferred: historySchema.divisionsI18n.isLocaleInferred,
          locale: historySchema.divisionsI18n.locale,
          name: historySchema.divisionsI18n.name,
          nameAlts: historySchema.divisionsI18n.nameAlts,
          nameProvenance: historySchema.divisionsI18n.nameProvenance,
          nameRules: historySchema.divisionsI18n.nameRules,
          nameVariant: historySchema.divisionsI18n.nameVariant,
          versionHash: historySchema.divisionsI18n.versionHash,
        })
        .from(historySchema.divisionsI18n)
        .where(inArray(historySchema.divisionsI18n.versionHash, versionHashes))
        .all()

      rows.push(
        ...batchRows.filter(row =>
          expected.has(`${row.divisionId}\u0000${row.versionHash}\u0000${row.locale}`),
        ),
      )
    }
  }

  return rows.map(({ versionHash: _versionHash, ...row }) => row)
}

function* chunk<T>(rows: T[], size: number) {
  for (let index = 0; index < rows.length; index += size) {
    yield rows.slice(index, index + size)
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
    if (result.divisionQuality.issues.length > 0) {
      note(
        formatAlsDivisionQualitySummary(sourceVersion, result.divisionQuality),
        'ALS DIVISION LINKAGE ISSUES',
      )
    }
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
  const safeValue = terminalSafeText(value)
  const index = IDENTITY_SUMMARY_FIELDS.indexOf(
    field as (typeof IDENTITY_SUMMARY_FIELDS)[number],
  )
  if (index < 0) return safeValue
  return `\u001B[38;5;${ADDRESS_ELEMENT_COLOURS[index]}m${safeValue}\u001B[39m`
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
          snapshotId: metaSchema.metaSnapshots.id,
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
      const candidateSnapshotIds = rows.map(row => row.snapshotId)
      const [currentRows, historyRows] = await Promise.all([
        dbContext.currentDb
          .select({ snapshotId: currentSchema.divisions.snapshotId })
          .from(currentSchema.divisions)
          .where(inArray(currentSchema.divisions.snapshotId, candidateSnapshotIds))
          .all(),
        dbContext.historyDb
          .select({ snapshotId: historySchema.divisions.snapshotId })
          .from(historySchema.divisions)
          .where(inArray(historySchema.divisions.snapshotId, candidateSnapshotIds))
          .all(),
      ])
      const materialisedSnapshotIds = new Set([
        ...currentRows.map(row => row.snapshotId),
        ...historyRows.map(row => row.snapshotId),
      ])
      cohortsByYear.set(
        year,
        [
          ...new Set(
            rows
              .filter(row => materialisedSnapshotIds.has(row.snapshotId))
              .map(row => row.cohortKey)
              .filter(isSameYearCohort(year)),
          ),
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

export function formatAlsDivisionQualitySummary(
  sourceVersion: string,
  quality: HkgovAlsDivisionQuality,
) {
  const issues = quality.issues.map(issue => {
    const divisions = [
      issue.areaStatus !== 'matched'
        ? `area ${issue.areaStatus}: ${issue.areaName ?? '—'}`
        : null,
      issue.districtStatus !== 'matched'
        ? `district ${issue.districtStatus}: ${issue.districtName ?? '—'}`
        : null,
    ].filter((division): division is string => division !== null)

    return `- ${issue.address} | ${divisions.join(' | ')} | ${issue.sourceFile} #${issue.sourceFeatureIndexOneBased}`
  })

  return [
    `\u001B[31m${sourceVersion}\u001B[39m`,
    formatField('unmatchedArea', String(quality.unmatched_area_count)),
    formatField('ambiguousArea', String(quality.ambiguous_area_count)),
    formatField('unmatchedDistrict', String(quality.unmatched_district_count)),
    formatField('ambiguousDistrict', String(quality.ambiguous_district_count)),
    '',
    ...issues,
  ].join('\n')
}

function formatAlsPreflightReleaseSummary(
  sourceVersion: string,
  duplicateGroups: Parameters<typeof formatSourceDuplicateSummary>[0],
) {
  return [
    `\u001B[31m${sourceVersion}\u001B[39m`,
    formatSourceDuplicateSummary(duplicateGroups),
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
