import { mkdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  ensureDraftSnapshotForRelease,
  resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey,
  resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey,
  resolveShardForTypeRegionYear,
  recordSnapshotLookupDependency,
  recordSnapshotAssemblyRun,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
} from '@repo/core/db/metaRegistry'
import type { DatasetProcessingMessage } from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type {
  HarbourClient,
  PublishDatasetResult,
} from '@repo/core/pipeline/harbourClient'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import { replaceReleaseProcessingActions } from '@repo/core/pipeline/db/processingActions'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import { calculateAndStoreApiReleaseSetStats } from '../api/apiReleaseSetStats.ts'
import { resolveApiReleaseSetStatsTarget } from '../api/apiReleaseSetStats.ts'
import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import type { UploadTarget } from '../cli/options.ts'
import { resolvePipelineEnvironment } from '../cli/options.ts'
import {
  createAsyncBufferFromR2,
  readParquetObjectsInBatches,
} from '@repo/core/pipeline/parquetR2'
import {
  hashNormalisedPlace,
  hashPlaceMaterialisation,
  assertPlaceAddressCardinality,
  buildPlaceLocalisationStatistics,
  extractPlaceAddressTexts,
  getPlaceAddressCountry,
  normaliseOverturePlace,
  type NormalisedPlace,
} from '@repo/core/pipeline/services/place'
import {
  createPlaceAddressMatcher,
  matchPlaceAddressTexts,
} from './placeAddressMatcher.ts'
import { createHash } from '@repo/core/pipeline/utils'
import { currentSchema, historySchema, metaSchema } from '@repo/db'
import type { ReleaseScopedStatsRow } from '@repo/db/metaSchema'
import { and, eq, ne } from 'drizzle-orm'
import { latLngToCell } from 'h3-js'

import { createHarbourControlClient } from '../api/harbourControl.ts'
import {
  replayRemoteCacheWithRetry,
  refreshRemoteMetaCache,
  resolveLocalAddressDbContext,
  type LocalAddressDbContext,
} from '../dbCache/localDbCache.ts'
import {
  executeSqlText,
  type SqlImportExecutionOptions,
  type SqlImportTargetContext,
} from '../localPipeline/sqlImport.ts'
import { mapWithConcurrency } from '../localPipeline/orchestrator.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../localPipeline/syncStagedRelease.ts'
import { LocalPipelineBucket } from '../localPipeline/localBucket.ts'
import { LocalUploadProgress } from '../upload/localUploadProgress.ts'

type PlaceUploadPlan = {
  datasetCode: string
  cohortKey: string
  regionCode: 'hk' | 'mo'
  releaseCode: string
  rowCount: number
  source: 'overture'
  sourceVersion: string
  theme: 'places'
  type: 'place'
}

type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

type EnrichedPlace = {
  place: NormalisedPlace
  address2dId: string | null
  address3dId: string | null
  divisionIds: string[]
  versionHash: string
  sourcePayloadHash: string
}

type PlaceHistoryRow = typeof historySchema.places.$inferSelect

type PlaceHistoryState = {
  bindingName: string
  row: PlaceHistoryRow
}

const LOCAL_RELEASE_ROOT = resolve(
  import.meta.dir,
  '../../../../../.local/harbour-sql/releases',
)
const PLACE_BATCH_SIZE = 512
const PLACE_ENRICHMENT_CONCURRENCY = 4
const MAX_SQL_BYTES = 90_000
const PLACE_H3_LEVELS = [5, 7, 9] as const

/**
 * Materialises an Overture Places release. The lifecycle is intentionally
 * family-neutral at its edges: registration, cache preparation, staged
 * progress, SQL import, publication, and failure reporting are the same
 * operations used by the address and division adapters.
 */
