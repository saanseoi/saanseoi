import { datasetVariantForSource, type RegionCode } from '@repo/core'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotLookupDependency,
  recordSnapshotAssemblyRun,
  resolveShardForTypeRegionYear,
  resolvePublishedSnapshotForResourceTypeRegionCohortKey,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import {
  replaceReleaseProcessingActions,
  type ReleaseProcessingAction,
} from '@repo/core/pipeline/db/processingActions'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import { recordSnapshotVersionChanges } from '@repo/core/pipeline/db/snapshotVersionChanges'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import {
  createAsyncBufferFromR2,
  readParquetObjectsInBatches,
} from '@repo/core/pipeline/parquetR2'
import { chunkArray } from '@repo/core/pipeline/utils'
import {
  hashDivisionGeometryRow,
  hashDivisionGeometrySourceRow,
  normaliseDivisionAreaGeometryRow,
  normaliseDivisionBoundaryGeometryRow,
} from '@repo/core/pipeline/services/divisionGeometry'
import { toIsoTimestamp } from '@repo/db'
import { currentSchema, historySchema, metaSchema, sourceSchema } from '@repo/db'
import { and, eq } from 'drizzle-orm'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import type { UploadTarget } from '../cli/options.ts'
import { createHarbourControlClient } from '../api/harbourControl.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../localPipeline/syncStagedRelease.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import { LocalPipelineBucket } from '../addressSql/localBucket.ts'
import {
  resolveLocalAddressDbContext,
  type LocalDbCacheProgressEvent,
} from '../addressSql/localDbCache.ts'
import { LocalUploadProgress } from '../upload/localUploadProgress.ts'
import {
  appendPhaseDetails,
  colorRed,
  colorTeal,
  formatCompletedPhaseLabel,
  formatDurationMs,
  formatRunningPhaseLabel,
} from '../localPipeline/progressFormatting.ts'

