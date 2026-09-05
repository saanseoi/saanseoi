import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { confirm, isCancel, note, outro } from '@clack/prompts'
import { not } from 'drizzle-orm'
import {
  and,
  currentSchema,
  eq,
  historySchema,
  inArray,
  metaSchema,
  or,
  sourceSchema,
} from '@repo/db'
import type { HarbourReadableDb } from '@repo/core/db/types'

import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { describeTarget, formatField } from '../cli/display.ts'
import { resolveLocalAddressDbContext } from '../dbCache/localDbCache.ts'
import {
  executeResetSqlArtefacts,
  type ResetSqlArtefact,
  validateResetArguments,
} from '../pipeline/resetLifecycle.ts'
import { deleteManagedSourceAsset } from '../sources/sourceAssets.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const MANIFEST_ROOT = resolve(REPO_ROOT, '.local/overture-places/init-runs')
const RELEASE_ARTEFACT_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/releases')
const DATASET_CODE = 'ds-hk-overture-place'

type PlacesInitManifest = {
  createdAt: string
  completedAt?: string
  owned?: OwnedPlaces
  runId: string
  status: 'running' | 'complete'
  target: 'local' | 'preview' | 'production'
  version: 1
}

function targetName(target: UploadTarget): PlacesInitManifest['target'] {
  return !target.remote
    ? 'local'
    : target.environment === 'production'
      ? 'production'
      : 'preview'
}

function manifestPath(target: UploadTarget) {
  return resolve(MANIFEST_ROOT, `${targetName(target)}.json`)
}

/** Start Places initialisation only from an empty Places baseline. */
export async function beginOverturePlacesInitialisation(
  target: UploadTarget,
  options: { continue: boolean } = { continue: false },
) {
  const path = manifestPath(target)
  if (existsSync(path)) {
    const existing = await readPlacesManifest(path)
    if (options.continue && existing.status === 'running') {
      note(formatField('manifest', path), 'RESUMING OVERTURE PLACES INITIALISATION')
      return
    }
    throw new Error(
      `An Overture Places initialisation manifest already exists: ${path}. Reset it before starting another clean initialisation.`,
    )
  }

  const context = await resolveLocalAddressDbContext(target, 'hk', '2025', {
    cacheTableProfile: 'places',
    includeAllHistoryShardYears: true,
    includeAllSourceShardYears: true,
    requireExistingRemoteCache: target.remote,
  })
  try {
    await assertCleanPlacesBaseline(context)
    const manifest: PlacesInitManifest = {
      createdAt: new Date().toISOString(),
      runId: crypto.randomUUID(),
      status: 'running',
      target: targetName(target),
      version: 1,
    }
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`)
    note(formatField('manifest', path), 'OVERTURE PLACES INITIALISATION')
  } finally {
    context.cleanup()
  }
}

/** Complete the Places manifest after release-set and documentation work. */
export async function completeOverturePlacesInitialisation(target: UploadTarget) {
  const path = manifestPath(target)
  const manifest = await readPlacesManifest(path)
  if (manifest.status !== 'running')
    throw new Error('Overture Places initialisation is not running.')
  const context = await resolveLocalAddressDbContext(target, 'hk', '2025', {
    cacheTableProfile: 'places',
    includeAllHistoryShardYears: true,
    includeAllSourceShardYears: true,
    requireExistingRemoteCache: target.remote,
  })
  try {
    const owned = await collectOwnedPlaces(
      context.metaDb as unknown as HarbourReadableDb,
    )
    await assertPlacesInitialisationComplete(
      context.metaDb as unknown as HarbourReadableDb,
      owned,
    )
    manifest.owned = owned
    manifest.completedAt = new Date().toISOString()
    manifest.status = 'complete'
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`)
  } finally {
    context.cleanup()
  }
}