export async function processLocalPlaceSqlUpload(
  target: UploadTarget,
  previewPlan: PlaceUploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: {
    deferApiReleaseSet?: boolean
    skipSnapshotCleanup?: boolean
  } = {},
) {
  const releaseId = required(uploadResult.releaseId, 'releaseId')
  const releaseCode = required(uploadResult.releaseCode, 'releaseCode')
  const datasetId = required(uploadResult.datasetId, 'datasetId')
  const datasetCode = required(uploadResult.datasetCode, 'datasetCode')
  const rawObjectKey = required(uploadResult.rawObjectKey, 'rawObjectKey')
  const shardYear = resolveShardYear(previewPlan.cohortKey, previewPlan.sourceVersion)
  const releaseRoot = resolve(LOCAL_RELEASE_ROOT, targetName(target), releaseCode)
  await mkdir(releaseRoot, { recursive: true })

  const bucket = new LocalPipelineBucket(releaseRoot)
  await bucket.seedRawObject(rawObjectKey, preparedUpload.filePath)
  const progress = new LocalUploadProgress()
  const dbContext = await resolveLocalAddressDbContext(
    target,
    previewPlan.regionCode,
    shardYear,
    {
      cacheTableProfile: 'places',
      includePreviousShardYears: true,
      refreshRemoteTables: false,
    },
  )

  const metaDb = dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const message: DatasetProcessingMessage = {
    datasetId,
    datasetCode,
    rawObjectKey,
    releaseCode,
    releaseId,
    regionCode: previewPlan.regionCode,
    shardYear,
    cohortKey: previewPlan.cohortKey,
    source: previewPlan.source,
    sourceVersion: previewPlan.sourceVersion,
    theme: previewPlan.theme,
    type: previewPlan.type,
    processingMode: 'sql',
    ...(options.skipSnapshotCleanup ? { skipSnapshotCleanup: true } : {}),
  }
  await syncStagedReleaseIntoLocalMetaCache(
    metaDb as never,
    {
      datasetCode,
      rawObjectKey,
      releaseCode,
      releaseId,
    },
    message,
  )

  const remoteClient = createHarbourControlClient(target) as HarbourClient
  const client = target.remote
    ? remoteClient
    : createLocalControlClient(metaDb as never, { publishClient: remoteClient })
  const importOptions: SqlImportExecutionOptions = {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    apiToken: process.env.CLOUDFLARE_D1_TOKEN,
    isLocal: !target.remote,
    localWriteMaxRetries: 8,
    metaDatabaseId: dbContext.state.bindings.DB_META?.databaseId ?? null,
    remoteImportBatchBytes: 64 * 1024 * 1024,
  }
  let shouldRefreshRemoteMetaCache = false
  let postPublishCacheError: Error | null = null
  let publishResult: PublishDatasetResult | void | null = null

  try {
    await client.stageRunning(releaseId, 'processDataset', undefined, releaseCode)
    const snapshots = await resolvePlaceSnapshots(
      metaDb,
      dbContext.currentDb as unknown as HarbourReadableDb,
      previewPlan,
      datasetId,
      releaseId,
    )
    const places = await readPlaces(bucket, rawObjectKey, previewPlan.sourceVersion)
    assertPlaceAddressCardinality(places)
    await replaceReleaseProcessingActions(metaDb, releaseId, [
      ...buildPlaceCountryReviewProcessingActions(places),
      ...buildPlaceLocaleConflictProcessingActions(places),
    ])
    const enriched = await enrichPlaces(
      dbContext.currentDb as unknown as HarbourReadableDb,
      snapshots,
      places.filter(place => !isExcludedOverturePlace(place)),
    )
    const historyRows = await loadCurrentPlaceHistory(dbContext.historyTargets)
    const sql = await buildPlaceSql({
      activeHistoryBindingName: findTargetBindingName(
        dbContext.historyTargets,
        dbContext.historyDb,
      ),
      activeSourceBindingName: findTargetBindingName(
        dbContext.sourceTargets,
        dbContext.sourceDb,
      ),
      sourceBindingNames: dbContext.sourceTargets.map(target => target.bindingName),
      datasetId,
      message,
      snapshots,
      places: enriched,
      historyRows,
    })

    await replaceDatasetStats(metaDb, releaseId, buildPlaceReleaseStatsRows(enriched))

    await upsertPlaceMetadata(
      metaDb,
      snapshots,
      datasetId,
      releaseId,
      previewPlan,
      target,
    )
    const targets = await placeTargets(
      dbContext,
      metaDb,
      target,
      previewPlan.regionCode,
      shardYear,
    )
    if (target.remote) {
      await executeSqlText(
        targets.meta,
        await buildPlaceMetadataSql(metaDb, snapshots.snapshotId, releaseId),
        importOptions,
      )
    }
    await importSqlChunks(targets, sql, importOptions)
    await executeSqlText(
      targets.current,
      readFileSync(
        resolve(
          import.meta.dir,
          '../../../../../libs/db/scripts/sql/rebuild-places-fts.sql',
        ),
        'utf8',
      ),
      importOptions,
    )
    await client.stageCompleted(
      releaseId,
      'extractPlaces',
      {
        processedRows: enriched.length,
        addressLinkedRows: enriched.filter(row => row.address2dId).length,
        divisionLinkedRows: enriched.filter(row => row.divisionIds.length > 0).length,
      },
      releaseCode,
    )
    await client.stageCompleted(
      releaseId,
      'extractPlacesI18n',
      {
        localisedRows: enriched.reduce(
          (count, row) => count + row.place.i18n.length,
          0,
        ),
      },
      releaseCode,
    )
    publishResult = (await client.publishDataset(releaseId, releaseCode, {
      carriedSnapshots: [
        {
          resourceType: 'address',
          snapshotId: snapshots.addressSnapshotId,
          variant: 'default',
        },
        {
          resourceType: 'division',
          snapshotId: snapshots.divisionSnapshotId,
          variant: 'overture',
        },
      ],
      deferApiReleaseSet: options.deferApiReleaseSet,
      skipSnapshotCleanup: options.skipSnapshotCleanup,
    })) as PublishDatasetResult | void
    if (target.remote) {
      try {
        const cacheImportOptions: SqlImportExecutionOptions = {
          ...importOptions,
          accountId: undefined,
          apiToken: undefined,
          isLocal: true,
        }
        await replayRemoteCacheWithRetry(
          target.environment === 'production' ? 'production' : 'preview',
          dbContext.state.dbCacheDir,
          releaseCode,
          async () => {
            await importSqlChunks(targets, sql, cacheImportOptions)
            await executeSqlText(
              targets.current,
              readFileSync(
                resolve(
                  import.meta.dir,
                  '../../../../../libs/db/scripts/sql/rebuild-places-fts.sql',
                ),
                'utf8',
              ),
              cacheImportOptions,
            )
          },
        )
        shouldRefreshRemoteMetaCache = true
      } catch (error) {
        postPublishCacheError = normaliseError(error)
      }
    }
    if (postPublishCacheError) throw postPublishCacheError
    if (!options.deferApiReleaseSet) {
      await calculateAndStoreApiReleaseSetStats({
        family: 'place',
        currentDb: dbContext.currentDb as unknown as HarbourReadableDb,
        harbourClient: client,
        importOptions: {
          accountId: importOptions.accountId,
          apiToken: importOptions.apiToken,
          isLocal: importOptions.isLocal,
          metaDatabaseId: importOptions.metaDatabaseId,
        },
        metaDb,
        progress,
        releaseCode,
        releaseId,
        target: resolveApiReleaseSetStatsTarget(publishResult),
      })
    }
    await client.stageCompleted(
      releaseId,
      'processDataset',
      {
        processedRows: enriched.length,
        snapshotId: snapshots.snapshotId,
      },
      releaseCode,
    )
  } catch (error) {
    await client
      .stageFailed(
        releaseId,
        'processDataset',
        error instanceof Error ? error.message : String(error),
        undefined,
        releaseCode,
      )
      .catch(() => undefined)
    throw error
  } finally {
    dbContext.cleanup()
    if (shouldRefreshRemoteMetaCache && target.remote) {
      try {
        await refreshRemoteMetaCache(
          target.environment === 'production' ? 'production' : 'preview',
          dbContext.state.dbCacheDir,
        )
      } catch (error) {
        postPublishCacheError = normaliseError(error)
      }
    }
  }

  if (postPublishCacheError) throw postPublishCacheError

  return { publishResult }
}