type UploadResult = {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

type GeometryUploadPlan = {
  cohortKey: string
  regionCode: RegionCode
  releaseCode: string
  rowCount: number
  source:
    | 'overture'
    | 'hkgov-had'
    | 'hkgov-censtatd'
    | 'hkgov-pland-pu'
    | 'hkgov-pland-new-town'
  sourceVersion: string
  transform?: 'simplified'
  theme: 'divisions'
  type: 'divisionArea' | 'divisionBoundary'
}

type NormalisedGeometry = ReturnType<
  typeof normaliseDivisionAreaGeometryRow | typeof normaliseDivisionBoundaryGeometryRow
>

const LOCAL_RELEASE_ROOT = `${import.meta.dir}/../../../../../.local/harbour-sql/releases`

/**
 * Imports Overture division area/boundary parquet into the source, history and
 * current geometry tables. Geometry releases are complete snapshots: rows no
 * longer present are closed and the draft snapshot is rebuilt on retry.
 */
export async function processLocalDivisionGeometrySqlUpload(
  target: UploadTarget,
  previewPlan: GeometryUploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: {
    deferPublish?: boolean
    inputFilePath?: string
    skipRawSeed?: boolean
    skipSnapshotCleanup?: boolean
    validateGeometry?: boolean
  } = {},
) {
  const releaseId = requireString(uploadResult.releaseId, 'releaseId')
  const releaseCode = requireString(uploadResult.releaseCode, 'releaseCode')
  const datasetCode = requireString(uploadResult.datasetCode, 'datasetCode')
  const rawObjectKey = requireString(uploadResult.rawObjectKey, 'rawObjectKey')
  const shardYear = previewPlan.sourceVersion.slice(0, 4)
  const releaseRoot = `${LOCAL_RELEASE_ROOT}/${target.remote ? 'remote' : 'local'}/${releaseCode}`
  const progress = new LocalUploadProgress()
  const setupStartedAt = Date.now()
  progress.beginPhase(formatGeometryProgressLabel('Prepare', 'workspace'), {
    current: 0,
    max: null,
  })
  const bucket = new LocalPipelineBucket(releaseRoot)
  if (!options.skipRawSeed) {
    await bucket.seedRawObject(rawObjectKey, preparedUpload.filePath)
  }

  let dbContext: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>
  const dbCacheStartedAt = Date.now()

  try {
    dbContext = await resolveLocalAddressDbContext(
      target,
      previewPlan.regionCode,
      shardYear,
      {
        onProgress(event) {
          updateDbCacheProgress(progress, event)
        },
        cacheTableProfile: target.remote ? undefined : 'divisionGeometry',
        includePreviousShardYears: true,
        refreshRemoteTables: false,
      },
    )
  } catch (error) {
    progress.fail()
    throw error
  }

  if (progress.hasActivePhase()) {
    progress.complete(
      appendPhaseDetails(
        formatCompletedPhaseLabel(
          colorTeal(target.remote ? 'Clone cache' : 'Prepare'),
          colorRed(target.remote ? 'local copy' : 'local database'),
        ),
        [
          formatDurationMs(
            Date.now() - (target.remote ? dbCacheStartedAt : setupStartedAt),
          ),
        ],
      ),
    )
  }
  let controlClient: HarbourClient | null = null

  try {
    const releaseMetadataStartedAt = Date.now()
    progress.beginPhase(formatGeometryProgressLabel('Prepare', 'release metadata'), {
      current: 0,
      max: null,
    })
    await syncStagedReleaseIntoLocalMetaCache(
      dbContext.metaDb,
      { datasetCode, rawObjectKey, releaseCode, releaseId },
      previewPlan,
    )

    progress.complete(
      formatGeometryCompletedLabel(
        'Prepare',
        'release metadata',
        undefined,
        Date.now() - releaseMetadataStartedAt,
      ),
    )
    const processingStateStartedAt = Date.now()
    progress.beginPhase(formatGeometryProgressLabel('Prepare', 'processing state'), {
      current: 0,
      max: null,
    })
    const remoteClient = createHarbourControlClient(target) as HarbourClient
    const client = target.remote
      ? remoteClient
      : createLocalControlClient(
          dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb,
          { publishClient: remoteClient },
        )
    controlClient = client
    await client.stageRunning(
      releaseId,
      'processDataset',
      {
        resourceType: previewPlan.type,
        rowCount: previewPlan.rowCount,
      },
      releaseCode,
    )

    progress.complete(
      formatGeometryCompletedLabel(
        'Prepare',
        'processing state',
        undefined,
        Date.now() - processingStateStartedAt,
      ),
    )
    const snapshotStartedAt = Date.now()
    progress.beginPhase(formatGeometryProgressLabel('Assemble', 'snapshot'), {
      current: 0,
      max: null,
    })
    const metaDb = dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
    const dataset = await waitForDatasetRecord(metaDb, { releaseId })
    if (!dataset) {
      throw new Error(`Release not found: ${releaseId}`)
    }
    const snapshot = await ensureDraftSnapshotForRelease(metaDb, previewPlan.type, {
      cohortKey: previewPlan.cohortKey,
      datasetCode,
      datasetId: dataset.datasetId,
      regionCode: previewPlan.regionCode,
      sourceReleaseId: dataset.releaseId,
      variant: geometryVariant(previewPlan),
    })
    await upsertSnapshotSource(
      metaDb,
      snapshot.id,
      dataset.datasetId,
      dataset.releaseId,
      'primary',
      {
        anchorReleaseId: dataset.releaseId,
        selectedByRule: 'snapshot-assembly-division-geometry-v1',
        selectionMode: 'exact_ref',
        sourceCohortKey: dataset.cohortKey,
      },
    )
    await recordSnapshotAssemblyRun(metaDb, {
      snapshotId: snapshot.id,
      resourceType: previewPlan.type,
      anchorReleaseId: dataset.releaseId,
      anchorCohortKey: dataset.cohortKey,
      selectionSummaryJson: {
        releaseRole: 'primary',
        sourceReleaseId: dataset.releaseId,
        sourceVersion: dataset.sourceVersion,
      },
    })
    const historyShard = await resolveShardForTypeRegionYear(
      metaDb,
      'history',
      target.remote ? 'production' : 'preview',
      previewPlan.regionCode,
      shardYear,
    )
    if (historyShard) {
      await upsertReleaseShardAssignment(metaDb, dataset.releaseId, historyShard.id)
      await upsertSnapshotShardAssignment(metaDb, snapshot.id, historyShard.id)
    }

    progress.complete(
      formatGeometryCompletedLabel(
        'Assemble',
        'snapshot',
        undefined,
        Date.now() - snapshotStartedAt,
      ),
    )
    const normalisationStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel(
        'Normalise',
        `${previewPlan.type} records`,
        0,
        previewPlan.rowCount,
      ),
      { current: 0, max: previewPlan.rowCount },
    )

    const file = options.inputFilePath
      ? await asyncBufferFromFile(options.inputFilePath)
      : await createAsyncBufferFromR2(bucket, rawObjectKey)
    const normalised: Array<NonNullable<NormalisedGeometry>> = []
    const cnGdExcludedRecords: Array<{
      divisionId: string | null
      divisionIds: string[] | null
      id: string | null
    }> = []
    let rejectedRows = 0
    let processedRows = 0
    const providerBridgeConfig = resolveProviderBridgeConfig(previewPlan.source)
    const providerBridge =
      providerBridgeConfig !== null
        ? new Map(
            (
              await metaDb
                .select({
                  externalId: metaSchema.metaIdentifierBridges.externalId,
                  canonicalId: metaSchema.metaIdentifierBridges.canonicalId,
                })
                .from(metaSchema.metaIdentifierBridges)
                .where(
                  and(
                    eq(metaSchema.metaIdentifierBridges.resourceType, 'division'),
                    eq(
                      metaSchema.metaIdentifierBridges.cohortKey,
                      previewPlan.cohortKey,
                    ),
                    eq(metaSchema.metaIdentifierBridges.domain, 'administrative'),
                    eq(
                      metaSchema.metaIdentifierBridges.authority,
                      providerBridgeConfig.authority,
                    ),
                  ),
                )
                .all()
            ).map(row => [row.externalId, row.canonicalId]),
          )
        : null
    for await (const batch of readParquetObjectsInBatches(file, 8192)) {
      for (const row of batch) {
        try {
          const sourceRow =
            previewPlan.source === 'hkgov-had'
              ? normaliseHkgovHadInputRow(row, providerBridge)
              : previewPlan.source === 'hkgov-censtatd'
                ? normaliseHkgovCenstatdInputRow(row, providerBridge)
                : previewPlan.source === 'hkgov-pland-new-town'
                  ? normaliseHkgovPlandNewTownInputRow(row)
                  : row
          if (previewPlan.source === 'overture' && row.region === 'CN-GD') {
            cnGdExcludedRecords.push({
              divisionId: asOptionalString(row.division_id),
              divisionIds: Array.isArray(row.division_ids)
                ? row.division_ids.map(asOptionalString).filter(isString)
                : null,
              id: asOptionalString(row.id),
            })
            continue
          }
          const value =
            previewPlan.type === 'divisionArea'
              ? normaliseDivisionAreaGeometryRow(sourceRow, previewPlan.source, {
                  validateGeometry: options.validateGeometry,
                  variant: geometryVariant(previewPlan),
                })
              : normaliseDivisionBoundaryGeometryRow(sourceRow, previewPlan.source, {
                  validateGeometry: options.validateGeometry,
                  variant: geometryVariant(previewPlan),
                })
          if (value) normalised.push(value as NonNullable<NormalisedGeometry>)
        } catch (error) {
          rejectedRows += 1
          throw error
        }
      }
      processedRows += batch.length
      progress.update(processedRows, {
        label: formatGeometryProgressLabel(
          'Normalise',
          `${previewPlan.type} records`,
          processedRows,
          previewPlan.rowCount,
        ),
      })
    }

    progress.complete(
      formatGeometryCompletedLabel(
        'Normalise',
        `${previewPlan.type} records`,
        normalised.length,
        Date.now() - normalisationStartedAt,
      ),
    )
    const validationStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel('Validate', 'division references'),
      {
        current: 0,
        max: null,
      },
    )
    const divisionLookupSnapshotId = !resolveProviderBridgeConfig(previewPlan.source)
      ? await assertDivisionReferences(
          dbContext.currentDb,
          dbContext.historyDb,
          metaDb,
          previewPlan.regionCode,
          previewPlan.cohortKey,
          previewPlan.type,
          normalised,
        )
      : null
    if (divisionLookupSnapshotId) {
      await recordSnapshotLookupDependency(metaDb, {
        anchorReleaseId: dataset.releaseId,
        lookupSnapshotId: divisionLookupSnapshotId,
        selectedByRule: 'api-composition:divisions:division-geometry->division',
        selectionMode: 'exact_ref',
        snapshotId: snapshot.id,
      })
    }

    progress.complete(
      formatGeometryCompletedLabel(
        'Validate',
        'division references',
        undefined,
        Date.now() - validationStartedAt,
      ),
    )
    const writeStartedAt = Date.now()
    progress.beginPhase(
      formatGeometryProgressLabel('Write', `${previewPlan.type} rows`),
      {
        current: 0,
        max: null,
      },
    )
    const churn = await writeGeometryRows(
      dbContext,
      previewPlan.type,
      normalised,
      {
        source: previewPlan.source,
        variant: geometryVariant(previewPlan),
        releaseId,
        releaseCode,
        snapshotId: snapshot.id,
        parentSnapshotId: snapshot.parentSnapshotId,
        cohortKey: previewPlan.cohortKey,
        transform: previewPlan.transform,
      },
      label => progress.message(formatGeometryProgressLabel('Write', label)),
    )

    progress.complete(
      formatGeometryCompletedLabel(
        'Write',
        `${previewPlan.type} rows`,
        normalised.length,
        Date.now() - writeStartedAt,
      ),
    )
    const statsStartedAt = Date.now()
    progress.beginPhase(formatGeometryProgressLabel('Finalise', 'dataset statistics'), {
      current: 0,
      max: null,
    })
    await replaceDatasetStats(
      metaDb,
      releaseId,
      await buildGeometryStats(
        dbContext.currentDb,
        metaDb,
        previewPlan,
        normalised,
        churn,
      ),
    )
    await replaceReleaseProcessingActions(
      metaDb,
      releaseId,
      buildOvertureGeometryProcessingActions(previewPlan, cnGdExcludedRecords),
    )
    progress.complete(
      formatGeometryCompletedLabel(
        'Finalise',
        'dataset statistics',
        undefined,
        Date.now() - statsStartedAt,
      ),
    )
    if (options.deferPublish) {
      return {
        snapshotId: snapshot.id,
        importedRows: normalised.length,
        publishResult: undefined,
      }
    }
    const publishStartedAt = Date.now()
    progress.beginPhase(formatGeometryProgressLabel('Publish', 'dataset'), {
      current: 0,
      max: null,
    })
    await client.stageCompleted(
      releaseId,
      'processDataset',
      {
        resourceType: previewPlan.type,
        sourceRows: previewPlan.rowCount,
        importedRows: normalised.length,
        rejectedRows,
      },
      releaseCode,
    )
    const publishResult = await client.publishDataset(releaseId, releaseCode, {
      skipSnapshotCleanup: options.skipSnapshotCleanup,
    })
    progress.complete(
      formatGeometryCompletedLabel(
        'Publish',
        'dataset',
        undefined,
        Date.now() - publishStartedAt,
      ),
    )
    return {
      snapshotId: snapshot.id,
      importedRows: normalised.length,
      publishResult,
    }
  } catch (error) {
    progress.fail()
    const failureClient =
      controlClient ?? (createHarbourControlClient(target) as HarbourClient)
    await failureClient
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
  }
}