/** Remove the release-owned Places initialisation as one explicit family unit. */
export async function runResetOverturePlacesCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: { printUsage: () => void },
) {
  const dryRun = args.options['dry-run'] === true
  const keepCache = args.options['keep-cache'] === true
  const yes = args.options.yes === true
  validateResetArguments(args, options.printUsage, 'reset:places:overture', [
    'dry-run',
    'yes',
    'keep-cache',
  ])

  const manifest = await readPlacesManifest(manifestPath(target))
  if (manifest.target !== targetName(target))
    throw new Error('Reset requires an Overture Places manifest for this target.')

  const context = await resolveLocalAddressDbContext(target, 'hk', '2025', {
    cacheTableProfile: 'places',
    includeAllHistoryShardYears: true,
    includeAllSourceShardYears: true,
    requireExistingRemoteCache: target.remote,
  })
  try {
    if (!['running', 'complete'].includes(manifest.status))
      throw new Error(
        'Reset requires an active Overture Places initialisation manifest.',
      )
    const owned =
      manifest.status === 'running'
        ? await collectOwnedPlaces(context.metaDb as unknown as HarbourReadableDb)
        : manifest.owned
    if (!owned)
      throw new Error(
        'Overture Places initialisation manifest is missing owned records.',
      )
    await assertPlacesResetStillSafe(context, owned)

    note(
      [
        formatField('target', describeTarget(target).label),
        formatField('dataset', DATASET_CODE),
        formatField('releases', String(owned.releaseIds.length)),
        formatField('snapshots', String(owned.snapshotIds.length)),
        formatField('api release sets', String(owned.apiReleaseSetIds.length)),
        formatField('assets', String(owned.assets.length)),
        formatField('dryRun', String(dryRun)),
        formatField('keepCache', String(keepCache)),
      ].join('\n'),
      'OVERTURE PLACES RESET PLAN',
    )
    if (!dryRun && !yes) {
      const accepted = await confirm({
        message: `Remove the Overture Places initialisation from ${describeTarget(target).label}?`,
        initialValue: false,
      })
      if (isCancel(accepted) || !accepted) throw new Error('Places reset cancelled.')
    }
    if (dryRun) return

    for (const asset of owned.assets) await deleteManagedSourceAsset(target, asset)
    const artefacts = buildResetArtefacts(context, owned)
    await executeResetSqlArtefacts({
      artefacts,
      cacheReleaseCodes: owned.releaseCodes,
      cacheRoot: RELEASE_ARTEFACT_ROOT,
      context,
      keepCache,
      remoteCacheErrorMessage:
        'Remote Places reset succeeded but its local cache could not be updated',
      target,
    })
    await rm(manifestPath(target), { force: true })
    outro('Overture Places reset complete')
  } finally {
    context.cleanup()
  }
}

type OwnedPlaces = {
  apiReleaseSetIds: string[]
  assets: Array<{ assetKey: string; id: string; releaseId: string | null }>
  releaseCodes: string[]
  releaseIds: string[]
  snapshotIds: string[]
  sourceReleaseIds: string[]
}

export async function collectOwnedPlaces(db: HarbourReadableDb): Promise<OwnedPlaces> {
  const releases = await db
    .select({
      code: metaSchema.metaReleases.code,
      id: metaSchema.metaReleases.id,
      sourceReleaseId: metaSchema.metaReleases.sourceReleaseId,
    })
    .from(metaSchema.metaReleases)
    .innerJoin(
      metaSchema.metaDatasets,
      eq(metaSchema.metaReleases.datasetId, metaSchema.metaDatasets.id),
    )
    .where(
      and(
        eq(metaSchema.metaDatasets.code, DATASET_CODE),
        eq(metaSchema.metaReleases.resourceType, 'place'),
      ),
    )
    .all()
  const releaseIds = releases.map(row => row.id)
  const snapshotRows = await db
    .select({
      snapshotId: metaSchema.metaSnapshots.id,
    })
    .from(metaSchema.metaSnapshots)
    .innerJoin(
      metaSchema.metaSnapshotLineages,
      eq(
        metaSchema.metaSnapshots.snapshotLineageId,
        metaSchema.metaSnapshotLineages.id,
      ),
    )
    .innerJoin(
      metaSchema.metaDatasets,
      eq(metaSchema.metaSnapshotLineages.primaryDatasetId, metaSchema.metaDatasets.id),
    )
    .where(
      and(
        eq(metaSchema.metaDatasets.code, DATASET_CODE),
        eq(metaSchema.metaSnapshots.resourceType, 'place'),
        eq(metaSchema.metaSnapshotLineages.resourceType, 'place'),
        eq(metaSchema.metaSnapshotLineages.variant, 'default'),
      ),
    )
    .all()
  const snapshotIds = [...new Set(snapshotRows.map(row => row.snapshotId))]
  const apiReleaseSetRows = await db
    .select({
      apiReleaseSetId: metaSchema.metaApiReleaseSetSnapshots.apiReleaseSetId,
      snapshotId: metaSchema.metaApiReleaseSetSnapshots.snapshotId,
    })
    .from(metaSchema.metaApiReleaseSetSnapshots)
    .all()
  const assets = await db
    .select({
      assetKey: metaSchema.metaAssets.assetKey,
      id: metaSchema.metaAssets.id,
      releaseId: metaSchema.metaAssets.releaseId,
    })
    .from(metaSchema.metaAssets)
    .innerJoin(
      metaSchema.metaReleases,
      eq(metaSchema.metaAssets.releaseId, metaSchema.metaReleases.id),
    )
    .innerJoin(
      metaSchema.metaDatasets,
      eq(metaSchema.metaReleases.datasetId, metaSchema.metaDatasets.id),
    )
    .where(eq(metaSchema.metaDatasets.code, DATASET_CODE))
    .all()

  return {
    apiReleaseSetIds: [
      ...new Set(
        apiReleaseSetRows
          .filter(row => snapshotIds.includes(row.snapshotId))
          .map(row => row.apiReleaseSetId),
      ),
    ],
    assets,
    releaseCodes: releases.map(row => row.code),
    releaseIds,
    snapshotIds,
    sourceReleaseIds: [...new Set(releases.map(row => row.sourceReleaseId))],
  }
}