/**
 * Records a country review action for Places with an excluded or missing
 * publisher address country code. Missing-country Places remain included.
 */
export function buildPlaceCountryReviewProcessingActions(
  places: NormalisedPlace[],
): ReleaseProcessingAction[] {
  return places.flatMap(place => {
    const country = getPlaceAddressCountry(place.raw.addresses)?.toUpperCase() ?? ''
    const excluded = country === 'CN' || country === 'MO'
    const missing = !country
    if (!excluded && !missing) return []

    return [
      {
        action: 'overture_place_country_review_required',
        affectedRecordCount: 1,
        evidence: {
          placeId: place.id,
          names: place.i18n,
          addresses: place.addresses,
          country: country || null,
          disposition: excluded ? 'excluded' : 'included',
          reason: excluded ? 'excluded_country_code' : 'missing_country_code',
        },
        mode: 'automatic',
        summary: excluded
          ? 'Excluded an Overture Place with a CN or MO address country code; retained it in the audit for review.'
          : 'Included an Overture Place with no address country code; retained it in the audit for review.',
      },
    ]
  })
}

/**
 * Preserves locale/script conflicts as release audit evidence without adding
 * resolver diagnostics to the public PlaceI18n record.
 */
export function buildPlaceLocaleConflictProcessingActions(
  places: NormalisedPlace[],
): ReleaseProcessingAction[] {
  return places.flatMap(place =>
    place.localeConflicts.map(conflict => ({
      action: 'overture_place_locale_conflict',
      affectedRecordCount: 1,
      evidence: {
        placeId: place.id,
        field: conflict.field === 'brand' ? 'brandName' : conflict.field,
        sourceLocale: conflict.sourceLocale,
        resolvedLocale: conflict.resolvedLocale,
        script: conflict.script,
        sourceText: conflict.sourceText,
        conflict: conflict.conflict,
        reason: conflict.reason,
      },
      mode: 'automatic',
      summary:
        'Resolved a Place localisation from script evidence and retained the source value and locale conflict for review.',
    })),
  )
}

export function isExcludedOverturePlace(place: NormalisedPlace) {
  const country = getPlaceAddressCountry(place.raw.addresses)?.toUpperCase()
  return country === 'CN' || country === 'MO'
}

async function resolvePlaceSnapshots(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  currentDb: HarbourReadableDb,
  plan: PlaceUploadPlan,
  datasetId: string,
  releaseId: string,
) {
  const place = await ensureDraftSnapshotForRelease(metaDb, 'place', {
    cohortKey: plan.cohortKey,
    datasetCode: plan.datasetCode,
    datasetId,
    regionCode: plan.regionCode,
    sourceReleaseId: releaseId,
    variant: 'default',
  })
  // The actual source release is supplied by the caller after registration.
  // The placeholder is replaced by upsertPlaceMetadata; resolving the snapshot
  // here keeps the data-building code independent of the registration layer.
  const address =
    (await resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey(
      metaDb,
      'address',
      plan.regionCode,
      plan.cohortKey,
      { variant: 'default' },
    )) ??
    (await resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey(
      metaDb,
      'address',
      plan.regionCode,
      plan.cohortKey,
      { variant: 'default' },
    ))
  if (!address) throw new Error('Places require a published address snapshot.')

  const addressRow = await currentDb
    .select({
      divisionSnapshotId: currentSchema.address2d.divisionSnapshotId,
    })
    .from(currentSchema.address2d)
    .where(eq(currentSchema.address2d.snapshotId, address.id))
    .limit(1)
    .get()
  if (!addressRow?.divisionSnapshotId) {
    throw new Error(
      `Selected Places address snapshot ${address.id} has no division snapshot from which to derive Place divisions.`,
    )
  }

  const inconsistentAddress = await currentDb
    .select({ id: currentSchema.address2d.id })
    .from(currentSchema.address2d)
    .where(
      and(
        eq(currentSchema.address2d.snapshotId, address.id),
        ne(currentSchema.address2d.divisionSnapshotId, addressRow.divisionSnapshotId),
      ),
    )
    .limit(1)
    .get()
  if (inconsistentAddress) {
    throw new Error(
      `Selected Places address snapshot ${address.id} contains multiple division snapshots; refusing to build an ambiguous Place index.`,
    )
  }

  const division = await metaDb
    .select({
      id: metaSchema.metaSnapshots.id,
      status: metaSchema.metaSnapshots.status,
    })
    .from(metaSchema.metaSnapshots)
    .where(
      and(
        eq(metaSchema.metaSnapshots.id, addressRow.divisionSnapshotId),
        eq(metaSchema.metaSnapshots.resourceType, 'division'),
        eq(metaSchema.metaSnapshots.status, 'published'),
      ),
    )
    .limit(1)
    .get()
  if (!division) {
    throw new Error(
      `Places require the published division snapshot ${addressRow.divisionSnapshotId} selected by address snapshot ${address.id}.`,
    )
  }
  return {
    addressSnapshotId: address.id,
    divisionSnapshotId: division.id,
    snapshotId: place.id,
  }
}