function normaliseHkgovHadInputRow(
  row: Record<string, unknown>,
  bridge: Map<string, string> | null,
) {
  const areaId = typeof row.area_id === 'string' ? row.area_id.trim() : ''
  const divisionId = areaId ? bridge?.get(areaId) : undefined
  if (!areaId || !divisionId) {
    throw new Error(
      `HAD district area ${areaId || '<unknown>'} has no reviewed administrative identifier bridge.`,
    )
  }
  const sources = normaliseJsonArray(row.sources)
  return {
    ...row,
    id: typeof row.id === 'string' && row.id.trim() ? row.id : `HAD:${areaId}`,
    division_id: divisionId,
    sources: sources?.length ? sources : [{ dataset: 'hkgov-had', areaId }],
  }
}

function normaliseHkgovCenstatdInputRow(
  row: Record<string, unknown>,
  bridge: Map<string, string> | null,
) {
  const districtClass =
    typeof row.district_class === 'string' ? row.district_class.trim() : ''
  const divisionId = districtClass ? bridge?.get(districtClass) : undefined
  if (!districtClass || !divisionId) {
    throw new Error(
      `C&SD district area ${districtClass || '<unknown>'} has no reviewed administrative identifier bridge.`,
    )
  }
  const sources = normaliseJsonArray(row.sources)
  return {
    ...row,
    id:
      typeof row.id === 'string' && row.id.trim()
        ? row.id
        : `CENSTATD:${districtClass}`,
    division_id: divisionId,
    sources: sources?.length ? sources : [{ dataset: 'hkgov-censtatd', districtClass }],
  }
}

function geometryVariant(plan: GeometryUploadPlan) {
  return datasetVariantForSource('divisionArea', plan.source, {
    cohortKey: plan.cohortKey,
    sourceVersion: plan.sourceVersion,
    transform: plan.transform,
  })
}

function resolveProviderBridgeConfig(source: GeometryUploadPlan['source']) {
  if (source === 'hkgov-had') {
    return { authority: 'hkgov-had' }
  }
  if (source === 'hkgov-censtatd') {
    return { authority: 'hkgov-censtatd' }
  }
  return null
}

function normaliseHkgovPlandNewTownInputRow(row: Record<string, unknown>) {
  const newTownId = typeof row.newtown_id === 'string' ? row.newtown_id.trim() : ''
  const divisionId = typeof row.division_id === 'string' ? row.division_id.trim() : ''
  if (!newTownId || !divisionId) {
    throw new Error(
      `Planning Department New Town ${newTownId || '<unknown>'} has no cohort-scoped planning division ID.`,
    )
  }
  const sources = normaliseJsonArray(row.sources)
  return {
    ...row,
    id:
      typeof row.id === 'string' && row.id.trim()
        ? row.id
        : `PLAND:NEWTOWN:${divisionId}`,
    division_id: divisionId,
    sources: sources?.length
      ? sources
      : [{ dataset: 'hkgov-pland-new-town', newTownId }],
  }
}

function normaliseJsonArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value
  if (typeof value !== 'string') return null

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