export async function assertPlacesInitialisationComplete(
  db: HarbourReadableDb,
  owned: OwnedPlaces,
) {
  if (owned.releaseIds.length === 0 || owned.snapshotIds.length === 0) {
    throw new Error(
      'Overture Places initialisation has no registered releases or snapshots.',
    )
  }

  const [unfinishedRelease, unfinishedSnapshot] = await Promise.all([
    db
      .select({
        code: metaSchema.metaReleases.code,
        status: metaSchema.metaReleases.status,
      })
      .from(metaSchema.metaReleases)
      .where(
        and(
          inArray(metaSchema.metaReleases.id, owned.releaseIds),
          not(inArray(metaSchema.metaReleases.status, ['published', 'superseded'])),
        ),
      )
      .limit(1)
      .get(),
    db
      .select({
        code: metaSchema.metaSnapshots.code,
        status: metaSchema.metaSnapshots.status,
      })
      .from(metaSchema.metaSnapshots)
      .where(
        and(
          inArray(metaSchema.metaSnapshots.id, owned.snapshotIds),
          not(inArray(metaSchema.metaSnapshots.status, ['published', 'archived'])),
        ),
      )
      .limit(1)
      .get(),
  ])

  if (unfinishedRelease) {
    throw new Error(
      `Overture Places release ${unfinishedRelease.code} is ${unfinishedRelease.status}; refusing to complete its initialisation manifest.`,
    )
  }
  if (unfinishedSnapshot) {
    throw new Error(
      `Overture Places snapshot ${unfinishedSnapshot.code} is ${unfinishedSnapshot.status}; refusing to complete its initialisation manifest.`,
    )
  }
}

async function assertCleanPlacesBaseline(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
) {
  const [release, snapshot, current] = await Promise.all([
    context.metaDb
      .select({ id: metaSchema.metaReleases.id })
      .from(metaSchema.metaReleases)
      .innerJoin(
        metaSchema.metaDatasets,
        eq(metaSchema.metaReleases.datasetId, metaSchema.metaDatasets.id),
      )
      .where(eq(metaSchema.metaDatasets.code, DATASET_CODE))
      .limit(1)
      .get(),
    context.metaDb
      .select({ id: metaSchema.metaSnapshots.id })
      .from(metaSchema.metaSnapshots)
      .where(eq(metaSchema.metaSnapshots.resourceType, 'place'))
      .limit(1)
      .get(),
    context.currentDb
      .select({ id: currentSchema.places.id })
      .from(currentSchema.places)
      .limit(1)
      .get(),
  ])
  if (release || snapshot || current) {
    throw new Error(
      'Overture Places initialisation requires a clean Places baseline; existing Places releases, snapshots, or current rows cannot be safely reset.',
    )
  }

  for (const target of context.historyTargets) {
    const row = await (target.db as HarbourReadableDb)
      .select({ id: historySchema.places.id })
      .from(historySchema.places)
      .limit(1)
      .get()
    if (row)
      throw new Error(
        `Overture Places initialisation requires empty history tables; ${target.bindingName} already contains Places history.`,
      )
  }
  for (const target of context.sourceTargets) {
    const row = await (target.db as HarbourReadableDb)
      .select({ id: sourceSchema.sourceOverturePlaces.sourceRecordId })
      .from(sourceSchema.sourceOverturePlaces)
      .limit(1)
      .get()
    if (row)
      throw new Error(
        `Overture Places initialisation requires empty source tables; ${target.bindingName} already contains Overture Places assertions.`,
      )
  }
}