async function readPlaces(
  bucket: LocalPipelineBucket,
  rawObjectKey: string,
  sourceVersion: string,
) {
  const file = await createAsyncBufferFromR2(bucket, rawObjectKey)
  const places: NormalisedPlace[] = []
  for await (const batch of readParquetObjectsInBatches(file, PLACE_BATCH_SIZE)) {
    for (const row of batch) {
      const place = normaliseOverturePlace(row, sourceVersion)
      if (place) places.push(place)
    }
  }
  return places
}

async function enrichPlaces(
  currentDb: HarbourReadableDb,
  snapshots: { addressSnapshotId: string; divisionSnapshotId: string },
  places: NormalisedPlace[],
) {
  const addresses = await currentDb
    .select()
    .from(currentSchema.address2d)
    .where(eq(currentSchema.address2d.snapshotId, snapshots.addressSnapshotId))
    .all()
  const addressI18n = await currentDb
    .select({
      addressId: currentSchema.address2dI18n.addressId,
      locale: currentSchema.address2dI18n.locale,
      formattedAddress: currentSchema.address2dI18n.formattedAddress,
      buildingName: currentSchema.address2dI18n.buildingName,
      buildingNumberExpression: currentSchema.address2dI18n.buildingNumberExpression,
      buildingNumberFrom: currentSchema.address2dI18n.buildingNumberFrom,
      buildingNumberTo: currentSchema.address2dI18n.buildingNumberTo,
      blockExpression: currentSchema.address2dI18n.blockExpression,
      phaseExpression: currentSchema.address2dI18n.phaseExpression,
      estateName: currentSchema.address2dI18n.estateName,
      streetName: currentSchema.address2dI18n.streetName,
    })
    .from(currentSchema.address2dI18n)
    .where(eq(currentSchema.address2dI18n.snapshotId, snapshots.addressSnapshotId))
    .all()
  const divisionIds = new Set(
    (
      await currentDb
        .select({ id: currentSchema.divisions.id })
        .from(currentSchema.divisions)
        .where(eq(currentSchema.divisions.snapshotId, snapshots.divisionSnapshotId))
        .all()
    ).map(row => row.id),
  )
  const addressById = new Map(addresses.map(row => [row.id, row]))
  const addressMatcher = createPlaceAddressMatcher(addressI18n)
  return mapWithConcurrency(places, PLACE_ENRICHMENT_CONCURRENCY, async place => {
    const addressId = matchPlaceAddressTexts(
      extractPlaceAddressTexts(place.raw.addresses),
      addressMatcher,
    )
    const address = addressId ? addressById.get(addressId) : undefined
    const referencedDivisionIds = address
      ? [
          address.countryId,
          address.areaId,
          address.districtId,
          address.townId,
          address.macrohoodId,
          address.villageId,
          address.neighbourhoodId,
          address.hamletId,
          address.microhoodId,
        ].filter((id): id is string => typeof id === 'string' && divisionIds.has(id))
      : []
    const contentHash = await hashNormalisedPlace(place)
    return {
      place,
      address2dId: addressId,
      address3dId: null,
      divisionIds: [...new Set(referencedDivisionIds)],
      versionHash: await hashPlaceMaterialisation(place, {
        addressSnapshotId: snapshots.addressSnapshotId,
        divisionSnapshotId: snapshots.divisionSnapshotId,
        addressId,
        divisionIds: referencedDivisionIds,
        contentHash,
      }),
      sourcePayloadHash: await createHash(place.raw),
    }
  })
}

async function loadCurrentPlaceHistory(
  targets: LocalAddressDbContext['historyTargets'],
): Promise<PlaceHistoryState[]> {
  const rows = await Promise.all(
    targets.map(async target => ({
      bindingName: target.bindingName,
      rows: (await (target.db as HarbourReadableDb)
        .select()
        .from(historySchema.places)
        .where(eq(historySchema.places.isCurrent, true))
        .all()) as unknown as PlaceHistoryRow[],
    })),
  )
  return rows.flatMap(target =>
    target.rows.map(row => ({ bindingName: target.bindingName, row })),
  )
}