async function assertDivisionReferences(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  historyDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  metaDb: HarbourReadableDb,
  regionCode: RegionCode,
  cohortKey: string,
  type: GeometryUploadPlan['type'],
  rows: Array<NonNullable<NormalisedGeometry>>,
) {
  const divisionSnapshot = await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
    metaDb,
    'division',
    regionCode,
    cohortKey,
  )
  if (!divisionSnapshot) {
    throw new Error(
      `No published division snapshot exists for ${regionCode}/${cohortKey}; geometry references cannot be validated.`,
    )
  }
  let divisionRows = await listCurrentDivisionIds(currentDb, divisionSnapshot.id)
  if (divisionRows.length === 0) {
    await restoreDivisionSnapshotFromHistory(
      currentDb as unknown as HarbourWritableDb,
      historyDb,
      divisionSnapshot.id,
    )
    divisionRows = await listCurrentDivisionIds(currentDb, divisionSnapshot.id)
  }
  const knownIds = new Set(divisionRows.map(row => row.id))
  const missingReferences = rows.flatMap(row => {
    const missingIds = divisionReferenceIds(type, row).filter(id => !knownIds.has(id))
    return missingIds.length > 0
      ? [
          {
            missingIds: [...new Set(missingIds)],
            record: row.source.rawProperties,
          },
        ]
      : []
  })
  const missingIds = [
    ...new Set(missingReferences.flatMap(reference => reference.missingIds)),
  ]
  if (missingIds.length > 0) {
    throw new Error(
      [
        `Division geometry references ${missingIds.length} division IDs absent from the ${cohortKey} division snapshot.`,
        ...formatMissingDivisionReferenceRecords(missingReferences),
      ].join('\n'),
    )
  }

  return divisionSnapshot.id
}

async function listCurrentDivisionIds(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  snapshotId: string,
) {
  return currentDb
    .select({ id: currentSchema.divisions.id })
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.snapshotId, snapshotId))
    .all()
}