async function assertPlacesResetStillSafe(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  owned: OwnedPlaces,
) {
  const releases = await context.metaDb
    .select({ id: metaSchema.metaReleases.id })
    .from(metaSchema.metaReleases)
    .innerJoin(
      metaSchema.metaDatasets,
      eq(metaSchema.metaReleases.datasetId, metaSchema.metaDatasets.id),
    )
    .where(eq(metaSchema.metaDatasets.code, DATASET_CODE))
    .all()
  if (
    !sameSet(
      releases.map(row => row.id),
      owned.releaseIds,
    )
  )
    throw new Error(
      'Refusing reset: Overture Places releases no longer exactly match the initialisation manifest.',
    )

  const snapshots = await context.metaDb
    .select({ id: metaSchema.metaSnapshots.id })
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.resourceType, 'place'))
    .all()
  if (
    !sameSet(
      snapshots.map(row => row.id),
      owned.snapshotIds,
    )
  )
    throw new Error(
      'Refusing reset: Places snapshots no longer exactly match the initialisation manifest.',
    )

  const unexpectedCurrent = await context.currentDb
    .select({ snapshotId: currentSchema.places.snapshotId })
    .from(currentSchema.places)
    .where(not(inArray(currentSchema.places.snapshotId, owned.snapshotIds)))
    .limit(1)
    .get()
  if (unexpectedCurrent)
    throw new Error(
      'Refusing reset: current Places rows are not owned by this initialisation.',
    )

  for (const target of context.historyTargets) {
    const unexpectedHistory = await (target.db as HarbourReadableDb)
      .select({ snapshotId: historySchema.places.snapshotId })
      .from(historySchema.places)
      .where(
        or(
          not(inArray(historySchema.places.snapshotId, owned.snapshotIds)),
          not(inArray(historySchema.places.sourceReleaseId, owned.releaseIds)),
        ),
      )
      .limit(1)
      .get()
    if (unexpectedHistory)
      throw new Error(
        `Refusing reset: ${target.bindingName} contains Places history not owned by this initialisation.`,
      )
  }
  for (const target of context.sourceTargets) {
    const unexpectedSource = await (target.db as HarbourReadableDb)
      .select({ releaseId: sourceSchema.sourceOverturePlaces.releaseId })
      .from(sourceSchema.sourceOverturePlaces)
      .where(
        not(inArray(sourceSchema.sourceOverturePlaces.releaseId, owned.releaseIds)),
      )
      .limit(1)
      .get()
    if (unexpectedSource)
      throw new Error(
        `Refusing reset: ${target.bindingName} contains Overture Places assertions not owned by this initialisation.`,
      )
  }

  const assets = await context.metaDb
    .select({ id: metaSchema.metaAssets.id })
    .from(metaSchema.metaAssets)
    .where(inArray(metaSchema.metaAssets.releaseId, owned.releaseIds))
    .all()
  if (
    !sameSet(
      assets.map(asset => asset.id),
      owned.assets.map(asset => asset.id),
    )
  )
    throw new Error(
      'Refusing reset: source assets linked to the Places initialisation releases have changed.',
    )

  const sourceReleaseOwners = await context.metaDb
    .select({ id: metaSchema.metaReleases.id })
    .from(metaSchema.metaReleases)
    .where(inArray(metaSchema.metaReleases.sourceReleaseId, owned.sourceReleaseIds))
    .all()
  if (sourceReleaseOwners.some(row => !owned.releaseIds.includes(row.id)))
    throw new Error(
      'Refusing reset: an Overture source release is now shared by an unowned release.',
    )

  const linked = await context.metaDb
    .select()
    .from(metaSchema.metaApiReleaseSetSnapshots)
    .all()
  if (
    linked.some(
      row =>
        (owned.apiReleaseSetIds.includes(row.apiReleaseSetId) &&
          !owned.snapshotIds.includes(row.snapshotId)) ||
        (owned.snapshotIds.includes(row.snapshotId) &&
          !owned.apiReleaseSetIds.includes(row.apiReleaseSetId)),
    )
  )
    throw new Error(
      'Refusing reset: Places API release-set ownership has changed since initialisation.',
    )
}

function sameSet(left: string[], right: string[]) {
  return left.length === right.length && left.every(value => right.includes(value))
}