export async function buildPlaceSql(input: {
  activeHistoryBindingName: string
  activeSourceBindingName: string
  sourceBindingNames: string[]
  datasetId: string
  message: DatasetProcessingMessage
  snapshots: {
    addressSnapshotId: string
    divisionSnapshotId: string
    snapshotId: string
  }
  places: EnrichedPlace[]
  historyRows: PlaceHistoryState[]
}) {
  const now = new Date().toISOString()
  const currentSql: string[] = [
    `DELETE FROM placesCells WHERE snapshotId = ${lit(input.snapshots.snapshotId)};`,
    `DELETE FROM placesDivision WHERE placeSnapshotId = ${lit(input.snapshots.snapshotId)};`,
    `DELETE FROM placesI18n WHERE snapshotId = ${lit(input.snapshots.snapshotId)};`,
    `DELETE FROM places WHERE snapshotId = ${lit(input.snapshots.snapshotId)};`,
  ]
  const historySqlByBinding = new Map<string, string[]>()
  const sourceSqlByBinding = new Map<string, string[]>()
  const changes: string[] = []
  const previousById = new Map(input.historyRows.map(state => [state.row.id, state]))

  const historyStatements = (bindingName: string) => {
    const statements = historySqlByBinding.get(bindingName)
    if (statements) return statements
    const created: string[] = []
    historySqlByBinding.set(bindingName, created)
    return created
  }
  const sourceStatements = (bindingName: string) => {
    const statements = sourceSqlByBinding.get(bindingName)
    if (statements) return statements
    const created: string[] = []
    sourceSqlByBinding.set(bindingName, created)
    return created
  }

  for (const bindingName of input.sourceBindingNames) {
    sourceStatements(bindingName).push(
      `UPDATE overturePlaces SET isCurrent = 0, validToRelease = ${lit(input.message.sourceVersion)}, updatedAt = ${lit(now)} WHERE isCurrent = 1;`,
    )
  }

  for (const row of input.places) {
    const place = row.place
    const previous = previousById.get(place.id)
    const firstSeenMonth =
      typeof previous?.row.firstSeenMonth === 'string'
        ? previous.row.firstSeenMonth
        : place.firstSeenMonth
    sourceStatements(input.activeSourceBindingName).push(
      insertSql('overturePlaces', {
        sourceRecordId: place.id,
        sources: place.sources,
        rawProperties: place.raw,
        version: numberOrNull(place.raw.version),
        versionHash: row.sourcePayloadHash,
        releaseId: input.message.releaseId,
        validFromRelease: input.message.sourceVersion,
        validToRelease: null,
        isCurrent: 1,
        names: place.raw.names,
        lng: place.lng,
        lat: place.lat,
        bbox: place.bbox,
        operatingStatus: place.operatingStatus,
        basicCategory: place.basicCategory,
        taxonomyPrimary: place.taxonomyPrimary,
        taxonomyHierarchy: place.taxonomyHierarchy,
        taxonomyAlternates: place.taxonomyAlternates,
        wikidataId: place.wikidataId,
        brandNames: recordValue(place.raw.brand, 'names'),
        websites: place.websites,
        socials: place.socials,
        emails: place.emails,
        phones: place.phones,
        addresses: place.addresses,
        confidence: place.confidence,
        createdAt: now,
        updatedAt: now,
      }),
    )
    currentSql.push(
      insertSql('places', {
        snapshotId: input.snapshots.snapshotId,
        id: place.id,
        releaseId: input.message.releaseId,
        addressSnapshotId: row.address2dId ? input.snapshots.addressSnapshotId : null,
        address2dId: row.address2dId,
        address3dId: row.address3dId,
        lng: place.lng,
        lat: place.lat,
        bbox: place.bbox,
        operatingStatus: place.operatingStatus,
        basicCategory: place.basicCategory,
        taxonomyPrimary: place.taxonomyPrimary,
        taxonomyHierarchy: place.taxonomyHierarchy,
        taxonomyAlternates: place.taxonomyAlternates,
        wikidataId: place.wikidataId,
        websites: place.websites,
        socials: place.socials,
        emails: place.emails,
        phones: place.phones,
        addresses: place.addresses,
        confidence: place.confidence,
        sources: place.sources,
        firstSeenMonth,
        lastSeenMonth: place.lastSeenMonth,
        createdAt: now,
        updatedAt: now,
      }),
    )
    for (const h3Level of PLACE_H3_LEVELS) {
      currentSql.push(
        insertSql('placesCells', {
          snapshotId: input.snapshots.snapshotId,
          id: place.id,
          h3Level,
          h3Cell: latLngToCell(place.lat, place.lng, h3Level),
        }),
      )
    }
    for (const localised of place.i18n) {
      currentSql.push(
        insertSql('placesI18n', {
          snapshotId: input.snapshots.snapshotId,
          placeId: place.id,
          locale: localised.locale,
          name: localised.name,
          nameVariant: localised.nameVariant,
          nameAlts: localised.nameAlts,
          brandName: localised.brandName,
          brandNameVariant: localised.brandNameVariant,
          brandNameAlts: localised.brandNameAlts,
          freeformAddress: localised.freeformAddress,
          provenance: localised.provenance,
          createdAt: now,
          updatedAt: now,
        }),
      )
      changes.push(
        insertSql('snapshotVersionChanges', {
          snapshotId: input.snapshots.snapshotId,
          recordType: 'placeI18n',
          recordId: place.id,
          locale: localised.locale,
          versionHash: row.versionHash,
          operation: 'upsert',
          sourceReleaseId: input.message.releaseId,
          createdAt: now,
          updatedAt: now,
        }),
      )
    }
    for (const divisionId of row.divisionIds) {
      currentSql.push(
        insertSql('placesDivision', {
          placeSnapshotId: input.snapshots.snapshotId,
          placeId: place.id,
          divisionSnapshotId: input.snapshots.divisionSnapshotId,
          divisionId,
        }),
      )
    }

    if (previous?.row.versionHash !== row.versionHash) {
      if (previous) {
        historyStatements(previous.bindingName).push(
          `UPDATE places SET isCurrent = 0, updatedAt = ${lit(now)} WHERE id = ${lit(place.id)} AND isCurrent = 1;`,
        )
        historyStatements(previous.bindingName).push(
          `UPDATE placesI18n SET isCurrent = 0, updatedAt = ${lit(now)} WHERE placeId = ${lit(place.id)} AND isCurrent = 1;`,
        )
      }
      historyStatements(input.activeHistoryBindingName).push(
        insertSql('places', {
          id: place.id,
          releaseId: input.message.releaseId,
          addressSnapshotId: row.address2dId ? input.snapshots.addressSnapshotId : null,
          address2dId: row.address2dId,
          address3dId: row.address3dId,
          lng: place.lng,
          lat: place.lat,
          bbox: place.bbox,
          operatingStatus: place.operatingStatus,
          basicCategory: place.basicCategory,
          taxonomyPrimary: place.taxonomyPrimary,
          taxonomyHierarchy: place.taxonomyHierarchy,
          taxonomyAlternates: place.taxonomyAlternates,
          wikidataId: place.wikidataId,
          websites: place.websites,
          socials: place.socials,
          emails: place.emails,
          phones: place.phones,
          addresses: place.addresses,
          confidence: place.confidence,
          sources: place.sources,
          firstSeenMonth,
          lastSeenMonth: place.lastSeenMonth,
          versionHash: row.versionHash,
          sourceReleaseId: input.message.releaseId,
          snapshotId: input.snapshots.snapshotId,
          isCurrent: 1,
          createdAt: now,
          updatedAt: now,
        }),
      )
      for (const localised of place.i18n) {
        const i18nVersionHash = await createHash({
          placeVersionHash: row.versionHash,
          locale: localised.locale,
          localised,
        })
        historyStatements(input.activeHistoryBindingName).push(
          insertSql('placesI18n', {
            placeId: place.id,
            locale: localised.locale,
            name: localised.name,
            nameVariant: localised.nameVariant,
            nameAlts: localised.nameAlts,
            brandName: localised.brandName,
            brandNameVariant: localised.brandNameVariant,
            brandNameAlts: localised.brandNameAlts,
            freeformAddress: localised.freeformAddress,
            provenance: localised.provenance,
            versionHash: i18nVersionHash,
            sourceReleaseId: input.message.releaseId,
            snapshotId: input.snapshots.snapshotId,
            isCurrent: 1,
            createdAt: now,
            updatedAt: now,
          }),
        )
      }
      changes.push(
        insertSql('snapshotVersionChanges', {
          snapshotId: input.snapshots.snapshotId,
          recordType: 'place',
          recordId: place.id,
          locale: '',
          versionHash: row.versionHash,
          operation: 'upsert',
          sourceReleaseId: input.message.releaseId,
          createdAt: now,
          updatedAt: now,
        }),
      )
    } else {
      changes.push(
        insertSql('snapshotVersionChanges', {
          snapshotId: input.snapshots.snapshotId,
          recordType: 'place',
          recordId: place.id,
          locale: '',
          versionHash: previous.row.versionHash,
          operation: 'upsert',
          sourceReleaseId: input.message.releaseId,
          createdAt: now,
          updatedAt: now,
        }),
      )
    }
  }

  const seen = new Set(input.places.map(row => row.place.id))
  for (const previous of previousById.values()) {
    const previousId =
      typeof previous.row.id === 'string' ? previous.row.id : String(previous.row.id)
    if (seen.has(previousId)) continue
    historyStatements(previous.bindingName).push(
      `UPDATE places SET isCurrent = 0, updatedAt = ${lit(now)} WHERE id = ${lit(previousId)} AND isCurrent = 1;`,
    )
    historyStatements(previous.bindingName).push(
      `UPDATE placesI18n SET isCurrent = 0, updatedAt = ${lit(now)} WHERE placeId = ${lit(previousId)} AND isCurrent = 1;`,
    )
    changes.push(
      insertSql('snapshotVersionChanges', {
        snapshotId: input.snapshots.snapshotId,
        recordType: 'place',
        recordId: previous.row.id,
        locale: '',
        versionHash: null,
        operation: 'delete',
        sourceReleaseId: input.message.releaseId,
        createdAt: now,
        updatedAt: now,
      }),
    )
  }

  return {
    currentSql,
    historySqlByBinding,
    sourceSqlByBinding,
    changes,
  }
}

