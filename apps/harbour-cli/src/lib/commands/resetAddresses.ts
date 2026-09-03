import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

import { confirm, isCancel, note, outro } from '@clack/prompts'
import { and, not } from 'drizzle-orm'
import {
  currentSchema,
  eq,
  historySchema,
  inArray,
  metaSchema,
  or,
  sourceSchema,
} from '@repo/db'

import type { ParsedArgs, UploadTarget } from '../cli/options.ts'
import { describeTarget, formatField } from '../cli/display.ts'
import {
  resolveLocalAddressDbContext,
  invalidateRemoteDbCache,
} from '../dbCache/localDbCache.ts'
import { executeSqlText } from '../localPipeline/sqlImport.ts'
import { deleteManagedSourceAsset } from '../sources/sourceAssets.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const MANIFEST_ROOT = resolve(REPO_ROOT, '.local/hkgov-dpo/init-runs')
const HISTORY_FILE = resolve(REPO_ROOT, '.local/hkgov-dpo/als-identity-history.json')
const PREPARED_ROOT = resolve(REPO_ROOT, '.local/hkgov-dpo/prepared')
const RELEASE_ARTEFACT_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/releases')
const DATASET_CODE = 'ds-hk-hkgov-dpo-address'
const LEGACY_OVERTURE_DIVISION_DATASET_CODE = 'ds-hk-overture-division'

type FileBeforeImage = { exists: boolean; contentBase64?: string }
type DocsState = {
  apiReleaseSets: Array<{ guide: string | null; id: string; notes: string | null }>
  releases: Array<{ id: string; notes: string | null }>
}
export type OfficialAddressInitManifest = {
  baseline: { currentDivisionSnapshotIds: string[]; docs: DocsState }
  completedAt?: string
  createdAt: string
  identityFiles: { history: FileBeforeImage }
  owned?: {
    apiReleaseSetIds: string[]
    assetIds: Array<{ assetKey: string; id: string; releaseId: string | null }>
    materialisedDivisionSnapshotIds: string[]
    releaseCodes: string[]
    releaseIds: string[]
    snapshotIds: string[]
    sourceReleaseIds: string[]
  }
  documentationAfter?: DocsState
  runId: string
  status: 'running' | 'complete'
  target: 'local' | 'preview' | 'production'
  version: 1
}

function targetName(target: UploadTarget): OfficialAddressInitManifest['target'] {
  return !target.remote
    ? 'local'
    : target.environment === 'production'
      ? 'production'
      : 'preview'
}

function manifestPath(target: UploadTarget) {
  return resolve(MANIFEST_ROOT, `${targetName(target)}.json`)
}

