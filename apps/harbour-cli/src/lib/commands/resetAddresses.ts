import { existsSync, readFileSync } from 'node:fs'
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { isMinimalInitialisation } from '../cli/minimalInitialisation.ts'

import { confirm, isCancel, note, outro } from '@clack/prompts'
import { and, not } from 'drizzle-orm'
import { chunkArray, getMaxItemsPerInClause } from '@repo/core/pipeline/utils'
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
  openSqliteDb,
  resolveLocalAddressDbContext,
  withLocalMetaDb,
} from '../dbCache/localDbCache.ts'
import { createRemoteD1QueryClient } from '../dbCache/localDbCacheIo.ts'
import {
  mapLocalTargetPaths,
  requirePath,
  resolveD1Targets,
} from '../dbCache/localDbCacheTargets.ts'
import type { LocalAddressDbContext } from '../dbCache/localDbCacheTypes.ts'
import type { RemoteD1QueryClient } from '../dbCache/remoteD1Client.ts'
import {
  executeResetSqlArtefacts,
  validateResetArguments,
} from '../pipeline/resetLifecycle.ts'
import { deleteManagedSourceAsset } from '../sources/sourceAssets.ts'
import { resumeAddressInitialisation } from './resumeAddressInitialisation.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../..')
const MANIFEST_ROOT = resolve(REPO_ROOT, '.local/hkgov-dpo/init-runs')
const HISTORY_FILE = resolve(REPO_ROOT, '.local/hkgov-dpo/als-identity-history.json')
const PREPARED_ROOT = resolve(REPO_ROOT, '.local/hkgov-dpo/prepared')
const RELEASE_ARTEFACT_ROOT = resolve(REPO_ROOT, '.local/harbour-sql/releases')
const DATASET_CODE = 'ds-hk-hkgov-dpo-address'
const LEGACY_OVERTURE_DIVISION_DATASET_CODE = 'ds-hk-overture-division'

type FileBeforeImage = { exists: boolean; contentBase64?: string; backupPath?: string }
type DocsState = {
  apiReleaseSets: Array<{ guide: string | null; id: string; notes: string | null }>
  releases: Array<{ id: string; notes: string | null }>
}
export type OfficialAddressInitManifest = {
  baseline: { currentDivisionScopeIds: string[]; docs: DocsState }
  completedAt?: string
  createdAt: string
  identityFiles: { history: FileBeforeImage }
  owned?: {
    apiReleaseSetIds: string[]
    assetIds: Array<{ assetKey: string; id: string; releaseId: string | null }>
    materialisedDivisionScopeIds: string[]
    releaseCodes: string[]
    releaseIds: string[]
    snapshotIds: string[]
    sourceReleaseIds: string[]
  }
  documentationAfter?: DocsState
  runId: string
  status: 'running' | 'complete'
  target: 'local' | 'preview' | 'production'
  version: 2
}

function targetName(target: UploadTarget): OfficialAddressInitManifest['target'] {
  return !target.remote
    ? 'local'
    : target.environment === 'production'
      ? 'production'
      : 'preview'
}

function manifestPath(target: UploadTarget) {
  return resolve(
    MANIFEST_ROOT,
    `${targetName(target)}${isMinimalInitialisation() ? '.minimal' : ''}.json`,
  )
}