async function upsertPlaceMetadata(
  metaDb: HarbourReadableDb & HarbourWritableDb,
  snapshots: {
    addressSnapshotId: string
    divisionSnapshotId: string
    snapshotId: string
  },
  datasetId: string,
  releaseId: string,
  plan: PlaceUploadPlan,
  target: UploadTarget,
) {
  await upsertSnapshotSource(
    metaDb,
    snapshots.snapshotId,
    datasetId,
    releaseId,
    'primary',
    {
      anchorReleaseId: releaseId,
      selectedByRule: 'snapshot-assembly-places-overture-v1',
      selectionMode: 'exact_ref',
      sourceCohortKey: plan.cohortKey,
    },
  )
  await recordSnapshotAssemblyRun(metaDb, {
    snapshotId: snapshots.snapshotId,
    resourceType: 'place',
    anchorReleaseId: releaseId,
    anchorCohortKey: plan.cohortKey,
    selectionSummaryJson: {
      addressSnapshotId: snapshots.addressSnapshotId,
      divisionSnapshotId: snapshots.divisionSnapshotId,
      sourceReleaseId: releaseId,
      sourceVersion: plan.sourceVersion,
    },
  })
  await recordSnapshotLookupDependency(metaDb, {
    anchorReleaseId: releaseId,
    lookupSnapshotId: snapshots.addressSnapshotId,
    selectedByRule: 'api-composition:places/overture:place/default->address/default',
    selectionMode: 'latest_at_or_before_or_earliest_after_cohort',
    snapshotId: snapshots.snapshotId,
  })
  await recordSnapshotLookupDependency(metaDb, {
    anchorReleaseId: releaseId,
    lookupSnapshotId: snapshots.divisionSnapshotId,
    selectedByRule:
      'api-composition:places/overture:address/default->division/overture',
    selectionMode: 'address_snapshot_reference',
    snapshotId: snapshots.snapshotId,
  })
  const environment = resolvePipelineEnvironment(target)
  const currentShard = await resolveShardForTypeRegionYear(
    metaDb,
    'current',
    environment,
  )
  const historyShard = await resolveShardForTypeRegionYear(
    metaDb,
    'history',
    environment,
    plan.regionCode,
    plan.sourceVersion.slice(0, 4),
  )
  const sourceShard = await resolveShardForTypeRegionYear(
    metaDb,
    'source',
    environment,
    plan.regionCode,
    plan.sourceVersion.slice(0, 4),
  )
  if (currentShard)
    await upsertSnapshotShardAssignment(metaDb, snapshots.snapshotId, currentShard.id)
  if (historyShard)
    await upsertReleaseShardAssignment(metaDb, releaseId, historyShard.id)
  if (sourceShard) await upsertReleaseShardAssignment(metaDb, releaseId, sourceShard.id)
}