// A division release may publish before its required geometry companion. If the
// asynchronous cleanup removes that incomplete snapshot in the meantime, rebuild
// its current projection from the immutable history snapshot before validation.
async function restoreDivisionSnapshotFromHistory(
  currentDb: HarbourWritableDb,
  historyDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['historyDb'],
  snapshotId: string,
) {
  const [divisionRows, i18nRows] = await Promise.all([
    historyDb
      .select({
        bbox: historySchema.divisions.bbox,
        cartography: historySchema.divisions.cartography,
        geometry: historySchema.divisions.geometry,
        hierarchy: historySchema.divisions.hierarchy,
        id: historySchema.divisions.id,
        identifiers: historySchema.divisions.identifiers,
        level: historySchema.divisions.level,
        sourceKeys: historySchema.divisions.sourceKeys,
        sources: historySchema.divisions.sources,
        type: historySchema.divisions.type,
        wikidata: historySchema.divisions.wikidata,
      })
      .from(historySchema.divisions)
      .where(eq(historySchema.divisions.snapshotId, snapshotId))
      .all(),
    historyDb
      .select({
        divisionId: historySchema.divisionsI18n.divisionId,
        isLocaleInferred: historySchema.divisionsI18n.isLocaleInferred,
        locale: historySchema.divisionsI18n.locale,
        name: historySchema.divisionsI18n.name,
        nameAlts: historySchema.divisionsI18n.nameAlts,
        nameRules: historySchema.divisionsI18n.nameRules,
        nameVariant: historySchema.divisionsI18n.nameVariant,
      })
      .from(historySchema.divisionsI18n)
      .where(eq(historySchema.divisionsI18n.snapshotId, snapshotId))
      .all(),
  ])

  if (divisionRows.length === 0) return

  const now = toIsoTimestamp()
  for (const chunk of chunkArray(divisionRows, 8)) {
    await currentDb
      .insert(currentSchema.divisions)
      .values(
        chunk.map(row => ({
          ...row,
          createdAt: now,
          snapshotId,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing()
      .run()
  }
  for (const chunk of chunkArray(i18nRows, 8)) {
    await currentDb
      .insert(currentSchema.divisionsI18n)
      .values(
        chunk.map(row => ({
          ...row,
          createdAt: now,
          snapshotId,
          updatedAt: now,
        })),
      )
      .onConflictDoNothing()
      .run()
  }
}

function divisionReferenceIds(
  type: GeometryUploadPlan['type'],
  row: NonNullable<NormalisedGeometry>,
) {
  const canonical = row.canonical as {
    divisionId?: string
    leftDivisionId?: string
    rightDivisionId?: string
  }
  return type === 'divisionArea'
    ? canonical.divisionId
      ? [canonical.divisionId]
      : []
    : [canonical.leftDivisionId, canonical.rightDivisionId].filter((id): id is string =>
        Boolean(id),
      )
}

export function formatMissingDivisionReferenceRecords(
  references: Array<{ missingIds: string[]; record: unknown }>,
) {
  const examples = references.slice(0, 3)
  const label = examples.length === 1 ? 'Affected record:' : 'Affected records:'
  const records = examples.map((reference, index) =>
    [
      examples.length > 1
        ? `Record ${index + 1} (missing division IDs: ${reference.missingIds.join(', ')}):`
        : `Missing division IDs: ${reference.missingIds.join(', ')}`,
      formatDiagnosticRecord(reference.record),
    ].join('\n'),
  )
  const remaining = references.length - examples.length

  return [
    '',
    label,
    ...records,
    ...(remaining > 0
      ? [`... and ${remaining} more affected record${remaining === 1 ? '' : 's'}.`]
      : []),
  ]
}

function bigintJsonReplacer(_key: string, value: unknown) {
  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (Array.isArray(value) && value.length > 3) {
    return [...value.slice(0, 3), `... ${value.length - 3} more`]
  }

  return value
}

function formatDiagnosticRecord(record: unknown) {
  return JSON.stringify(record, bigintJsonReplacer, 2)
}

async function writeGeometryRows(
  context: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>,
  type: GeometryUploadPlan['type'],
  rows: Array<NonNullable<NormalisedGeometry>>,
  version: {
    source: GeometryUploadPlan['source']
    variant: string
    releaseId: string
    releaseCode: string
    snapshotId: string
    parentSnapshotId: string | null
    cohortKey: string
    transform?: GeometryUploadPlan['transform']
  },
  onProgress?: (label: string) => void,
) {
  const now = toIsoTimestamp()
  const currentTable =
    type === 'divisionArea'
      ? currentSchema.divisionAreas
      : currentSchema.divisionBoundaries
  const historyTable =
    type === 'divisionArea'
      ? historySchema.divisionAreas
      : historySchema.divisionBoundaries
  const sourceTable =
    type === 'divisionArea'
      ? version.source === 'hkgov-had'
        ? sourceSchema.sourceHkgovHadDivisionAreas
        : version.source === 'hkgov-censtatd'
          ? sourceSchema.sourceHkgovCenstatdDivisionAreas
          : version.source === 'hkgov-pland-pu'
            ? sourceSchema.sourceHkgovPlandDivisionAreas
            : version.source === 'hkgov-pland-new-town'
              ? sourceSchema.sourceHkgovPlandNewTownDivisionAreas
              : sourceSchema.sourceOvertureDivisionAreas
      : sourceSchema.sourceOvertureDivisionBoundaries
  const isCenstatdDerivative =
    version.source === 'hkgov-censtatd' && version.transform === 'simplified'

  onProgress?.('clear current rows')
  await context.currentDb
    .delete(currentTable)
    // The current-table key is `(snapshotId, id)`, not `(snapshotId, variant, id)`.
    // A snapshot therefore represents exactly one geometry variant. Clear the full
    // snapshot so a retry also replaces rows written before a variant was renamed
    // (for example the legacy `hkgov-censtatd` C&SD variant).
    .where(eq(currentTable.snapshotId, version.snapshotId))
    .run()
  const historyHashes = new Map<string, string>()
  const sourceHashes = new Map<string, string>()
  onProgress?.('hash geometry rows')
  for (const row of rows) {
    historyHashes.set(row.canonical.id, await hashDivisionGeometryRow(row.canonical))
    if (!isCenstatdDerivative) {
      sourceHashes.set(
        row.source.sourceRecordId,
        await hashDivisionGeometrySourceRow(row.source),
      )
    }
  }
  // Churn is a property of the snapshot lineage, not of the mutable history
  // cache. In particular, independent C&SD census cohorts have no parent and
  // must therefore start with an empty baseline rather than compare against
  // whichever geometry snapshot was most recently written.
  const previousById = await getGeometryChurnBaseline(
    context.currentDb,
    type,
    version.parentSnapshotId,
  )
  const churn = createGeometryChurnCounts(rows, historyHashes, previousById)
  onProgress?.('close history rows')
  const closedHistoryRows = await closeChangedRows(
    context.historyDb,
    historyTable,
    historyTable.id,
    historyHashes,
    {
      isCurrent: false,
    },
  )
  await recordSnapshotVersionChanges(
    context.historyDb as unknown as HarbourWritableDb,
    {
      snapshotId: version.snapshotId,
      sourceReleaseId: version.releaseId,
      recordType: type,
      operation: 'delete',
      changes: closedHistoryRows.map(row => ({ recordId: row.id })),
    },
  )
  onProgress?.('close source rows')
  if (!isCenstatdDerivative) {
    await closeChangedRows(
      context.sourceDb,
      sourceTable,
      sourceTable.sourceRecordId,
      sourceHashes,
      { isCurrent: false, validToRelease: version.releaseCode },
    )
  }
  if (version.source === 'hkgov-pland-new-town') {
    await closeNewTownSourceI18nRows(
      context.sourceDb as unknown as HarbourReadableDb & HarbourWritableDb,
      sourceHashes,
      version.releaseCode,
    )
  }
  onProgress?.('build write batches')
  const currentRows = rows.map(row => ({
    ...row.canonical,
    snapshotId: version.snapshotId,
    createdAt: now,
    updatedAt: now,
  }))
  const historyRows = await Promise.all(
    rows.map(async row => ({
      ...row.canonical,
      versionHash: await hashDivisionGeometryRow(row.canonical),
      sourceReleaseId: version.releaseId,
      snapshotId: version.snapshotId,
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    })),
  )
  const sourceRows = isCenstatdDerivative
    ? []
    : await Promise.all(
        rows.map(async row => {
          const { sourceGeometry, ...sourceWithProvenance } = row.source
          const sourceAssertion = sourceWithProvenance
          const sourceProperties = row.source.rawProperties as Record<string, unknown>
          return {
            ...sourceAssertion,
            ...(version.source === 'hkgov-had'
              ? {
                  objectId: asOptionalInteger(sourceProperties.OBJECTID),
                  cdsiAdminAreaId: asOptionalInteger(
                    sourceProperties.CSDI_ADMIN_AREA_ID,
                  ),
                  areaType: asOptionalString(sourceProperties.AREA_TYPE),
                  areaId: asOptionalString(sourceProperties.AREA_ID),
                  areaCode: asOptionalString(sourceProperties.AREA_CODE),
                  sourceGeometry,
                }
              : version.source === 'hkgov-censtatd'
                ? {
                    censusYear: version.cohortKey,
                    districtClass: requireString(
                      sourceProperties.dc_class,
                      'C&SD dc_class',
                    ),
                    districtCode: requireInteger(sourceProperties.dc, 'C&SD dc'),
                    districtEn: requireString(sourceProperties.dc_eng, 'C&SD dc_eng'),
                    districtZhHant: requireString(
                      sourceProperties.dc_chi,
                      'C&SD dc_chi',
                    ),
                    sourceGeometry,
                  }
                : version.source === 'hkgov-pland-pu'
                  ? {
                      divisionId: requirePlanningDivisionId(row),
                      planningLevel: sourceProperties.planning_level,
                      sourceCellIds: sourceProperties.source_cell_ids,
                      repairedSourceFeatureIds:
                        sourceProperties.repaired_source_feature_ids,
                    }
                  : version.source === 'hkgov-pland-new-town'
                    ? {
                        divisionId: requirePlanningDivisionId(row),
                        newTownId: sourceProperties.newtown_id,
                        // The source assertion retains the original and repaired
                        // forms separately; canonical geometry is materialised in
                        // history and current only.
                        canonicalGeometry: row.canonical.geometry,
                        wasGeometryRepaired: Boolean(
                          sourceProperties.was_geometry_repaired,
                        ),
                      }
                    : {}),
            versionHash: await hashDivisionGeometrySourceRow(row.source),
            releaseId: version.releaseId,
            validFromRelease: version.releaseCode,
            validToRelease: null,
            isCurrent: true,
            createdAt: now,
            updatedAt: now,
          }
        }),
      )

  onProgress?.('write current rows')
  for (const chunk of chunkRows(currentRows)) {
    await context.currentDb
      .insert(currentTable)
      .values(chunk as never)
      .run()
  }
  if (historyRows.length) {
    onProgress?.('write history rows')
    for (const chunk of chunkRows(historyRows)) {
      await context.historyDb
        .insert(historyTable)
        .values(chunk as never)
        .onConflictDoUpdate({
          target: [historyTable.id, historyTable.versionHash],
          set: {
            sourceReleaseId: version.releaseId,
            snapshotId: version.snapshotId,
            isCurrent: true,
            updatedAt: now,
          },
        })
        .run()
    }
    await recordSnapshotVersionChanges(
      context.historyDb as unknown as HarbourWritableDb,
      {
        snapshotId: version.snapshotId,
        sourceReleaseId: version.releaseId,
        recordType: type,
        operation: 'upsert',
        changes: historyRows.map(row => ({
          recordId: row.id,
          versionHash: row.versionHash,
        })),
      },
    )
  }
  if (sourceRows.length) {
    onProgress?.('write source rows')
    for (const chunk of chunkRows(sourceRows)) {
      await context.sourceDb
        .insert(sourceTable)
        .values(chunk as never)
        .onConflictDoUpdate({
          target: [sourceTable.sourceRecordId, sourceTable.versionHash],
          set: {
            releaseId: version.releaseId,
            validFromRelease: version.releaseCode,
            validToRelease: null,
            isCurrent: true,
            updatedAt: now,
          },
        })
        .run()
    }
  }
  if (version.source === 'hkgov-pland-new-town') {
    await writeNewTownSourceI18nRows(
      context.sourceDb as unknown as HarbourWritableDb,
      rows,
      sourceHashes,
      version,
      now,
    )
  }
  if (isCenstatdDerivative) {
    await writeCenstatdSourceDerivatives(
      context.sourceDb as unknown as HarbourReadableDb & HarbourWritableDb,
      rows,
      version,
      now,
    )
  }

  return churn
}

function requirePlanningDivisionId(row: NonNullable<NormalisedGeometry>) {
  const divisionId =
    'divisionId' in row.canonical ? row.canonical.divisionId : undefined
  if (!divisionId) {
    throw new Error(
      'Planning Department division area requires a canonical division ID.',
    )
  }
  return divisionId
}

function readNewTownName(
  row: NonNullable<NormalisedGeometry>,
  locale: 'en' | 'zh-hant' | 'zh-hans',
) {
  const i18n = (row.source.rawProperties as Record<string, unknown>)?.i18n
  if (!Array.isArray(i18n)) return null
  const entry = i18n.find(
    item =>
      item &&
      typeof item === 'object' &&
      (item as Record<string, unknown>).locale === locale,
  ) as Record<string, unknown> | undefined
  return typeof entry?.name === 'string' ? entry.name : null
}

async function closeNewTownSourceI18nRows(
  db: HarbourReadableDb & HarbourWritableDb,
  sourceHashes: Map<string, string>,
  releaseCode: string,
) {
  const table = sourceSchema.sourceHkgovPlandNewTownDivisionAreaI18n
  const existing = await db
    .select({
      sourceRecordId: table.sourceRecordId,
      versionHash: table.versionHash,
    })
    .from(table)
    .where(eq(table.isCurrent, true))
    .all()
  for (const row of existing) {
    if (sourceHashes.get(row.sourceRecordId) === row.versionHash) continue
    await db
      .update(table)
      .set({ isCurrent: false, validToRelease: releaseCode })
      .where(
        and(
          eq(table.sourceRecordId, row.sourceRecordId),
          eq(table.versionHash, row.versionHash),
          eq(table.isCurrent, true),
        ),
      )
      .run()
  }
}

async function writeCenstatdSourceDerivatives(
  db: HarbourReadableDb & HarbourWritableDb,
  rows: Array<NonNullable<NormalisedGeometry>>,
  version: {
    cohortKey: string
    releaseId: string
    releaseCode: string
    transform?: 'simplified'
  },
  now: string,
) {
  const transform = version.transform
  if (!transform) {
    throw new Error('C&SD derivative write requires a named transform.')
  }

  const sources = sourceSchema.sourceHkgovCenstatdDivisionAreas
  const derivatives = sourceSchema.sourceHkgovCenstatdDivisionAreaDerivatives
  const exactRows = await db
    .select({
      censusYear: sources.censusYear,
      sourceRecordId: sources.sourceRecordId,
      versionHash: sources.versionHash,
    })
    .from(sources)
    .where(eq(sources.isCurrent, true))
    .all()
  const exactHashByRecordAndCohort = new Map(
    exactRows.map(row => [`${row.sourceRecordId}:${row.censusYear}`, row.versionHash]),
  )
  const nextHashes = new Map<string, string>()
  const derivativeRows = await Promise.all(
    rows.map(async row => {
      const censusYear = version.cohortKey
      const inputVersionHash = exactHashByRecordAndCohort.get(
        `${row.source.sourceRecordId}:${censusYear}`,
      )
      if (!inputVersionHash) {
        throw new Error(
          `C&SD derivative ${row.source.sourceRecordId} (${censusYear}) requires its exact source assertion to be ingested first.`,
        )
      }
      const derivation = row.source.derivation
      if (!derivation) {
        throw new Error(
          `C&SD derivative ${row.source.sourceRecordId} has no derivation metadata.`,
        )
      }
      const versionHash = await hashDivisionGeometryRow(row.canonical)
      nextHashes.set(`${row.source.sourceRecordId}:${inputVersionHash}`, versionHash)
      return {
        sourceRecordId: row.source.sourceRecordId,
        inputVersionHash,
        transform,
        derivation,
        geometry: row.canonical.geometry,
        bbox: row.canonical.bbox,
        versionHash,
        releaseId: version.releaseId,
        validFromRelease: version.releaseCode,
        validToRelease: null,
        isCurrent: true,
        createdAt: now,
        updatedAt: now,
      }
    }),
  )

  const currentDerivatives = await db
    .select({
      inputVersionHash: derivatives.inputVersionHash,
      sourceRecordId: derivatives.sourceRecordId,
      versionHash: derivatives.versionHash,
    })
    .from(derivatives)
    .where(and(eq(derivatives.isCurrent, true), eq(derivatives.transform, transform)))
    .all()
  for (const derivative of currentDerivatives) {
    const key = `${derivative.sourceRecordId}:${derivative.inputVersionHash}`
    // This upload covers one census cohort. Other cohorts may use the same
    // C&SD district record IDs, so only supersede a derivative of an exact
    // assertion represented in this upload.
    if (!nextHashes.has(key)) continue
    if (nextHashes.get(key) === derivative.versionHash) continue
    await db
      .update(derivatives)
      .set({ isCurrent: false, validToRelease: version.releaseCode })
      .where(
        and(
          eq(derivatives.sourceRecordId, derivative.sourceRecordId),
          eq(derivatives.inputVersionHash, derivative.inputVersionHash),
          eq(derivatives.transform, transform),
          eq(derivatives.versionHash, derivative.versionHash),
          eq(derivatives.isCurrent, true),
        ),
      )
      .run()
  }
  for (const chunk of chunkRows(derivativeRows)) {
    await db
      .insert(derivatives)
      .values(chunk)
      .onConflictDoUpdate({
        target: [
          derivatives.sourceRecordId,
          derivatives.inputVersionHash,
          derivatives.transform,
          derivatives.versionHash,
        ],
        set: {
          releaseId: version.releaseId,
          validFromRelease: version.releaseCode,
          validToRelease: null,
          isCurrent: true,
          updatedAt: now,
        },
      })
      .run()
  }
}

async function writeNewTownSourceI18nRows(
  db: HarbourWritableDb,
  rows: Array<NonNullable<NormalisedGeometry>>,
  sourceHashes: Map<string, string>,
  version: {
    releaseId: string
    releaseCode: string
  },
  now: string,
) {
  const table = sourceSchema.sourceHkgovPlandNewTownDivisionAreaI18n
  const i18nRows = rows.flatMap(row => {
    const versionHash = sourceHashes.get(row.source.sourceRecordId)
    if (!versionHash) {
      throw new Error(
        `Planning Department New Town ${row.source.sourceRecordId} has no source version hash.`,
      )
    }
    return (['en', 'zh-hant', 'zh-hans'] as const).map(locale => {
      const name = readNewTownName(row, locale)
      if (!name) {
        throw new Error(
          `Planning Department New Town ${row.source.sourceRecordId} has no ${locale} source name.`,
        )
      }
      return {
        sourceRecordId: row.source.sourceRecordId,
        locale,
        name,
        isLocaleInferred: false,
        versionHash,
        releaseId: version.releaseId,
        validFromRelease: version.releaseCode,
        validToRelease: null,
        isCurrent: true,
        createdAt: now,
        updatedAt: now,
      }
    })
  })
  for (const chunk of chunkRows(i18nRows)) {
    await db
      .insert(table)
      .values(chunk)
      .onConflictDoUpdate({
        target: [table.sourceRecordId, table.versionHash, table.locale],
        set: {
          releaseId: version.releaseId,
          validFromRelease: version.releaseCode,
          validToRelease: null,
          isCurrent: true,
          updatedAt: now,
        },
      })
      .run()
  }
}

function updateDbCacheProgress(
  progress: LocalUploadProgress,
  event: LocalDbCacheProgressEvent,
) {
  if (event.target !== 'preview' && event.target !== 'production') {
    return
  }

  const current = Math.min(event.current, event.total)
  const label = formatGeometryProgressLabel(
    'Clone cache',
    describeDbCacheSubject(event),
    current,
    event.total,
  )

  if (!progress.hasActivePhase()) {
    progress.beginPhase(label, { current, max: event.total })
  } else {
    progress.update(current, { label, max: event.total })
  }
}

function formatGeometryProgressLabel(
  action: string,
  subject: string,
  current?: number,
  total?: number,
) {
  return formatRunningPhaseLabel(colorTeal(action), colorRed(subject), current, total)
}

function formatGeometryCompletedLabel(
  action: string,
  subject: string,
  count?: number,
  durationMs?: number,
) {
  return appendPhaseDetails(
    formatCompletedPhaseLabel(colorTeal(action), colorRed(subject), count),
    [formatDurationMs(durationMs ?? Number.NaN)],
  )
}

function describeDbCacheSubject(event: LocalDbCacheProgressEvent) {
  const tableName = event.tableName
    ? event.filter
      ? `${event.tableName}:${event.filter}`
      : event.tableName
    : null

  switch (event.action) {
    case 'check-cache':
      return `${event.target}.manifest`
    case 'export-binding':
      return tableName
        ? `${event.bindingName}.${tableName}`
        : `${event.bindingName}.export`
    case 'reuse-cache':
      return `${event.target}.reuse`
    case 'mirror-table':
      return tableName ? `${event.bindingName}.${tableName}` : event.bindingName
    case 'copy-binding':
      return `${event.bindingName}.sqlite`
    case 'validate-binding':
      return `${event.bindingName}.validate`
  }
}

function chunkRows<T>(rows: T[], size = 32) {
  const chunks: T[][] = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }
  return chunks
}

async function closeChangedRows(
  db: any,
  table: any,
  idColumn: any,
  currentHashes: Map<string, string>,
  values: Record<string, unknown>,
) {
  const existing = await db
    .select({ id: idColumn, versionHash: table.versionHash })
    .from(table)
    .where(eq(table.isCurrent, true))
    .all()
  const closedRows = []
  for (const row of existing) {
    if (currentHashes.get(row.id) === row.versionHash) continue
    await db.update(table).set(values).where(eq(idColumn, row.id)).run()
    closedRows.push(row)
  }
  return closedRows
}

function geometryStatRow(
  type: GeometryUploadPlan['type'],
  dimension: string,
  metric: string,
  value: number,
  groupBy: string | null = null,
  groupValue: string | null = null,
) {
  return {
    type,
    dimension,
    metric,
    metricUnit: 'count',
    value,
    groupBy,
    groupValue,
  }
}

type GeometryChurnCounts = {
  added: number
  byType: Map<string, GeometryChurnCounts>
  changed: number
  count: number
  removed: number
  unchanged: number
}

function createEmptyGeometryChurnCounts(): GeometryChurnCounts {
  return { added: 0, byType: new Map(), changed: 0, count: 0, removed: 0, unchanged: 0 }
}

function churnCountsForType(churn: GeometryChurnCounts, type: string) {
  const existing = churn.byType.get(type)
  if (existing) return existing
  const counts = createEmptyGeometryChurnCounts()
  churn.byType.set(type, counts)
  return counts
}

export function createGeometryChurnCounts(
  rows: Array<NonNullable<NormalisedGeometry>>,
  hashes: Map<string, string>,
  previousById: Map<string, { id: string; type: string; versionHash: string }>,
) {
  const churn = createEmptyGeometryChurnCounts()

  for (const row of rows) {
    const previous = previousById.get(row.canonical.id)
    const typeCounts = churnCountsForType(churn, row.canonical.type)
    churn.count += 1
    typeCounts.count += 1

    if (!previous) {
      churn.added += 1
      typeCounts.added += 1
    } else if (previous.versionHash === hashes.get(row.canonical.id)) {
      churn.unchanged += 1
      typeCounts.unchanged += 1
    } else {
      churn.changed += 1
      typeCounts.changed += 1
    }
  }

  for (const previous of previousById.values()) {
    if (hashes.has(previous.id)) continue
    churn.removed += 1
    churnCountsForType(churn, previous.type).removed += 1
  }

  return churn
}

async function getGeometryChurnBaseline(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  type: GeometryUploadPlan['type'],
  parentSnapshotId: string | null,
) {
  if (!parentSnapshotId) {
    return new Map<string, { id: string; type: string; versionHash: string }>()
  }

  const parentRows =
    type === 'divisionArea'
      ? await currentDb
          .select()
          .from(currentSchema.divisionAreas)
          .where(eq(currentSchema.divisionAreas.snapshotId, parentSnapshotId))
          .all()
      : await currentDb
          .select()
          .from(currentSchema.divisionBoundaries)
          .where(eq(currentSchema.divisionBoundaries.snapshotId, parentSnapshotId))
          .all()

  return new Map(
    await Promise.all(
      parentRows.map(
        async row =>
          [
            row.id,
            {
              id: row.id,
              type: row.type,
              versionHash: await hashDivisionGeometryRow(row),
            },
          ] as const,
      ),
    ),
  )
}

async function buildGeometryStats(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
  rows: Array<NonNullable<NormalisedGeometry>>,
  churn: GeometryChurnCounts,
) {
  return [
    ...buildGeometryChurnStatRows(plan.type, churn),
    ...buildGeometryDistrictDistributionRows(
      plan.type,
      rows,
      await resolveGeometryDistricts(currentDb, metaDb, plan),
      resolveProviderBridgeConfig(plan.source) !== null,
    ),
  ]
}

function buildGeometryChurnStatRows(
  type: GeometryUploadPlan['type'],
  churn: GeometryChurnCounts,
) {
  const rows = [
    geometryStatRow(type, 'count', 'churn', churn.count),
    geometryStatRow(type, 'added_count', 'churn', churn.added),
    geometryStatRow(type, 'changed_count', 'churn', churn.changed),
    geometryStatRow(type, 'removed_count', 'churn', churn.removed),
    geometryStatRow(type, 'unchanged_count', 'churn', churn.unchanged),
  ]

  for (const [groupValue, counts] of [...churn.byType].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    rows.push(
      geometryStatRow(type, 'count', 'churn', counts.count, 'type', groupValue),
      geometryStatRow(type, 'added_count', 'churn', counts.added, 'type', groupValue),
      geometryStatRow(
        type,
        'changed_count',
        'churn',
        counts.changed,
        'type',
        groupValue,
      ),
      geometryStatRow(
        type,
        'removed_count',
        'churn',
        counts.removed,
        'type',
        groupValue,
      ),
      geometryStatRow(
        type,
        'unchanged_count',
        'churn',
        counts.unchanged,
        'type',
        groupValue,
      ),
    )
  }

  return rows
}

async function resolveGeometryDistricts(
  currentDb: Awaited<ReturnType<typeof resolveLocalAddressDbContext>>['currentDb'],
  metaDb: HarbourReadableDb,
  plan: GeometryUploadPlan,
) {
  const snapshot = await resolvePublishedSnapshotForResourceTypeRegionCohortKey(
    metaDb,
    'division',
    plan.regionCode,
    plan.cohortKey,
  )
  if (!snapshot) return new Map<string, string>()

  const divisions = await currentDb
    .select({
      hierarchy: currentSchema.divisions.hierarchy,
      id: currentSchema.divisions.id,
      type: currentSchema.divisions.type,
    })
    .from(currentSchema.divisions)
    .where(eq(currentSchema.divisions.snapshotId, snapshot.id))
    .all()

  return new Map(
    divisions.flatMap(division => {
      if (division.type === 'district') return [[division.id, division.id]]
      if (!Array.isArray(division.hierarchy)) return []

      const district = division.hierarchy.find(
        entry =>
          entry &&
          typeof entry === 'object' &&
          (entry as Record<string, unknown>).type === 'district' &&
          typeof (entry as Record<string, unknown>).division_id === 'string',
      ) as Record<string, unknown> | undefined
      return typeof district?.division_id === 'string'
        ? [[division.id, district.division_id]]
        : []
    }),
  )
}

function buildGeometryDistrictDistributionRows(
  type: GeometryUploadPlan['type'],
  rows: Array<NonNullable<NormalisedGeometry>>,
  districtsByDivisionId: Map<string, string>,
  directDistrictReferences = false,
) {
  const counts = new Map<string, number>()

  for (const row of rows) {
    const districts = new Set(
      divisionReferenceIds(type, row)
        .map(
          id => districtsByDivisionId.get(id) ?? (directDistrictReferences ? id : null),
        )
        .filter((id): id is string => Boolean(id)),
    )
    for (const districtId of districts) {
      counts.set(districtId, (counts.get(districtId) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([groupValue, value]) =>
      geometryStatRow(type, 'records', 'distribution', value, 'district', groupValue),
    )
}

function buildOvertureGeometryProcessingActions(
  plan: GeometryUploadPlan,
  excludedRecords: Array<{
    divisionId: string | null
    divisionIds: string[] | null
    id: string | null
  }>,
): ReleaseProcessingAction[] {
  if (plan.source !== 'overture' || excludedRecords.length === 0) {
    return []
  }

  const examples = excludedRecords.slice(0, 10)
  return [
    {
      action: 'overture_division_geometry_cn_gd_excluded',
      affectedRecordCount: excludedRecords.length,
      evidence: {
        filter: {
          field: 'region',
          equals: 'CN-GD',
        },
        resourceType: plan.type,
        sourceVersion: plan.sourceVersion,
        examples,
        omittedExampleCount: excludedRecords.length - examples.length,
      },
      mode: 'automatic',
      summary:
        'Excluded Guangdong spillover geometry from the Hong Kong Overture release.',
    },
  ]
}

function asOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function asOptionalInteger(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value
  if (typeof value !== 'string' || !/^-?\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function requireInteger(value: unknown, name: string) {
  const integer = asOptionalInteger(value)
  if (integer === null) throw new Error(`Missing ${name}.`)
  return integer
}

function isString(value: string | null): value is string {
  return value !== null
}

function requireString(value: unknown, name: string) {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`Missing ${name}.`)
  return value
}