/** Return the durable lifecycle state without opening any D1 bindings. */
export async function getOfficialAddressInitialisationStatus(target: UploadTarget) {
  const path = manifestPath(target)
  if (
    !isMinimalInitialisation() &&
    existsSync(resolve(MANIFEST_ROOT, `${targetName(target)}.minimal.json`))
  ) {
    throw new Error(
      'A minimal address initialisation exists. Resume with init:minimal; a full run requires an explicitly reviewed reset of that sample.',
    )
  }
  if (!existsSync(path)) {
    // A focused init can outlive a lost local manifest. Never adopt this state
    // for reset ownership, but do not attempt a second clean-baseline init
    // when the completed Address API state still proves the run succeeded.
    if (target.remote || isMinimalInitialisation()) return 'missing' as const
    const context = await resolveLocalAddressDbContext(target, 'hk', '2025', {
      cacheTableProfile: 'address',
      includeAllHistoryShardYears: true,
      includeAllSourceShardYears: true,
    })
    try {
      const [release, snapshot, apiReleaseSet] = await Promise.all([
        context.metaDb
          .select({ id: metaSchema.metaReleases.id })
          .from(metaSchema.metaReleases)
          .innerJoin(
            metaSchema.metaDatasets,
            eq(metaSchema.metaReleases.datasetId, metaSchema.metaDatasets.id),
          )
          .where(
            and(
              eq(metaSchema.metaDatasets.code, DATASET_CODE),
              or(
                eq(metaSchema.metaReleases.status, 'published'),
                eq(metaSchema.metaReleases.status, 'superseded'),
              ),
            ),
          )
          .limit(1)
          .get(),
        context.metaDb
          .select({ id: metaSchema.metaSnapshots.id })
          .from(metaSchema.metaSnapshots)
          .where(
            and(
              eq(metaSchema.metaSnapshots.resourceType, 'address'),
              eq(metaSchema.metaSnapshots.status, 'published'),
            ),
          )
          .limit(1)
          .get(),
        context.metaDb
          .select({ id: metaSchema.metaApiReleaseSets.id })
          .from(metaSchema.metaApiReleaseSets)
          .innerJoin(
            metaSchema.metaApiVersions,
            eq(
              metaSchema.metaApiReleaseSets.apiVersionId,
              metaSchema.metaApiVersions.id,
            ),
          )
          .where(
            and(
              eq(metaSchema.metaApiVersions.familyType, 'addresses'),
              eq(metaSchema.metaApiReleaseSets.status, 'current'),
            ),
          )
          .limit(1)
          .get(),
      ])
      return release && snapshot && apiReleaseSet ? 'complete' : 'missing'
    } finally {
      context.cleanup()
    }
  }

  const manifest = await readManifest(path)
  if (manifest.target !== targetName(target))
    throw new Error('Official address initialisation manifest target does not match.')
  return manifest.status
}