async function placeTargets(
  dbContext: LocalAddressDbContext,
  metaDb: HarbourReadableDb,
  target: UploadTarget,
  regionCode: string,
  shardYear: string,
) {
  const environment = resolvePipelineEnvironment(target)
  const [currentShard, historyShard, sourceShard] = await Promise.all([
    resolveShardForTypeRegionYear(metaDb, 'current', environment),
    resolveShardForTypeRegionYear(
      metaDb,
      'history',
      environment,
      regionCode,
      shardYear,
    ),
    resolveShardForTypeRegionYear(metaDb, 'source', environment, regionCode, shardYear),
  ])
  return {
    current: {
      binding: dbContext.currentBinding,
      databaseId: currentShard?.databaseId ?? null,
      name: 'current',
    } satisfies SqlImportTargetContext,
    history: {
      binding: dbContext.historyBinding,
      databaseId: historyShard?.databaseId ?? null,
      name: 'history',
    } satisfies SqlImportTargetContext,
    historyByBinding: new Map(
      dbContext.historyTargets.map(target => [
        target.bindingName,
        {
          binding: target.binding,
          databaseId: target.databaseId,
          name: 'history' as const,
        } satisfies SqlImportTargetContext,
      ]),
    ),
    source: {
      binding: dbContext.sourceBinding,
      databaseId: sourceShard?.databaseId ?? null,
      name: 'source',
    } satisfies SqlImportTargetContext,
    sourceByBinding: new Map(
      dbContext.sourceTargets.map(target => [
        target.bindingName,
        {
          binding: target.binding,
          databaseId: target.databaseId,
          name: 'source' as const,
        } satisfies SqlImportTargetContext,
      ]),
    ),
    meta: {
      binding: dbContext.metaBinding,
      databaseId: dbContext.state.bindings.DB_META?.databaseId ?? null,
      name: 'meta',
    } satisfies SqlImportTargetContext,
    environment,
    metaDb,
    shardYear,
  }
}

async function buildPlaceMetadataSql(
  db: HarbourReadableDb,
  snapshotId: string,
  releaseId: string,
) {
  const snapshot = await db
    .select()
    .from(metaSchema.metaSnapshots)
    .where(eq(metaSchema.metaSnapshots.id, snapshotId))
    .limit(1)
    .get()
  if (!snapshot) throw new Error(`Place snapshot metadata not found: ${snapshotId}.`)
  const [
    lineage,
    sources,
    shardAssignments,
    assemblyRuns,
    releaseAssignments,
    releaseStats,
  ] = await Promise.all([
    db
      .select()
      .from(metaSchema.metaSnapshotLineages)
      .where(eq(metaSchema.metaSnapshotLineages.id, String(snapshot.snapshotLineageId)))
      .all(),
    db
      .select()
      .from(metaSchema.metaSnapshotSources)
      .where(eq(metaSchema.metaSnapshotSources.snapshotId, snapshotId))
      .all(),
    db
      .select()
      .from(metaSchema.metaSnapshotShardAssignments)
      .where(eq(metaSchema.metaSnapshotShardAssignments.snapshotId, snapshotId))
      .all(),
    db
      .select()
      .from(metaSchema.metaSnapshotAssemblyRuns)
      .where(eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, snapshotId))
      .all(),
    db
      .select()
      .from(metaSchema.metaReleaseShardAssignments)
      .where(eq(metaSchema.metaReleaseShardAssignments.releaseId, releaseId))
      .all(),
    db
      .select()
      .from(metaSchema.stats)
      .where(eq(metaSchema.stats.releaseId, releaseId))
      .all(),
  ])
  return [
    ...lineage.map(row => insertSql('snapshotLineages', row)),
    insertSql('snapshots', snapshot),
    ...sources.map(row => insertSql('snapshotSources', row)),
    ...shardAssignments.map(row => insertSql('snapshotShardAssignments', row)),
    ...assemblyRuns.map(row => insertSql('snapshotAssemblyRuns', row)),
    ...releaseAssignments.map(row => insertSql('releaseShardAssignments', row)),
    ...releaseStats.map(row => insertSql('stats', row)),
  ].join('\n')
}