async function readPlacesManifest(path: string): Promise<PlacesInitManifest> {
  let value: unknown
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new Error(
      `No readable Overture Places initialisation manifest exists at ${path}.`,
    )
  }
  if (
    !value ||
    typeof value !== 'object' ||
    (value as { version?: unknown }).version !== 1
  ) {
    throw new Error(
      'Overture Places initialisation manifest has an unsupported format.',
    )
  }
  return value as PlacesInitManifest
}

function buildResetArtefacts(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  owned: OwnedPlaces,
) {
  const releaseIds = sqlList(owned.releaseIds)
  const snapshots = sqlList(owned.snapshotIds)
  const sourceReleases = sqlList(owned.sourceReleaseIds)
  const apiReleaseSets = sqlList(owned.apiReleaseSetIds)
  const assets = sqlList(owned.assets.map(asset => asset.id))
  const currentSql = [
    `DELETE FROM placesCells WHERE snapshotId IN (${snapshots});`,
    `DELETE FROM placesDivision WHERE placeSnapshotId IN (${snapshots});`,
    `DELETE FROM placesI18n WHERE snapshotId IN (${snapshots});`,
    `DELETE FROM places WHERE snapshotId IN (${snapshots});`,
    readFileSync(
      resolve(REPO_ROOT, 'libs/db/scripts/sql/rebuild-places-fts.sql'),
      'utf8',
    ),
  ].join('\n')
  const historySql = [
    `DELETE FROM placesI18n WHERE snapshotId IN (${snapshots}) OR sourceReleaseId IN (${releaseIds});`,
    `DELETE FROM places WHERE snapshotId IN (${snapshots}) OR sourceReleaseId IN (${releaseIds});`,
    `DELETE FROM snapshotVersionChanges WHERE snapshotId IN (${snapshots});`,
  ].join('\n')
  const sourceSql = `DELETE FROM overturePlaces WHERE releaseId IN (${releaseIds});`
  const metaSql = [
    `DELETE FROM apiFieldProvenance WHERE apiReleaseSetId IN (${apiReleaseSets});`,
    `DELETE FROM apiReleaseSetSnapshots WHERE apiReleaseSetId IN (${apiReleaseSets});`,
    `DELETE FROM publishedDataJournal WHERE releaseId IN (${releaseIds}) OR relatedReleaseId IN (${releaseIds}) OR apiReleaseSetId IN (${apiReleaseSets});`,
    `DELETE FROM stats WHERE releaseId IN (${releaseIds}) OR snapshotId IN (${snapshots}) OR apiReleaseSetId IN (${apiReleaseSets});`,
    `DELETE FROM releaseProcessingActions WHERE releaseId IN (${releaseIds});`,
    `DELETE FROM ingestRuns WHERE releaseId IN (${releaseIds});`,
    `DELETE FROM releaseShardAssignments WHERE releaseId IN (${releaseIds});`,
    `DELETE FROM snapshotAssemblyRuns WHERE snapshotId IN (${snapshots});`,
    `DELETE FROM snapshotSources WHERE snapshotId IN (${snapshots}) OR sourceReleaseId IN (${releaseIds});`,
    `DELETE FROM apiReleaseSets WHERE id IN (${apiReleaseSets});`,
    `DELETE FROM assets WHERE id IN (${assets});`,
    `DELETE FROM snapshots WHERE id IN (${snapshots});`,
    `DELETE FROM releases WHERE id IN (${releaseIds});`,
    `DELETE FROM sourceReleases WHERE id IN (${sourceReleases}) AND NOT EXISTS (SELECT 1 FROM releases WHERE releases.sourceReleaseId = sourceReleases.id);`,
  ].join('\n')

  const artefacts: ResetSqlArtefact[] = [
    ...context.sourceTargets.map(target => ({
      sql: sourceSql,
      target: {
        binding: target.binding,
        databaseId: target.databaseId,
        name: 'source' as const,
      },
    })),
    ...context.historyTargets.map(target => ({
      sql: historySql,
      target: {
        binding: target.binding,
        databaseId: target.databaseId,
        name: 'history' as const,
      },
    })),
    {
      sql: currentSql,
      target: {
        binding: context.currentBinding,
        databaseId: context.state.bindings.DB_CURRENT?.databaseId ?? null,
        name: 'current' as const,
      },
    },
    {
      sql: metaSql,
      target: {
        binding: context.metaBinding,
        databaseId: context.state.bindings.DB_META?.databaseId ?? null,
        name: 'meta' as const,
      },
    },
  ]
  return artefacts
}

function sqlList(values: string[]) {
  return values.length > 0 ? values.map(literal).join(', ') : 'NULL'
}

function literal(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}