/** Begin the official initialiser only when addresses are genuinely absent. */
export async function beginOfficialAddressInitialisation(
  target: UploadTarget,
  _options: { continue: boolean } = { continue: false },
) {
  const path = manifestPath(target)
  if (existsSync(path)) {
    const existing = await readManifest(path)
    if (existing.target !== targetName(target))
      throw new Error('Official address initialisation manifest target does not match.')
    if (existing.status === 'running') {
      await resumeAddressInitialisation(target)
      note(formatField('manifest', path), 'RESUMING OFFICIAL ADDRESS INITIALISATION')
      return
    }
    note(
      formatField('manifest', path),
      'OFFICIAL ADDRESS INITIALISATION ALREADY COMPLETE',
    )
    return
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
      if (_options.continue) {
        throw new Error(
          `Cannot continue official address initialisation: its manifest is missing, but address state already exists. Refusing to adopt a partial run because its reset ownership and before-images cannot be verified. ${error instanceof Error ? error.message : String(error)}`,
        )
      }
      throw error
    }
    const manifest: OfficialAddressInitManifest = {
      baseline: {
        currentDivisionScopeIds: await readCurrentDivisionScopeIds(context),
        docs: await readDocsState(context),
      },
      createdAt: new Date().toISOString(),
      identityFiles: {
        history: await readBeforeImage(HISTORY_FILE),
      },
      runId: crypto.randomUUID(),
      status: 'running',
      target: targetName(target),
      version: 2,
    }
    await mkdir(dirname(path), { recursive: true })
    // Replace stale manifests only after validating the clean baseline and
    // capturing its before-images, preserving reset ownership on failure.
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
  if (!['running', 'complete'].includes(manifest.status))
    throw new Error('Official-address initialisation is not running.')
  const complete = async (
    owned: NonNullable<OfficialAddressInitManifest['owned']>,
    docs: DocsState,
  ) => {
    manifest.owned = owned
    manifest.completedAt = new Date().toISOString()
    manifest.documentationAfter = docs
    manifest.status = 'complete'
    await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`)
  }

  if (!target.remote) {
    const targets = (await resolveD1Targets('local')).filter(
      row => row.bindingName === 'DB_CURRENT',
    )
    const current = await openSqliteDb(
      requirePath(mapLocalTargetPaths(targets).DB_CURRENT, 'DB_CURRENT'),
      currentSchema,
      'DB_CURRENT',
    )
    try {
      await withLocalMetaDb(async metaDb =>
        complete(
          await collectOwnedRecords(
            { metaDb, currentDb: current.db } as unknown as Pick<
              LocalAddressDbContext,
              'metaDb' | 'currentDb'
            >,
            manifest.baseline.currentDivisionScopeIds ?? [],
          ),
          await readDocsState({ metaDb }),
        ),
      )
    } finally {
      current.sqlite.close()
    }
    return
  }

  const meta = await getRemoteMetaClient(target)
  await complete(
    await collectOwnedRecordsFromRemoteMeta(
      meta,
      manifest.baseline.currentDivisionScopeIds ?? [],
      await getRemoteMetaClient(target, 'DB_CURRENT'),
    ),
    await readRemoteDocsState(meta),
  )
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
  validateResetArguments(args, options.printUsage, 'reset:addresses:official', [
    'keep-cache',
    'dry-run',
    'yes',
    'discard-abandoned-staged',
    'discard-changed-docs',
    'adopt-failed',
  ])
  const path = manifestPath(target)
  let manifest = await readManifest(path).catch(error => {
    if (adoptFailed) return null
    throw error
  })
  if (manifest) await assertIdentityBeforeImageAvailable(manifest.identityFiles.history)
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
      manifest.owned = await collectOwnedRecords(
        context,
        manifest.baseline.currentDivisionScopeIds ?? [],
      )
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
    const artefacts = await buildResetSql(context, manifest)
    const resetManifest = manifest
    await executeResetSqlArtefacts({
      artefacts,
      cacheReleaseCodes: owned.releaseCodes,
      cacheReleaseIds: owned.releaseIds,
      cacheRoot: RELEASE_ARTEFACT_ROOT,
      context,
      extraCachePaths: [PREPARED_ROOT],
      keepCache,
      remoteCacheErrorMessage: 'Official address reset cache replay failed',
      target,
      validateUnderLock: () =>
        assertResetStillSafe(context, resetManifest, { discardChangedDocs }),
      beforeSql: async () => {
        // Remove objects while their release associations still prove ownership.
        const existingAssetIds = new Set<string>()
        for (const ids of chunkArray(
          owned.assetIds.map(asset => asset.id),
          getMaxItemsPerInClause(),
        )) {
          const rows = await context.metaDb
            .select({ id: metaSchema.metaAssets.id })
            .from(metaSchema.metaAssets)
            .where(inArray(metaSchema.metaAssets.id, ids))
            .all()
          for (const row of rows) existingAssetIds.add(row.id)
        }
        for (const asset of owned.assetIds) {
          if (existingAssetIds.has(asset.id))
            await deleteManagedSourceAsset(target, asset)
        }
      },
      afterSql: async () => {
        await restoreBeforeImage(HISTORY_FILE, resetManifest.identityFiles.history)
        await rm(path, { force: true })
      },
    })
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
  const baselineCurrentDivisionScopeIds = await readCurrentDivisionScopeIds(context)
  const manifest: OfficialAddressInitManifest = {
    baseline: {
      currentDivisionScopeIds: baselineCurrentDivisionScopeIds,
      docs,
    },
    completedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    documentationAfter: docs,
    identityFiles: {
      history: await readBeforeImage(HISTORY_FILE),
    },
    owned: await collectOwnedRecords(context, baselineCurrentDivisionScopeIds),
    runId: crypto.randomUUID(),
    status: 'complete',
    target: targetName(target),
    version: 2,
  }
  note(
    'All address releases are failed or staged with no published API state.',
    'ADOPTING FAILED ADDRESS RESET STATE',
  )
  return manifest
}

async function collectOwnedRecords(
  context: Pick<LocalAddressDbContext, 'metaDb' | 'currentDb'>,
  baselineCurrentDivisionScopeIds: string[],
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
    .select({
      id: metaSchema.metaSnapshotSources.snapshotId,
      role: metaSchema.metaSnapshotSources.role,
    })
    .from(metaSchema.metaSnapshotSources)
    .where(inArray(metaSchema.metaSnapshotSources.resourceReleaseId, releaseIds))
    .all()
  const snapshotIds = selectOwnedOfficialAddressSnapshotIds(snapshotRows)
  const apiRows =
    snapshotIds.length === 0
      ? []
      : await context.metaDb
          .select({
            id: metaSchema.metaApiReleaseSetSnapshots.apiReleaseSetId,
            familyType: metaSchema.metaApiVersions.familyType,
          })
          .from(metaSchema.metaApiReleaseSetSnapshots)
          .innerJoin(
            metaSchema.metaApiReleaseSets,
            eq(
              metaSchema.metaApiReleaseSetSnapshots.apiReleaseSetId,
              metaSchema.metaApiReleaseSets.id,
            ),
          )
          .innerJoin(
            metaSchema.metaApiVersions,
            eq(
              metaSchema.metaApiReleaseSets.apiVersionId,
              metaSchema.metaApiVersions.id,
            ),
          )
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
  const currentDivisionScopeIds = await readCurrentDivisionScopeIds(context)
  return {
    apiReleaseSetIds: selectOwnedOfficialAddressApiReleaseSetIds(apiRows),
    assetIds: assets,
    materialisedDivisionScopeIds: resolveOwnedMaterialisedDivisionScopeIds(
      currentDivisionScopeIds,
      baselineCurrentDivisionScopeIds,
    ),
    releaseCodes: releases.map(row => row.code),
    releaseIds,
    snapshotIds,
    sourceReleaseIds: [...new Set(releases.map(row => row.sourceReleaseId))],
  }
}

/** Manifest completion reads only scalar metadata from remote D1; it never mirrors a shard. */
async function getRemoteMetaClient(
  target: UploadTarget,
  bindingName = 'DB_META',
): Promise<RemoteD1QueryClient> {
  if (!target.remote)
    throw new Error('A remote metadata client requires a remote target.')
  const environment = target.environment === 'production' ? 'production' : 'preview'
  const meta = (await resolveD1Targets(environment)).find(
    candidate => candidate.bindingName === bindingName,
  )
  if (!meta) throw new Error(`Could not resolve the ${environment} DB_META binding.`)
  return createRemoteD1QueryClient(meta, environment)
}

async function collectOwnedRecordsFromRemoteMeta(
  client: RemoteD1QueryClient,
  baselineCurrentDivisionScopeIds: string[],
  current: RemoteD1QueryClient,
): Promise<NonNullable<OfficialAddressInitManifest['owned']>> {
  const releases = (await client.query(
    `SELECT r.id, r.code, r.sourceReleaseId FROM releases r JOIN datasets d ON d.id = r.datasetId WHERE d.code = ${literal(DATASET_CODE)}`,
  )) as Array<{ id: string; code: string; sourceReleaseId: string }>
  if (releases.length === 0)
    throw new Error('Official-address initialisation produced no address releases.')
  const releaseIds = releases.map(row => row.id)
  const snapshotRows = await queryRemoteInChunks<{ id: string; role: string }>(
    client,
    releaseIds,
    values =>
      `SELECT snapshotId AS id, role FROM snapshotSources WHERE resourceReleaseId IN (${sqlList(values)})`,
  )
  const snapshotIds = selectOwnedOfficialAddressSnapshotIds(snapshotRows)
  const apiRows = await queryRemoteInChunks<{ id: string; familyType: string }>(
    client,
    snapshotIds,
    values =>
      `SELECT ars.apiReleaseSetId AS id, av.familyType FROM apiReleaseSetSnapshots ars JOIN apiReleaseSets ar ON ar.id = ars.apiReleaseSetId JOIN apiVersions av ON av.id = ar.apiVersionId WHERE ars.snapshotId IN (${sqlList(values)})`,
  )
  const assets = await queryRemoteInChunks<{
    id: string
    assetKey: string
    releaseId: string | null
  }>(
    client,
    releaseIds,
    values =>
      `SELECT id, assetKey, releaseId FROM assets WHERE releaseId IN (${sqlList(values)})`,
  )
  const currentRows = (await current.query(
    'SELECT DISTINCT snapshotId FROM divisions ORDER BY snapshotId',
  )) as Array<{ snapshotId: string }>
  return {
    apiReleaseSetIds: selectOwnedOfficialAddressApiReleaseSetIds(apiRows),
    assetIds: assets,
    materialisedDivisionScopeIds: resolveOwnedMaterialisedDivisionScopeIds(
      [...new Set(currentRows.map(row => row.snapshotId))].sort(),
      baselineCurrentDivisionScopeIds,
    ),
    releaseCodes: releases.map(row => row.code),
    releaseIds,
    snapshotIds,
    sourceReleaseIds: [...new Set(releases.map(row => row.sourceReleaseId))],
  }
}

async function readRemoteDocsState(client: RemoteD1QueryClient): Promise<DocsState> {
  const read = async (table: string, columns: string) => {
    const rows: Record<string, unknown>[] = []
    let after = ''
    for (;;) {
      const page = await client.query(
        `SELECT ${columns} FROM ${table} WHERE id > ${literal(after)} ORDER BY id LIMIT 32`,
      )
      rows.push(...page)
      if (page.length < 32) return rows
      after = String(page.at(-1)?.id)
    }
  }
  return {
    apiReleaseSets: (await read(
      'apiReleaseSets',
      'id, notes, guide',
    )) as DocsState['apiReleaseSets'],
    releases: (await read('releases', 'id, notes')) as DocsState['releases'],
  }
}

async function queryRemoteInChunks<T>(
  client: RemoteD1QueryClient,
  values: string[],
  query: (values: string[]) => string,
): Promise<T[]> {
  if (values.length === 0) return []
  const rows: T[] = []
  for (const chunk of chunkArray(values, getMaxItemsPerInClause()))
    rows.push(...((await client.query(query(chunk))) as T[]))
  return rows
}

export function resolveOwnedMaterialisedDivisionScopeIds(
  currentScopeIds: string[],
  baselineScopeIds: string[],
) {
  return currentScopeIds.filter(id => !baselineScopeIds.includes(id))
}

/**
 * A downstream Address or Place snapshot may look up an ALS release. It is not
 * part of the official-address initialisation, whose snapshots own that
 * release as their primary source.
 */
export function selectOwnedOfficialAddressSnapshotIds(
  rows: Array<{ id: string; role: string }>,
) {
  return [...new Set(rows.filter(row => row.role === 'primary').map(row => row.id))]
}

/** The reset boundary covers Address API compositions, never Places that reference ALS. */
export function selectOwnedOfficialAddressApiReleaseSetIds(
  rows: Array<{ id: string; familyType: string }>,
) {
  return [
    ...new Set(rows.filter(row => row.familyType === 'addresses').map(row => row.id)),
  ]
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
    .select({
      id: metaSchema.metaSnapshots.id,
      scopeId: metaSchema.metaSnapshots.snapshotLineageId,
    })
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
  const addressScopeIds = new Set(snapshots.map(row => row.scopeId))
  const currentScopes = await context.currentDb
    .selectDistinct({ snapshotId: currentSchema.address2d.snapshotId })
    .from(currentSchema.address2d)
    .all()
  const unexpectedCurrent = currentScopes.some(
    row => !addressScopeIds.has(row.snapshotId),
  )
  if (unexpectedCurrent)
    throw new Error(
      'Refusing reset: current address rows are not owned by this initialisation.',
    )
  const currentDivisionScopeIds = await readGeographicDivisionScopeIds(
    context,
    await readCurrentDivisionScopeIds(context),
  )
  const expectedDivisionScopeIds = await readGeographicDivisionScopeIds(context, [
    ...(manifest.baseline.currentDivisionScopeIds ?? []),
    ...owned.materialisedDivisionScopeIds,
  ])
  const hasOwnedMaterialisedDivision = currentDivisionScopeIds.some(snapshotId =>
    owned.materialisedDivisionScopeIds.includes(snapshotId),
  )
  if (
    hasOwnedMaterialisedDivision &&
    !sameSet(currentDivisionScopeIds, expectedDivisionScopeIds)
  )
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
        `Refusing reset: ${target.bindingName} contains source records not owned by this initialisation.`,
      )
  }
  const assets = await context.metaDb
    .select({ id: metaSchema.metaAssets.id })
    .from(metaSchema.metaAssets)
    .where(inArray(metaSchema.metaAssets.releaseId, owned.releaseIds))
    .all()
  if (
    assets.some(asset => !owned.assetIds.some(ownedAsset => ownedAsset.id === asset.id))
  )
    throw new Error(
      'Refusing reset: an unexpected source asset is linked to the initialisation releases.',
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
        .where(eq(metaSchema.metaSnapshotSources.resourceReleaseId, release.id))
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

async function buildResetSql(
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
  const historySql = `DELETE FROM address2dBuildingNumberLookup WHERE sourceReleaseId IN (${ids}) OR snapshotId IN (${snapshots});\nDELETE FROM address2dI18n WHERE sourceReleaseId IN (${ids}) OR snapshotId IN (${snapshots});\nDELETE FROM address2d WHERE sourceReleaseId IN (${ids}) OR snapshotId IN (${snapshots});\nDELETE FROM snapshotVersionChanges WHERE snapshotId IN (${snapshots});\nDELETE FROM sourceResolutions WHERE snapshotId IN (${snapshots}) OR sourceReleaseId IN (${ids});`
  const scopeIds: string[] = []
  for (const ids of chunkArray(owned.snapshotIds, getMaxItemsPerInClause())) {
    const rows = await context.metaDb
      .select({ scopeId: metaSchema.metaSnapshots.snapshotLineageId })
      .from(metaSchema.metaSnapshots)
      .where(inArray(metaSchema.metaSnapshots.id, ids))
      .all()
    for (const row of rows) if (row.scopeId) scopeIds.push(row.scopeId)
  }
  const currentSql = `${buildOfficialAddressCurrentResetSql([...new Set(scopeIds)], owned.materialisedDivisionScopeIds)}\n${readFileSync(resolve(REPO_ROOT, 'libs/db/scripts/sql/rebuild-addresses-fts.sql'), 'utf8')}`
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
  const metaSql = `DELETE FROM assets WHERE id IN (${assets});\nDELETE FROM ingestRuns WHERE releaseId IN (${ids});\nDELETE FROM releaseProcessingActions WHERE releaseId IN (${ids});\nDELETE FROM releaseProcessingActionChunks WHERE releaseId IN (${ids});\nDELETE FROM stats WHERE releaseId IN (${ids}) OR apiReleaseSetId IN (${apiSets});\nDELETE FROM publishedDataJournal WHERE releaseId IN (${ids}) OR relatedReleaseId IN (${ids});\nDELETE FROM apiReleaseSets WHERE id IN (${apiSets});\nDELETE FROM snapshots WHERE id IN (${snapshots});\nDELETE FROM releases WHERE id IN (${ids});\nDELETE FROM sourceReleases WHERE id IN (${sourceReleases});\n${docsSql}`
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
  context: Pick<LocalAddressDbContext, 'metaDb'>,
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
async function readCurrentDivisionScopeIds(
  context: Pick<LocalAddressDbContext, 'currentDb'>,
) {
  const rows = await context.currentDb
    .selectDistinct({ snapshotId: currentSchema.divisions.snapshotId })
    .from(currentSchema.divisions)
    .all()
  return [...new Set(rows.map(row => row.snapshotId))].sort()
}
async function readGeographicDivisionScopeIds(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  scopeIds: string[],
) {
  const result = new Set<string>()
  for (const ids of chunkArray(scopeIds, getMaxItemsPerInClause(1, 3))) {
    const rows = await context.metaDb
      .select({ scopeId: metaSchema.metaSnapshotLineages.id })
      .from(metaSchema.metaSnapshotLineages)
      .leftJoin(
        metaSchema.metaDatasets,
        eq(
          metaSchema.metaSnapshotLineages.primaryDatasetId,
          metaSchema.metaDatasets.id,
        ),
      )
      .where(
        and(
          eq(metaSchema.metaSnapshotLineages.resourceType, 'division'),
          inArray(metaSchema.metaSnapshotLineages.id, ids),
          or(
            eq(metaSchema.metaSnapshotLineages.variant, 'overture'),
            eq(metaSchema.metaDatasets.code, LEGACY_OVERTURE_DIVISION_DATASET_CODE),
          ),
        ),
      )
      .all()
    for (const row of rows) result.add(row.scopeId)
  }
  return [...result].sort()
}

export function buildOfficialAddressCurrentResetSql(
  addressScopeIds: string[],
  divisionScopeIds: string[],
) {
  const addresses = sqlList(addressScopeIds)
  const divisions = sqlList(divisionScopeIds)
  return `DELETE FROM address2d WHERE snapshotId IN (${addresses});\nDELETE FROM addressPublicationState WHERE scopeId IN (${addresses});\nDELETE FROM divisions WHERE snapshotId IN (${divisions});\nDELETE FROM divisionPublicationState WHERE scopeId IN (${divisions});`
}
export async function readBeforeImage(
  path: string,
  backupRoot = MANIFEST_ROOT,
): Promise<FileBeforeImage> {
  try {
    await stat(path)
    await mkdir(backupRoot, { recursive: true })
    const backupPath = resolve(
      backupRoot,
      `identity-history-${crypto.randomUUID()}.json`,
    )
    await copyFile(path, backupPath)
    return { exists: true, backupPath }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { exists: false }
    throw error
  }
}
export async function assertIdentityBeforeImageAvailable(image: FileBeforeImage) {
  if (!image.exists) return
  if (image.backupPath) {
    await stat(image.backupPath)
    return
  }
  if (image.contentBase64 === undefined)
    throw new Error(
      'Identity-history before-image is missing; refusing reset before any database or asset changes.',
    )
}
export async function restoreBeforeImage(path: string, image: FileBeforeImage) {
  if (image.exists && image.contentBase64 === undefined && !image.backupPath)
    throw new Error(
      'Official-address manifest is missing its identity-history before-image; refusing reset.',
    )
  if (!image.exists) {
    await rm(path, { force: true })
    return
  }
  await mkdir(dirname(path), { recursive: true })
  if (image.backupPath) await copyFile(image.backupPath, path)
  else await writeFile(path, Buffer.from(image.contentBase64 ?? '', 'base64'))
}
async function readManifest(path: string): Promise<OfficialAddressInitManifest> {
  let value: unknown
  try {
    if ((await stat(path)).size > 8 * 1024 * 1024)
      throw new Error(
        'Manifest exceeds the memory budget; its embedded backup must be extracted before continuing.',
      )
    value = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(
      `Cannot read official-address initialisation manifest at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (
    !value ||
    typeof value !== 'object' ||
    (value as { version?: unknown }).version !== 2
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