export function buildPlaceReleaseStatsRows(
  places: EnrichedPlace[],
): ReleaseScopedStatsRow[] {
  const timestamp = new Date().toISOString()
  const row = (
    dimension: string,
    value: number,
    groupBy: string | null = null,
    groupValue: string | null = null,
    metric: 'count' | 'percentage' = 'count',
  ): ReleaseScopedStatsRow => ({
    createdAt: timestamp,
    dimension,
    groupBy,
    groupValue,
    metric,
    metricUnit: metric,
    type: 'release',
    updatedAt: timestamp,
    value,
  })

  const localeCounts = new Map<string, number>()
  for (const place of places) {
    for (const localised of place.place.i18n) {
      localeCounts.set(localised.locale, (localeCounts.get(localised.locale) ?? 0) + 1)
    }
  }
  const localisationStats = buildPlaceLocalisationStatistics(
    places.map(({ place }) => place),
  )
  const localisedPlaceCount = places.filter(place => place.place.i18n.length > 0).length
  const statsRows: ReleaseScopedStatsRow[] = [
    row('records', places.length),
    row('localised_records', localisedPlaceCount),
    row(
      'localised_rows',
      places.reduce((count, place) => count + place.place.i18n.length, 0),
    ),
    row(
      'address_links',
      places.filter(place => place.address2dId || place.address3dId).length,
    ),
    row(
      'division_links',
      places.reduce((count, place) => count + place.divisionIds.length, 0),
    ),
    ...[...localeCounts.entries()].map(([locale, count]) =>
      row('localised_records', count, 'locale', locale),
    ),
  ]
  for (const [fieldLocale, stats] of localisationStats.fields) {
    const [field, locale] = fieldLocale.split('\u0000')
    const grouping = { groupBy: 'field_locale', groupValue: `${field}:${locale}` }
    statsRows.push(
      row(
        'localisation_value_count',
        stats.valueCount,
        grouping.groupBy,
        grouping.groupValue,
      ),
      row(
        'localisation_coverage',
        percentage(stats.valueCount, places.length),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_provided_coverage',
        percentage(stats.providedCount, places.length),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_inferred_coverage',
        percentage(stats.inferredCount, places.length),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_ai_translated_coverage',
        percentage(stats.aiTranslatedCount, places.length),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_human_translated_coverage',
        percentage(stats.humanTranslatedCount, places.length),
        grouping.groupBy,
        grouping.groupValue,
        'percentage',
      ),
      row(
        'localisation_conflict_count',
        stats.conflictCount,
        grouping.groupBy,
        grouping.groupValue,
      ),
      row(
        'localisation_missing_value_count',
        stats.missingCount,
        grouping.groupBy,
        grouping.groupValue,
      ),
    )
  }
  const referenceGrouping = { groupBy: 'field', groupValue: 'referenceName' }
  statsRows.push(
    row('reference_name_count', localisationStats.referenceNameCount),
    row(
      'reference_name_coverage',
      percentage(localisationStats.referenceNameCount, places.length),
      referenceGrouping.groupBy,
      referenceGrouping.groupValue,
      'percentage',
    ),
    row(
      'bilingual_reference_name_count',
      localisationStats.bilingualReferenceNameCount,
    ),
    row(
      'bilingual_reference_name_coverage',
      percentage(localisationStats.bilingualReferenceNameCount, places.length),
      referenceGrouping.groupBy,
      referenceGrouping.groupValue,
      'percentage',
    ),
  )
  return statsRows
}

function percentage(value: number, total: number) {
  return total === 0 ? 0 : Number(((value / total) * 100).toFixed(2))
}

async function importSqlChunks(
  targets: Awaited<ReturnType<typeof placeTargets>>,
  sql: Awaited<ReturnType<typeof buildPlaceSql>>,
  options: SqlImportExecutionOptions,
) {
  for (const [bindingName, statements] of sql.sourceSqlByBinding) {
    const target = targets.sourceByBinding.get(bindingName)
    if (!target) throw new Error(`Missing Places source target ${bindingName}.`)
    for (const chunk of chunkStatements(statements))
      await executeSqlText(target, chunk, options)
  }
  for (const [bindingName, statements] of sql.historySqlByBinding) {
    const target = targets.historyByBinding.get(bindingName)
    if (!target) throw new Error(`Missing Places history target ${bindingName}.`)
    for (const chunk of chunkStatements(statements))
      await executeSqlText(target, chunk, options)
  }
  for (const chunk of chunkStatements(sql.currentSql))
    await executeSqlText(targets.current, chunk, options)
  for (const chunk of chunkStatements(sql.changes))
    await executeSqlText(targets.history, chunk, options)
}

function normaliseError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

function chunkStatements(statements: string[]) {
  const chunks: string[] = []
  let current = ''
  for (const statement of statements) {
    if (current && Buffer.byteLength(current + statement) > MAX_SQL_BYTES) {
      chunks.push(current)
      current = ''
    }
    current += statement
  }
  if (current) chunks.push(current)
  return chunks
}

function insertSql(table: string, values: Record<string, unknown>) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined)
  return `INSERT OR REPLACE INTO "${table}" (${entries.map(([key]) => `"${key}"`).join(', ')}) VALUES (${entries.map(([, value]) => sqlValue(value)).join(', ')});`
}

function sqlValue(value: unknown) {
  if (value === null) return 'NULL'
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  if (typeof value === 'boolean') return value ? '1' : '0'
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return lit(text ?? '')
}

function lit(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

function recordValue(value: unknown, key: string) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)[key]
    : null
}

function numberOrNull(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`Missing ${name} for Places SQL processing.`)
  return value
}

function findTargetBindingName(
  targets: Array<{ bindingName: string; db: unknown }>,
  db: unknown,
) {
  const target = targets.find(candidate => candidate.db === db)
  if (!target) throw new Error('Could not resolve the active Places shard binding.')
  return target.bindingName
}

function resolveShardYear(cohortKey: string, sourceVersion: string) {
  const year = cohortKey.slice(0, 4)
  if (/^\d{4}$/.test(year)) return year
  const sourceYear = sourceVersion.slice(0, 4)
  if (/^\d{4}$/.test(sourceYear)) return sourceYear
  throw new Error(
    `Could not resolve Places shard year from ${cohortKey}/${sourceVersion}.`,
  )
}

function targetName(target: UploadTarget) {
  return target.remote && target.environment === 'production'
    ? 'production'
    : target.remote
      ? 'preview'
      : 'local'
}