/** Begin the official initialiser only when addresses are genuinely absent. */
export async function beginOfficialAddressInitialisation(
  target: UploadTarget,
  options: { continue: boolean } = { continue: false },
) {
  const path = manifestPath(target)
  if (existsSync(path)) {
    const existing = await readManifest(path)
    if (options.continue && existing.status === 'running') {
      note(formatField('manifest', path), 'RESUMING OFFICIAL ADDRESS INITIALISATION')
      return
    }
    throw new Error(
      `An official-address initialisation manifest already exists: ${path}. Reset it before starting another clean initialisation.`,
    )
  }
  const context = await resolveLocalAddressDbContext(target, 'hk', '2025', {
    cacheTableProfile: 'address',
    includeAllHistoryShardYears: true,
    includeAllSourceShardYears: true,
    requireExistingRemoteCache: target.remote,
  })
  try {
    try {
      await assertCleanAddressBaseline(context)
    } catch (error) {
      if (options.continue) {
        throw new Error(
          `Cannot continue official address initialisation: its manifest is missing, but address state already exists. Refusing to adopt a partial run because its reset ownership and before-images cannot be verified. ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      throw error
    }
    const manifest: OfficialAddressInitManifest = {
      baseline: {
        currentDivisionSnapshotIds: await readCurrentDivisionSnapshotIds(context),
        docs: await readDocsState(context),
      },
      createdAt: new Date().toISOString(),
      identityFiles: {
        history: await readBeforeImage(HISTORY_FILE),
      },
      runId: crypto.randomUUID(),
      status: 'running',
      target: targetName(target),
      version: 1,
    }
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`)
    note(formatField('manifest', path), 'OFFICIAL ADDRESS INITIALISATION')
  } finally {
    context.cleanup()
  }
}

/** Complete the manifest after the script's documentation publication step. */
export async function completeOfficialAddressInitialisation(target: UploadTarget) {
  const path = manifestPath(target)
  const manifest = await readManifest(path)
  if (manifest.status !== 'running')
    throw new Error('Official-address initialisation is not running.')
  const context = await resolveLocalAddressDbContext(target, 'hk', '2025', {
    cacheTableProfile: 'address',
    includeAllHistoryShardYears: true,
    includeAllSourceShardYears: true,
    requireExistingRemoteCache: target.remote,
  })
  try {
    manifest.owned = await collectOwnedRecords(context)
    manifest.owned.materialisedDivisionSnapshotIds = (
      await readCurrentDivisionSnapshotIds(context)
    ).filter(id => !(manifest.baseline.currentDivisionSnapshotIds ?? []).includes(id))
    manifest.completedAt = new Date().toISOString()
    manifest.documentationAfter = await readDocsState(context)
    manifest.status = 'complete'
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`)
  } finally {
    context.cleanup()
  }
}

export async function runResetOfficialAddressesCommand(
  args: ParsedArgs,
  target: UploadTarget,
  options: { printUsage: () => void },
) {
  const keepCache = args.options['keep-cache'] === true
  const dryRun = args.options['dry-run'] === true
  const discardAbandonedStaged = args.options['discard-abandoned-staged'] === true
  const discardChangedDocs = args.options['discard-changed-docs'] === true
  const adoptFailed = args.options['adopt-failed'] === true
  const yes = args.options.yes === true
  if (
    args.positionals.length ||
    Object.keys(args.options).some(
      key =>
        ![
          'target',
          'keep-cache',
          'dry-run',
          'yes',
          'discard-abandoned-staged',
          'discard-changed-docs',
          'adopt-failed',
        ].includes(key),
    )
  ) {
    options.printUsage()
    throw new Error(
      '`reset:addresses:official` accepts only --target, --dry-run, --yes, --keep-cache, --discard-abandoned-staged, --discard-changed-docs, and --adopt-failed.',
    )
  }
  const path = manifestPath(target)
  let manifest = await readManifest(path).catch(error => {
    if (adoptFailed) return null
    throw error
  })
  const context = await resolveLocalAddressDbContext(target, 'hk', '2025', {
    cacheTableProfile: 'address',
    includeAllHistoryShardYears: true,
    includeAllSourceShardYears: true,
    requireExistingRemoteCache: target.remote,
  })
  try {
    if (!manifest) {
      manifest = await adoptFailedAddressResetState(context, target)
    }
    if (
      manifest.target !== targetName(target) ||
      !['complete', 'running'].includes(manifest.status) ||
      (manifest.status === 'complete' && !manifest.owned)
    ) {
      throw new Error(
        'Reset requires an official-address initialisation manifest for this target.',
      )
    }
    if (manifest.status === 'running') {
      if (
        !sameDocs(
          selectDocsForInitialisation(
            await readDocsState(context),
            manifest.baseline.docs,
          ),
          manifest.baseline.docs,
        )
      ) {
        throw new Error(
          'Refusing reset of an incomplete initialisation after documentation changed; complete the manifest first.',
        )
      }
      manifest.owned = await collectOwnedRecords(context)
    }
    if (discardAbandonedStaged) {
      await absorbAbandonedStagedAddressReleases(context, manifest)
    }
    await assertResetStillSafe(context, manifest, { discardChangedDocs })
    const owned = requireOwned(manifest)
    note(
      [
        formatField('target', describeTarget(target).label),
        formatField('releases', String(owned.releaseIds.length)),
        formatField('snapshots', String(owned.snapshotIds.length)),
        formatField('assets', String(owned.assetIds.length)),
        formatField('discardAbandonedStaged', String(discardAbandonedStaged)),
        formatField('discardChangedDocs', String(discardChangedDocs)),
        formatField('keepCache', String(keepCache)),
        formatField('dryRun', String(dryRun)),
      ].join('\n'),
      'OFFICIAL ADDRESS RESET PLAN',
    )
    if (!dryRun && !yes) {
      const accepted = await confirm({
        message: `Remove the official address initialisation from ${describeTarget(target).label}?`,
        initialValue: false,
      })
      if (isCancel(accepted) || !accepted)
        throw new Error('Official address reset cancelled.')
    }
    if (dryRun) return
    // Remove the object while its release association still proves ownership.
    for (const asset of owned.assetIds) await deleteManagedSourceAsset(target, asset)
    const artefacts = buildResetSql(context, manifest)
    const importOptions = {
      isLocal: !target.remote,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
      apiToken: process.env.CLOUDFLARE_D1_TOKEN,
    }
    for (const artefact of artefacts)
      await executeSqlText(artefact.target, artefact.sql, importOptions)
    if (target.remote) {
      try {
        for (const artefact of artefacts)
          await executeSqlText(artefact.target, artefact.sql, { isLocal: true })
      } catch (error) {
        await invalidateRemoteDbCache(
          targetName(target) as 'preview' | 'production',
          context.state.dbCacheDir,
          `official address reset cache replay failed: ${error instanceof Error ? error.message : String(error)}`,
        )
        throw new Error(
          'Remote reset succeeded but its local cache could not be updated; the cache was invalidated.',
        )
      }
    }
    await restoreBeforeImage(HISTORY_FILE, manifest.identityFiles.history)
    if (!keepCache) await removeRunCache(manifest, target)
    await rm(path, { force: true })
    outro('Official address initialisation reset complete')
  } finally {
    context.cleanup()
  }
}

async function assertCleanAddressBaseline(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
) {
  const [release, snapshot] = await Promise.all([
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
      .where(eq(metaSchema.metaSnapshots.resourceType, 'address'))
      .limit(1)
      .get(),
  ])
  if (release || snapshot)
    throw new Error(
      'Official address initialisation requires a clean address baseline; existing address releases or snapshots cannot be safely reset.',
    )
  for (const target of [...context.sourceTargets, ...context.historyTargets]) {
    const table = target.bindingName.startsWith('DB_SOURCE')
      ? 'hkgovAlsAddresses2d'
      : 'address2d'
    const row = await (
      target.db as {
        select: () => {
          from: (table: unknown) => {
            limit: (n: number) => { get: () => Promise<unknown> }
          }
        }
      }
    )
      .select()
      .from(
        table === 'hkgovAlsAddresses2d'
          ? sourceSchema.sourceHkgovAlsAddresses2d
          : historySchema.address2d,
      )
      .limit(1)
      .get()
    if (row)
      throw new Error(
        `Official address initialisation requires empty address tables; ${target.bindingName} already contains address state.`,
      )
  }
  const current = await context.currentDb
    .select()
    .from(currentSchema.address2d)
    .limit(1)
    .get()
  if (current)
    throw new Error(
      'Official address initialisation requires an empty current address table.',
    )
}

async function adoptFailedAddressResetState(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  target: UploadTarget,
): Promise<OfficialAddressInitManifest> {
  if (target.remote) {
    throw new Error('--adopt-failed only supports the local target.')
  }
  const releases = await context.metaDb
    .select({ id: metaSchema.metaReleases.id, status: metaSchema.metaReleases.status })
    .from(metaSchema.metaReleases)
    .innerJoin(
      metaSchema.metaDatasets,
      eq(metaSchema.metaReleases.datasetId, metaSchema.metaDatasets.id),
    )
    .where(eq(metaSchema.metaDatasets.code, DATASET_CODE))
    .all()
  const snapshots = await context.metaDb
    .select({ status: metaSchema.metaSnapshots.status })
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.resourceType, 'address'))
    .all()
  const apiReleaseSet = await context.metaDb
    .select({ id: metaSchema.metaApiReleaseSetSnapshots.apiReleaseSetId })
    .from(metaSchema.metaApiReleaseSetSnapshots)
    .innerJoin(
      metaSchema.metaSnapshots,
      eq(metaSchema.metaApiReleaseSetSnapshots.snapshotId, metaSchema.metaSnapshots.id),
    )
    .where(eq(metaSchema.metaSnapshots.resourceType, 'address'))
    .limit(1)
    .get()
  if (
    releases.length === 0 ||
    releases.some(
      release => release.status !== 'failed' && release.status !== 'staged',
    ) ||
    snapshots.some(snapshot => snapshot.status !== 'draft') ||
    apiReleaseSet
  ) {
    throw new Error(
      'Cannot adopt failed address state: only failed/staged releases with draft snapshots and no API release set are recoverable.',
    )
  }
  const docs = await readDocsState(context)
  const manifest: OfficialAddressInitManifest = {
    baseline: {
      currentDivisionSnapshotIds: await readCurrentDivisionSnapshotIds(context),
      docs,
    },
    completedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    documentationAfter: docs,
    identityFiles: {
      history: await readBeforeImage(HISTORY_FILE),
    },
    owned: await collectOwnedRecords(context),
    runId: crypto.randomUUID(),
    status: 'complete',
    target: targetName(target),
    version: 1,
  }
  note(
    'All address releases are failed or staged with no published API state.',
    'ADOPTING FAILED ADDRESS RESET STATE',
  )
  return manifest
}

async function collectOwnedRecords(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
) {
  const releases = await context.metaDb
    .select({
      id: metaSchema.metaReleases.id,
      code: metaSchema.metaReleases.code,
      sourceReleaseId: metaSchema.metaReleases.sourceReleaseId,
    })
    .from(metaSchema.metaReleases)
    .innerJoin(
      metaSchema.metaDatasets,
      eq(metaSchema.metaReleases.datasetId, metaSchema.metaDatasets.id),
    )
    .where(eq(metaSchema.metaDatasets.code, DATASET_CODE))
    .all()
  if (releases.length === 0)
    throw new Error('Official-address initialisation produced no address releases.')
  const releaseIds = releases.map(row => row.id)
  const snapshotRows = await context.metaDb
    .select({ id: metaSchema.metaSnapshotSources.snapshotId })
    .from(metaSchema.metaSnapshotSources)
    .where(inArray(metaSchema.metaSnapshotSources.sourceReleaseId, releaseIds))
    .all()
  const snapshotIds = [...new Set(snapshotRows.map(row => row.id))]
  const apiRows =
    snapshotIds.length === 0
      ? []
      : await context.metaDb
          .select({ id: metaSchema.metaApiReleaseSetSnapshots.apiReleaseSetId })
          .from(metaSchema.metaApiReleaseSetSnapshots)
          .where(inArray(metaSchema.metaApiReleaseSetSnapshots.snapshotId, snapshotIds))
          .all()
  const assets = await context.metaDb
    .select({
      id: metaSchema.metaAssets.id,
      assetKey: metaSchema.metaAssets.assetKey,
      releaseId: metaSchema.metaAssets.releaseId,
    })
    .from(metaSchema.metaAssets)
    .where(inArray(metaSchema.metaAssets.releaseId, releaseIds))
    .all()
  return {
    apiReleaseSetIds: [...new Set(apiRows.map(row => row.id))],
    assetIds: assets,
    materialisedDivisionSnapshotIds: [],
    releaseCodes: releases.map(row => row.code),
    releaseIds,
    snapshotIds,
    sourceReleaseIds: [...new Set(releases.map(row => row.sourceReleaseId))],
  }
}

async function assertResetStillSafe(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  manifest: OfficialAddressInitManifest,
  options: { discardChangedDocs: boolean },
) {
  const owned = requireOwned(manifest)
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
      'Refusing reset: address releases no longer exactly match this initialisation manifest.',
    )
  const snapshots = await context.metaDb
    .select({ id: metaSchema.metaSnapshots.id })
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.resourceType, 'address'))
    .all()
  if (
    !sameSet(
      snapshots.map(row => row.id),
      owned.snapshotIds,
    )
  )
    throw new Error(
      'Refusing reset: address snapshots no longer exactly match this initialisation manifest.',
    )
  const unexpectedCurrent = await context.currentDb
    .select({ snapshotId: currentSchema.address2d.snapshotId })
    .from(currentSchema.address2d)
    .where(not(inArray(currentSchema.address2d.snapshotId, owned.snapshotIds)))
    .limit(1)
    .get()
  if (unexpectedCurrent)
    throw new Error(
      'Refusing reset: current address rows are not owned by this initialisation.',
    )
  const currentDivisionSnapshotIds = await readGeographicDivisionSnapshotIds(
    context,
    await readCurrentDivisionSnapshotIds(context),
  )
  const expectedDivisionSnapshotIds = await readGeographicDivisionSnapshotIds(context, [
    ...(manifest.baseline.currentDivisionSnapshotIds ?? []),
    ...owned.materialisedDivisionSnapshotIds,
  ])
  if (!sameSet(currentDivisionSnapshotIds, expectedDivisionSnapshotIds))
    throw new Error(
      'Refusing reset: current division projections changed after address initialisation.',
    )
  for (const target of context.historyTargets) {
    const unexpectedHistory = await (target.db as typeof context.historyDb)
      .select({ snapshotId: historySchema.address2d.snapshotId })
      .from(historySchema.address2d)
      .where(
        or(
          not(inArray(historySchema.address2d.snapshotId, owned.snapshotIds)),
          not(inArray(historySchema.address2d.sourceReleaseId, owned.releaseIds)),
        ),
      )
      .limit(1)
      .get()
    if (unexpectedHistory)
      throw new Error(
        `Refusing reset: ${target.bindingName} contains address history not owned by this initialisation.`,
      )
  }
  for (const target of context.sourceTargets) {
    const unexpectedSource = await (target.db as typeof context.sourceDb)
      .select({ releaseId: sourceSchema.sourceHkgovAlsAddresses2d.releaseId })
      .from(sourceSchema.sourceHkgovAlsAddresses2d)
      .where(
        not(
          inArray(sourceSchema.sourceHkgovAlsAddresses2d.releaseId, owned.releaseIds),
        ),
      )
      .limit(1)
      .get()
    if (unexpectedSource)
      throw new Error(
        `Refusing reset: ${target.bindingName} contains source assertions not owned by this initialisation.`,
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
      owned.assetIds.map(asset => asset.id),
    )
  )
    throw new Error(
      'Refusing reset: source assets linked to the initialisation releases have changed.',
    )
  if (
    !options.discardChangedDocs &&
    manifest.status === 'complete' &&
    (!manifest.documentationAfter ||
      !sameDocs(
        selectDocsForInitialisation(
          await readDocsState(context),
          manifest.baseline.docs,
        ),
        selectDocsForInitialisation(
          manifest.documentationAfter,
          manifest.baseline.docs,
        ),
      ))
  )
    throw new Error(
      'Refusing reset: release documentation changed after initialisation.',
    )
}

async function absorbAbandonedStagedAddressReleases(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  manifest: OfficialAddressInitManifest,
) {
  const owned = requireOwned(manifest)
  const releases = await context.metaDb
    .select({
      code: metaSchema.metaReleases.code,
      id: metaSchema.metaReleases.id,
      sourceReleaseId: metaSchema.metaReleases.sourceReleaseId,
      status: metaSchema.metaReleases.status,
    })
    .from(metaSchema.metaReleases)
    .innerJoin(
      metaSchema.metaDatasets,
      eq(metaSchema.metaReleases.datasetId, metaSchema.metaDatasets.id),
    )
    .where(eq(metaSchema.metaDatasets.code, DATASET_CODE))
    .all()
  const unowned = releases.filter(release => !owned.releaseIds.includes(release.id))

  for (const release of unowned) {
    const [snapshot, runs] = await Promise.all([
      context.metaDb
        .select({
          id: metaSchema.metaSnapshotSources.snapshotId,
          status: metaSchema.metaSnapshots.status,
        })
        .from(metaSchema.metaSnapshotSources)
        .innerJoin(
          metaSchema.metaSnapshots,
          eq(metaSchema.metaSnapshotSources.snapshotId, metaSchema.metaSnapshots.id),
        )
        .where(eq(metaSchema.metaSnapshotSources.sourceReleaseId, release.id))
        .limit(1)
        .get(),
      context.metaDb
        .select({ status: metaSchema.ingestRuns.status })
        .from(metaSchema.ingestRuns)
        .where(eq(metaSchema.ingestRuns.releaseId, release.id))
        .all(),
    ])
    if (
      release.status !== 'staged' ||
      snapshot?.status !== 'draft' ||
      !runs.some(run => run.status === 'error')
    ) {
      throw new Error(
        'Refusing reset: address releases no longer exactly match this initialisation manifest.',
      )
    }
    const apiReleaseSet = await context.metaDb
      .select({ id: metaSchema.metaApiReleaseSetSnapshots.apiReleaseSetId })
      .from(metaSchema.metaApiReleaseSetSnapshots)
      .where(eq(metaSchema.metaApiReleaseSetSnapshots.snapshotId, snapshot.id))
      .limit(1)
      .get()
    if (apiReleaseSet) {
      throw new Error(
        'Refusing reset: abandoned staged address release belongs to an API release set.',
      )
    }
    const assets = await context.metaDb
      .select({
        assetKey: metaSchema.metaAssets.assetKey,
        id: metaSchema.metaAssets.id,
        releaseId: metaSchema.metaAssets.releaseId,
      })
      .from(metaSchema.metaAssets)
      .where(eq(metaSchema.metaAssets.releaseId, release.id))
      .all()
    owned.assetIds.push(...assets)
    owned.releaseCodes.push(release.code)
    owned.releaseIds.push(release.id)
    owned.snapshotIds.push(snapshot.id)
    owned.sourceReleaseIds.push(release.sourceReleaseId)
    note(
      formatField('release', release.code),
      'DISCARDING ABANDONED STAGED ADDRESS RELEASE',
    )
  }
}

function buildResetSql(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  manifest: OfficialAddressInitManifest,
) {
  const owned = requireOwned(manifest)
  const ids = sqlList(owned.releaseIds),
    snapshots = sqlList(owned.snapshotIds),
    sourceReleases = sqlList(owned.sourceReleaseIds),
    apiSets = sqlList(owned.apiReleaseSetIds),
    assets = sqlList(owned.assetIds.map(asset => asset.id))
  const sourceSql = `DELETE FROM hkgovAlsAddresses2d WHERE releaseId IN (${ids});`
  const historySql = `DELETE FROM address2dBuildingNumberLookup WHERE sourceReleaseId IN (${ids}) OR snapshotId IN (${snapshots});\nDELETE FROM address2dI18n WHERE sourceReleaseId IN (${ids}) OR snapshotId IN (${snapshots});\nDELETE FROM address2d WHERE sourceReleaseId IN (${ids}) OR snapshotId IN (${snapshots});\nDELETE FROM snapshotVersionChanges WHERE snapshotId IN (${snapshots});`
  const divisionSnapshots = sqlList(owned.materialisedDivisionSnapshotIds)
  const currentSql = `DELETE FROM address2d WHERE snapshotId IN (${snapshots});\nDELETE FROM divisions WHERE snapshotId IN (${divisionSnapshots});`
  const docsSql = [
    ...manifest.baseline.docs.apiReleaseSets.map(
      row =>
        `UPDATE apiReleaseSets SET notes=${literal(row.notes)}, guide=${literal(row.guide)} WHERE id=${literal(row.id)};`,
    ),
    ...manifest.baseline.docs.releases.map(
      row =>
        `UPDATE releases SET notes=${literal(row.notes)} WHERE id=${literal(row.id)};`,
    ),
  ].join('\n')
  const metaSql = `DELETE FROM assets WHERE id IN (${assets});\nDELETE FROM ingestRuns WHERE releaseId IN (${ids});\nDELETE FROM releaseProcessingActions WHERE releaseId IN (${ids});\nDELETE FROM stats WHERE releaseId IN (${ids}) OR snapshotId IN (${snapshots}) OR apiReleaseSetId IN (${apiSets});\nDELETE FROM publishedDataJournal WHERE releaseId IN (${ids}) OR relatedReleaseId IN (${ids});\nDELETE FROM apiReleaseSets WHERE id IN (${apiSets});\nDELETE FROM snapshots WHERE id IN (${snapshots});\nDELETE FROM releases WHERE id IN (${ids});\nDELETE FROM sourceReleases WHERE id IN (${sourceReleases});\n${docsSql}`
  const source = context.sourceTargets.map(target => ({
    sql: sourceSql,
    target: {
      binding: target.binding,
      databaseId: target.databaseId,
      name: 'source' as const,
    },
  }))
  const history = context.historyTargets.map(target => ({
    sql: historySql,
    target: {
      binding: target.binding,
      databaseId: target.databaseId,
      name: 'history' as const,
    },
  }))
  return [
    ...source,
    ...history,
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
}

async function readDocsState(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
): Promise<DocsState> {
  const [apiReleaseSets, releases] = await Promise.all([
    context.metaDb
      .select({
        id: metaSchema.metaApiReleaseSets.id,
        notes: metaSchema.metaApiReleaseSets.notes,
        guide: metaSchema.metaApiReleaseSets.guide,
      })
      .from(metaSchema.metaApiReleaseSets)
      .all(),
    context.metaDb
      .select({ id: metaSchema.metaReleases.id, notes: metaSchema.metaReleases.notes })
      .from(metaSchema.metaReleases)
      .all(),
  ])
  return { apiReleaseSets: apiReleaseSets.sort(byId), releases: releases.sort(byId) }
}
async function readCurrentDivisionSnapshotIds(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
) {
  const rows = await context.currentDb
    .select({ snapshotId: currentSchema.divisions.snapshotId })
    .from(currentSchema.divisions)
    .all()
  return [...new Set(rows.map(row => row.snapshotId))].sort()
}
async function readGeographicDivisionSnapshotIds(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  snapshotIds: string[],
) {
  if (snapshotIds.length === 0) return []

  const rows = await context.metaDb
    .select({ snapshotId: metaSchema.metaSnapshots.id })
    .from(metaSchema.metaSnapshots)
    .leftJoin(
      metaSchema.metaSnapshotLineages,
      eq(
        metaSchema.metaSnapshots.snapshotLineageId,
        metaSchema.metaSnapshotLineages.id,
      ),
    )
    .leftJoin(
      metaSchema.metaDatasets,
      eq(metaSchema.metaSnapshotLineages.primaryDatasetId, metaSchema.metaDatasets.id),
    )
    .where(
      and(
        eq(metaSchema.metaSnapshots.resourceType, 'division'),
        inArray(metaSchema.metaSnapshots.id, snapshotIds),
        or(
          eq(metaSchema.metaSnapshotLineages.variant, 'overture'),
          eq(metaSchema.metaDatasets.code, LEGACY_OVERTURE_DIVISION_DATASET_CODE),
        ),
      ),
    )
    .all()

  return [...new Set(rows.map(row => row.snapshotId))].sort()
}
async function readBeforeImage(path: string): Promise<FileBeforeImage> {
  try {
    return { exists: true, contentBase64: (await readFile(path)).toString('base64') }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false }
    throw error
  }
}
async function restoreBeforeImage(path: string, image: FileBeforeImage) {
  if (!image.exists) {
    await rm(path, { force: true })
    return
  }
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, Buffer.from(image.contentBase64 ?? '', 'base64'))
}
async function readManifest(path: string): Promise<OfficialAddressInitManifest> {
  let value: unknown
  try {
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    throw new Error(
      `No readable official-address initialisation manifest exists at ${path}.`,
    )
  }
  if (
    !value ||
    typeof value !== 'object' ||
    (value as { version?: unknown }).version !== 1
  )
    throw new Error(
      'Official-address initialisation manifest has an unsupported format.',
    )
  return value as OfficialAddressInitManifest
}
function literal(value: string | null) {
  return value === null ? 'NULL' : `'${value.replaceAll("'", "''")}'`
}
function sqlList(values: string[]) {
  return values.length ? values.map(literal).join(', ') : 'NULL'
}
function sameSet(left: string[], right: string[]) {
  return left.length === right.length && left.every(value => right.includes(value))
}
function requireOwned(manifest: OfficialAddressInitManifest) {
  if (!manifest.owned)
    throw new Error(
      'Official-address initialisation manifest is missing owned records.',
    )
  return manifest.owned
}
function sameDocs(left: DocsState, right: DocsState) {
  return JSON.stringify(left) === JSON.stringify(right)
}
function selectDocsForInitialisation(state: DocsState, baseline: DocsState): DocsState {
  const baselineApiReleaseSetIds = new Set(baseline.apiReleaseSets.map(row => row.id))
  const baselineReleaseIds = new Set(baseline.releases.map(row => row.id))
  return {
    apiReleaseSets: state.apiReleaseSets.filter(row =>
      baselineApiReleaseSetIds.has(row.id),
    ),
    releases: state.releases.filter(row => baselineReleaseIds.has(row.id)),
  }
}
function byId<T extends { id: string }>(a: T, b: T) {
  return a.id.localeCompare(b.id)
}
async function removeRunCache(
  manifest: OfficialAddressInitManifest,
  target: UploadTarget,
) {
  await rm(PREPARED_ROOT, { force: true, recursive: true })
  for (const directory of target.remote ? [target.environment, 'remote'] : ['local'])
    for (const code of manifest.owned?.releaseCodes ?? [])
      await rm(resolve(RELEASE_ARTEFACT_ROOT, directory, code), {
        force: true,
        recursive: true,
      })
}
