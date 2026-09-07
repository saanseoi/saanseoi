import { rename, open } from 'node:fs/promises'
import { reuseStagedPlaces } from './stagedPlaceCache.ts'
import { reuseEnrichedPlaces } from './enrichedPlaceCache.ts'
import { deliveryFileSha256, sha256 } from '../localPipeline/sqlDeliveryFiles.ts'
import type { PlaceAddress3dReadObserver } from './placeAddress3d.ts'
import { createPlaceAddress3dMatcher } from './placeAddress3d'
import { createReadStream } from 'node:fs'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline'
import {
  ensureDraftSnapshotForRelease,
  resolveEarliestPublishedSnapshotForResourceTypeRegionAtOrAfterCohortKey,
  resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type { ReleaseProcessingAction } from '@repo/core/pipeline/db/processingActions'
import {
  createAsyncBufferFromR2,
  readParquetObjectsInBatches,
} from '@repo/core/pipeline/parquetR2'
import {
  hashNormalisedPlace,
  hashPlaceMaterialisation,
  assertPlaceAddressCardinality,
  getPlaceAddressCountry,
  normaliseOverturePlace,
  type NormalisedPlace,
} from '@repo/core/pipeline/services/place'
import type { StagedAddressResolution } from './supplementaryPlaceAddress.ts'
import type { buildSupplementaryAddressRows } from './supplementaryPlaceAddressRows.ts'
import { createHash } from '@repo/core/pipeline/utils'
import { recordPlaceAddressAssembly } from '@repo/core/pipeline/services/placeAddressAssembly'
import { currentSchema, metaSchema } from '@repo/db'
import { and, eq, ne } from 'drizzle-orm'
import { mapWithConcurrency } from '../localPipeline/orchestrator.ts'
import type { LocalPipelineBucket } from '../localPipeline/localBucket.ts'
import type {
  PlaceUploadPlan,
  StagedEnrichedPlaces,
  StagedPlaces,
} from './processLocalPlaceSqlUploadTypes.ts'
import {
  ENRICHED_PLACES_FILE,
  NORMALISED_PLACES_FILE,
  PLACE_BATCH_SIZE,
  PLACE_ENRICHMENT_CONCURRENCY,
} from './processLocalPlaceSqlUploadConfig.ts'
import {
  addPlaceReleaseStats,
  createPlaceReleaseStatsAccumulator,
} from './processLocalPlaceSqlUploadStatistics.ts'

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

export async function resolvePlaceSnapshots(
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
  const previousRuns = await metaDb
    .select()
    .from(metaSchema.metaSnapshotAssemblyRuns)
    .where(eq(metaSchema.metaSnapshotAssemblyRuns.snapshotId, place.id))
    .all()
  const recordedAddressId = previousRuns
    .map(
      run =>
        (run.selectionSummaryJson as { addressSnapshotId?: string } | null)
          ?.addressSnapshotId,
    )
    .find(Boolean)
  const address = recordedAddressId
    ? await metaDb
        .select({ id: metaSchema.metaSnapshots.id })
        .from(metaSchema.metaSnapshots)
        .where(
          and(
            eq(metaSchema.metaSnapshots.id, recordedAddressId),
            eq(metaSchema.metaSnapshots.status, 'published'),
            eq(metaSchema.metaSnapshots.resourceType, 'address'),
          ),
        )
        .get()
    : ((await resolveLatestPublishedSnapshotForResourceTypeRegionAtOrBeforeCohortKey(
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
      )))
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
  if (!recordedAddressId)
    await recordPlaceAddressAssembly(metaDb, {
      snapshotId: place.id,
      resourceType: 'place',
      anchorReleaseId: releaseId,
      anchorCohortKey: plan.cohortKey,
      selectionSummaryJson: {
        addressSnapshotId: address.id,
        divisionSnapshotId: division.id,
        addressReviewRequired: null,
      },
    })
  return {
    addressSnapshotId: address.id,
    divisionSnapshotId: division.id,
    snapshotId: place.id,
  }
}

export async function stagePlaces(
  bucket: LocalPipelineBucket,
  rawObjectKey: string,
  sourceVersion: string,
  releaseRoot: string,
  onProgress?: (current: number) => void,
  sourceSha256?: string,
): Promise<StagedPlaces> {
  if (sourceSha256)
    return reuseStagedPlaces({
      path: resolve(releaseRoot, NORMALISED_PLACES_FILE),
      sourceSha256,
      sourceVersion,
      rawObjectKey,
      generate: () =>
        stagePlaces(bucket, rawObjectKey, sourceVersion, releaseRoot, onProgress),
    })
  const file = await createAsyncBufferFromR2(bucket, rawObjectKey)
  const path = resolve(releaseRoot, NORMALISED_PLACES_FILE)
  const tempPath = `${path}.tmp`
  const output = await open(tempPath, 'w')
  const actions: ReleaseProcessingAction[] = []
  let includedRows = 0
  let processedRows = 0
  try {
    for await (const batch of readParquetObjectsInBatches(file, PLACE_BATCH_SIZE)) {
      for (const row of batch) {
        const place = normaliseOverturePlace(row, sourceVersion)
        if (place) {
          assertPlaceAddressCardinality([place])
          actions.push(
            ...buildPlaceCountryReviewProcessingActions([place]),
            ...buildPlaceLocaleConflictProcessingActions([place]),
          )
          if (!isExcludedOverturePlace(place)) {
            await output.writeFile(`${JSON.stringify(place)}\n`)
            includedRows += 1
          }
        }
        processedRows += 1
      }
      onProgress?.(processedRows)
    }
    await output.sync()
  } finally {
    await output.close()
  }
  await rename(tempPath, path)
  return { actions, includedRows, path, processedRows }
}

export async function* readStagedJsonBatches<T>(
  path: string,
  batchSize = PLACE_BATCH_SIZE,
) {
  let batch: T[] = []
  for await (const value of readStagedJsonLines<T>(path)) {
    batch.push(value)
    if (batch.length < batchSize) continue
    yield batch
    batch = []
  }
  if (batch.length) yield batch
}

export async function* readStagedJsonLines<T>(path: string) {
  const lines = createInterface({
    crlfDelay: Infinity,
    input: createReadStream(path, { encoding: 'utf8' }),
  })
  for await (const line of lines) {
    if (line.trim()) yield JSON.parse(line) as T
  }
}

export async function stageEnrichedPlaces(
  currentDb: HarbourReadableDb,
  snapshots: { addressSnapshotId: string; divisionSnapshotId: string },
  places: AsyncIterable<NormalisedPlace>,
  resolutions: AsyncIterable<StagedAddressResolution>,
  releaseRoot: string,
  onProgress?: (current: number) => void,
  supplementary?: {
    resolutionPath: string
    snapshotId: string
    addresses: Awaited<ReturnType<typeof buildSupplementaryAddressRows>>
  },
  sourcePath?: string,
): Promise<StagedEnrichedPlaces> {
  const addresses = await currentDb
    .select({
      areaId: currentSchema.address2d.areaId,
      countryId: currentSchema.address2d.countryId,
      districtId: currentSchema.address2d.districtId,
      hamletId: currentSchema.address2d.hamletId,
      id: currentSchema.address2d.id,
      parentAddressId: currentSchema.address2d.parentAddressId,
      macrohoodId: currentSchema.address2d.macrohoodId,
      microhoodId: currentSchema.address2d.microhoodId,
      neighbourhoodId: currentSchema.address2d.neighbourhoodId,
      snapshotId: currentSchema.address2d.snapshotId,
      townId: currentSchema.address2d.townId,
      villageId: currentSchema.address2d.villageId,
    })
    .from(currentSchema.address2d)
    .where(eq(currentSchema.address2d.snapshotId, snapshots.addressSnapshotId))
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
  if (!supplementary)
    throw new Error('Places require supplementary address analysis before enrichment.')
  const supplementaryById = new Map(
    supplementary.addresses.map(row => [row.current.id, row.current]),
  )
  const path = resolve(releaseRoot, ENRICHED_PLACES_FILE)
  const generate = async (
    observe?: PlaceAddress3dReadObserver,
    validateBeforeCommit?: () => Promise<void>,
  ) => {
    const tempPath = `${path}.tmp`
    const output = await open(tempPath, 'w')
    const stats = createPlaceReleaseStatsAccumulator()
    const matchAddress3d = createPlaceAddress3dMatcher(currentDb, observe)
    let processedPlaces = 0
    try {
      for await (const batch of groupAsyncIterable(
        zipPlacesAndResolutions(places, resolutions),
        PLACE_BATCH_SIZE,
      )) {
        const enriched = await mapWithConcurrency(
          batch,
          PLACE_ENRICHMENT_CONCURRENCY,
          async ({ place, resolution }) => {
            if (resolution.tier === 'review')
              throw new Error(`Unresolved Place Address ${place.id}.`)
            const addressId = resolution.addressId
            const addressSnapshotId =
              resolution.tier === 'supplementary'
                ? supplementary.snapshotId
                : snapshots.addressSnapshotId
            const address = addressId
              ? resolution.tier === 'supplementary'
                ? supplementaryById.get(addressId)
                : addressById.get(addressId)
              : undefined
            if (addressId && !address)
              throw new Error(`Place Address ${addressId} did not materialise.`)
            const effectiveLng = resolution.lng ?? place.lng
            const effectiveLat = resolution.lat ?? place.lat
            const geometryOverridden =
              effectiveLng !== place.lng || effectiveLat !== place.lat
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
                ].filter(
                  (id): id is string => typeof id === 'string' && divisionIds.has(id),
                )
              : []
            const unitReference =
              address && resolution.tier !== 'supplementary'
                ? await matchAddress3d(
                    addressSnapshotId,
                    address,
                    place.addresses ?? [],
                  )
                : null
            const contentHash = await hashNormalisedPlace(place)
            const materialisationContentHash = geometryOverridden
              ? await createHash({ contentHash, effectiveLng, effectiveLat })
              : contentHash
            const result = {
              place,
              ...(geometryOverridden ? { effectiveLng, effectiveLat } : {}),
              addressSnapshotId: addressId ? addressSnapshotId : null,
              address2dId: addressId,
              address3dId: unitReference?.address3dId ?? null,
              address3dUnitId: unitReference?.address3dUnitId ?? null,
              address3dMembership: unitReference?.address3dMembership ?? null,
              divisionIds: [...new Set(referencedDivisionIds)],
              versionHash: await hashPlaceMaterialisation(place, {
                addressSnapshotId,
                divisionSnapshotId: snapshots.divisionSnapshotId,
                addressId,
                divisionIds: referencedDivisionIds,
                contentHash: materialisationContentHash,
                ...unitReference,
              }),
              sourcePayloadHash: await createHash(place.raw),
            }
            return result
          },
        )
        for (const place of enriched) {
          await output.writeFile(`${JSON.stringify(place)}\n`)
          addPlaceReleaseStats(stats, place)
        }
        processedPlaces += enriched.length
        onProgress?.(processedPlaces)
      }
      await validateBeforeCommit?.()
      await output.sync()
    } finally {
      await output.close()
    }
    await rename(tempPath, path)
    return { path, processedRows: processedPlaces, stats }
  }
  if (!sourcePath) return generate()
  return reuseEnrichedPlaces({
    path,
    db: currentDb,
    identity: sha256(
      JSON.stringify({
        contract: 'places-enrichment-v1',
        places: await deliveryFileSha256(sourcePath),
        resolutions: await deliveryFileSha256(supplementary.resolutionPath),
        snapshots,
        addresses: addresses.sort((a, b) => a.id.localeCompare(b.id)),
        divisions: [...divisionIds].sort(),
        supplementary: {
          snapshotId: supplementary.snapshotId,
          addresses: supplementary.addresses,
        },
      }),
    ),
    generate,
  })
}

async function* groupAsyncIterable<T>(values: AsyncIterable<T>, batchSize: number) {
  let batch: T[] = []
  for await (const value of values) {
    batch.push(value)
    if (batch.length < batchSize) continue
    yield batch
    batch = []
  }
  if (batch.length) yield batch
}

async function* zipPlacesAndResolutions(
  places: AsyncIterable<NormalisedPlace>,
  resolutions: AsyncIterable<StagedAddressResolution>,
) {
  const iterator = resolutions[Symbol.asyncIterator]()
  try {
    for await (const place of places) {
      const next = await iterator.next()
      if (next.done)
        throw new Error(`Missing Place Address resolution for ${place.id}.`)
      if (next.value.placeId !== place.id)
        throw new Error(
          `Place Address resolution order diverged at ${place.id}/${next.value.placeId}.`,
        )
      yield { place, resolution: next.value }
    }
    if (!(await iterator.next()).done)
      throw new Error('Place Address resolution stream has extra rows.')
  } finally {
    await iterator.return?.()
  }
}
