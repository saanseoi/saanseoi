import { completeSqlDeliveryRelease } from '../local/sqlDeliveryPending.ts'
import {
  beginSnapshotPublication,
  completeSnapshotPublication,
  guardSnapshotPublicationWrites,
  resolvePreparedPublicationScope,
  getPreparedPublication,
} from '../local/snapshotPublication.ts'
import {
  buildPublicationRowCountSql,
  type PublicationPreparation,
} from '@repo/core/pipeline/services/publication/sql.ts'
import { deliverStreetWorkflow } from './streetDelivery.ts'
import { deliveryFileSha256 } from '../local/sqlDeliveryFiles.ts'
import {
  ensureDraftSnapshotForRelease,
  recordSnapshotAssemblyRun,
  resolveShardForTypeRegionYear,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceReleaseProcessingActions } from '@repo/core/pipeline/db/processingActions'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import { currentSchema, eq, toIsoTimestamp } from '@repo/db'
import type { PreparedUploadFile } from '../../upload/parquetRepack.ts'
import { resolvePipelineEnvironment, type UploadTarget } from '../../cli/options.ts'
import { createHarbourControlClient } from '../../api/harbourControl.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../local/syncStagedRelease.ts'
import { createLocalControlClient } from '../local/localControlClient.ts'
import { LocalPipelineBucket } from '../local/localBucket.ts'
import { resolveLocalAddressDbContext } from '../../dbCache/localDbCache.ts'
import { runLocalProgressPhase } from '../local/orchestrator.ts'
import { OperationProgress } from '../../cli/operationProgress.ts'
import { materialiseLandsdStreetLifecycle } from '../../sources/hkgov/landsd/street/landsdStreetLifecycle.ts'
import type {
  LandsdStreetUploadPlan,
  UploadResult,
} from './processLocalStreetSqlUploadTypes.ts'
import { requireString } from './processLocalStreetSqlUploadParsing.ts'
import {
  LANDSD_STREET_SNAPSHOT_SOURCE_ROLE,
  LOCAL_RELEASE_ROOT,
} from './processLocalStreetSqlUploadConfig.ts'
import {
  addMaterialisedStreetHash,
  addStreetChangelogHash,
  indexCanonicalStreetIdsBySourceRecord,
  loadCanonicalDistricts,
  readPreparedStreets,
  resolvePersistentStreetIds,
  toLifecycleInput,
  validateBaselineCoverage,
  validatePreparedStreets,
} from './processLocalStreetSqlUploadPreparation.ts'
import {
  closeHistoryVersions,
  closeSourceVersions,
  insertHistoryI18nRows,
  insertHistoryRows,
  insertHistoryStreetChangelog,
  insertSourceRows,
  listCurrentMaterialisedStreets,
  listCurrentSourceRows,
  replaceCurrentStreetI18nRows,
  replaceCurrentStreetRows,
  syncCurrentStreetChangelog,
} from './processLocalStreetSqlUploadRows.ts'
import { buildStreetStats } from './processLocalStreetSqlUploadStatistics.ts'

/**
 * Imports a generated LandsD release after its evidence is registered as a
 * managed source asset. Street notices are an append-only ledger: a new publication
 * inherits its parent snapshot and replaces only matching immutable notice
 * IDs when a source revision genuinely changes their content.
 */
export async function processLocalStreetSqlUpload(
  target: UploadTarget,
  previewPlan: LandsdStreetUploadPlan,
  uploadResult: UploadResult,
  preparedUpload: PreparedUploadFile,
  options: { skipSnapshotCleanup?: boolean } = {},
) {
  const releaseId = requireString(uploadResult.releaseId, 'releaseId')
  const releaseCode = requireString(uploadResult.releaseCode, 'releaseCode')
  const datasetCode = requireString(uploadResult.datasetCode, 'datasetCode')
  const rawObjectKey = requireString(uploadResult.rawObjectKey, 'rawObjectKey')
  const releaseRoot = `${LOCAL_RELEASE_ROOT}/${target.remote ? 'remote' : 'local'}/${releaseCode}`
  const progress = new OperationProgress()
  const bucket = new LocalPipelineBucket(releaseRoot)
  await runLocalProgressPhase(
    progress,
    { action: 'Prepare', subject: 'workspace' },
    () => bucket.seedRawObject(rawObjectKey, preparedUpload.filePath),
  )

  const context = await runLocalProgressPhase(
    progress,
    { action: 'Prepare', subject: 'database' },
    () =>
      resolveLocalAddressDbContext(
        target,
        previewPlan.regionCode,
        previewPlan.sourceVersion,
        {
          cacheTableProfile: 'street',
          includePreviousShardYears: true,
          resumeSqlDeliveryReleaseId: releaseId,
        },
      ),
  )
  const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const client = (
    target.remote
      ? createHarbourControlClient(target)
      : createLocalControlClient(metaDb, {
          publishClient: createHarbourControlClient(target) as HarbourClient,
        })
  ) as HarbourClient

  let completed = false
  try {
    await syncStagedReleaseIntoLocalMetaCache(
      context.metaDb,
      { datasetCode, rawObjectKey, releaseCode, releaseId },
      previewPlan,
    )
    await client.stageRunning(
      releaseId,
      'processDataset',
      { resourceType: 'street', rowCount: previewPlan.rowCount },
      releaseCode,
    )

    const dataset = await waitForDatasetRecord(metaDb, { releaseId })
    if (!dataset) throw new Error(`Release not found: ${releaseId}`)
    const snapshot = await ensureDraftSnapshotForRelease(metaDb, 'street', {
      cohortKey: previewPlan.cohortKey,
      datasetCode,
      datasetId: dataset.datasetId,
      identityMode: 'persistent',
      regionCode: previewPlan.regionCode,
      sourceReleaseId: dataset.releaseId,
      variant: previewPlan.source,
    })
    await upsertSnapshotSource(
      metaDb,
      snapshot.id,
      dataset.datasetId,
      dataset.releaseId,
      LANDSD_STREET_SNAPSHOT_SOURCE_ROLE,
      {
        anchorReleaseId: dataset.releaseId,
        selectedByRule: 'snapshot-assembly-hkgov-landsd-street-v1',
        // This snapshot is deliberately pinned to this exact staged release,
        // rather than selecting the latest release through a rolling rule.
        selectionMode: 'exact_ref',
        sourceCohortKey: dataset.cohortKey,
      },
    )
    await recordSnapshotAssemblyRun(metaDb, {
      snapshotId: snapshot.id,
      resourceType: 'street',
      anchorReleaseId: dataset.releaseId,
      anchorCohortKey: dataset.cohortKey,
      selectionSummaryJson: {
        releaseRole: LANDSD_STREET_SNAPSHOT_SOURCE_ROLE,
        sourceReleaseId: dataset.releaseId,
        sourceVersion: dataset.sourceVersion,
      },
    })

    const [historyShard, sourceShard] = await Promise.all([
      resolveShardForTypeRegionYear(
        metaDb,
        'history',
        resolvePipelineEnvironment(target),
        previewPlan.regionCode,
        previewPlan.sourceVersion,
      ),
      resolveShardForTypeRegionYear(
        metaDb,
        'source',
        resolvePipelineEnvironment(target),
        previewPlan.regionCode,
        previewPlan.sourceVersion,
      ),
    ])
    if (!historyShard || !sourceShard) {
      throw new Error(
        `Shard mapping not found for ${previewPlan.regionCode}/${previewPlan.sourceVersion}.`,
      )
    }
    await Promise.all([
      upsertReleaseShardAssignment(metaDb, dataset.releaseId, historyShard.id),
      upsertReleaseShardAssignment(metaDb, dataset.releaseId, sourceShard.id),
      upsertSnapshotShardAssignment(metaDb, snapshot.id, historyShard.id),
    ])

    const canonicalDistricts = await loadCanonicalDistricts(
      metaDb,
      context.currentDb as unknown as HarbourReadableDb,
      previewPlan.regionCode,
    )
    const records = await readPreparedStreets(bucket, rawObjectKey, canonicalDistricts)
    validatePreparedStreets(records, previewPlan)
    const now = toIsoTimestamp()

    const completionCounts = await deliverStreetWorkflow(
      context,
      releaseId,
      {
        snapshotId: snapshot.id,
        preparedSha256: await deliveryFileSha256(preparedUpload.filePath),
      },
      async context => {
        const metaDb = context.metaDb as unknown as HarbourReadableDb &
          HarbourWritableDb
        const scopeId = snapshot.snapshotLineageId
        const previous = await getPreparedPublication(
          context.currentDb as unknown as HarbourReadableDb,
          'streetPublicationState',
          scopeId,
        )
        if (snapshot.parentSnapshotId) {
          const parentScope = await resolvePreparedPublicationScope(
            context.currentDb as unknown as HarbourReadableDb,
            'streetPublicationState',
            snapshot.parentSnapshotId,
          )
          if (parentScope !== scopeId)
            throw new Error('Street publication parent belongs to a different scope.')
        }
        const publication: PublicationPreparation = {
          table: 'streetPublicationState',
          scopeId: snapshot.snapshotLineageId,
          snapshotId: snapshot.id,
          publicationToken: releaseId,
          timestamp: now,
          previous,
        }
        const publicationDb = context.currentDb
        await beginSnapshotPublication(publicationDb, publication)
        context = {
          ...context,
          currentDb: guardSnapshotPublicationWrites(publicationDb, publication),
        }
        const inheritedChangelog = await context.currentDb
          .select({
            recordKey: currentSchema.streetChangelog.recordKey,
            streetId: currentSchema.streetChangelog.streetId,
          })
          .from(currentSchema.streetChangelog)
          .where(eq(currentSchema.streetChangelog.snapshotId, scopeId))
          .all()
        const recordIds = records.map(record => record.base.id)
        const [currentSourceRows, currentStreets] = await Promise.all([
          listCurrentSourceRows(
            context.sourceDb as unknown as HarbourReadableDb,
            recordIds,
          ),
          listCurrentMaterialisedStreets(
            context.currentDb as unknown as HarbourReadableDb,
            scopeId,
          ),
        ])
        const sourceHashById = new Map(
          currentSourceRows.map(row => [row.sourceRecordId, row.versionHash]),
        )
        const canonicalStreetIdsBySourceRecord =
          indexCanonicalStreetIdsBySourceRecord(currentStreets)
        const resolvedRecords = records.map(record =>
          resolvePersistentStreetIds(
            record,
            canonicalStreetIdsBySourceRecord.get(record.base.id) ?? [],
          ),
        )
        const changedSourceRecords = resolvedRecords.filter(
          record => sourceHashById.get(record.base.id) !== record.sourceHash,
        )
        const lifecycle = materialiseLandsdStreetLifecycle({
          current: currentStreets,
          events: changedSourceRecords.map(toLifecycleInput),
        })
        validateBaselineCoverage(resolvedRecords, lifecycle.current)
        const changedMaterialisedStreets = await Promise.all(
          lifecycle.changed.map(addMaterialisedStreetHash),
        )
        const preparedChangelog = await Promise.all(
          lifecycle.changelog.map(entry =>
            addStreetChangelogHash(entry, {
              sourceReleaseId: releaseId,
              sourceShardId: sourceShard.id,
            }),
          ),
        )

        await closeSourceVersions(
          context.sourceDb as unknown as HarbourWritableDb,
          changedSourceRecords,
          releaseCode,
          now,
        )
        await closeHistoryVersions(
          context.historyDb as unknown as HarbourWritableDb,
          changedMaterialisedStreets.map(record => record.id),
          snapshot.id,
          now,
        )
        await replaceCurrentStreetRows(
          context.currentDb as unknown as HarbourWritableDb,
          scopeId,
          changedMaterialisedStreets,
          now,
        )
        await replaceCurrentStreetI18nRows(
          context.currentDb as unknown as HarbourWritableDb,
          scopeId,
          changedMaterialisedStreets,
          now,
        )
        await syncCurrentStreetChangelog(
          context.currentDb as unknown as HarbourWritableDb,
          scopeId,
          preparedChangelog,
          changedMaterialisedStreets
            .filter(record => record.status === 'deleted')
            .map(record => record.id),
          now,
        )
        await insertHistoryRows(
          context.historyDb as unknown as HarbourWritableDb,
          snapshot.id,
          releaseId,
          changedMaterialisedStreets,
          now,
        )
        await insertHistoryI18nRows(
          context.historyDb as unknown as HarbourWritableDb,
          snapshot.id,
          releaseId,
          changedMaterialisedStreets,
          now,
        )
        await insertHistoryStreetChangelog(
          context.historyDb as unknown as HarbourWritableDb,
          snapshot.id,
          preparedChangelog,
          now,
        )
        await insertSourceRows(
          context.sourceDb as unknown as HarbourWritableDb,
          releaseId,
          releaseCode,
          changedSourceRecords,
          now,
        )
        await replaceReleaseProcessingActions(metaDb, releaseId, [])
        await replaceDatasetStats(
          metaDb,
          releaseId,
          buildStreetStats(resolvedRecords, lifecycle.current, lifecycle.stats, now),
        )
        const removedStreetIds = new Set(
          changedMaterialisedStreets
            .filter(street => street.status === 'deleted')
            .map(street => street.id),
        )
        const expectedChangelog = new Set(
          [...inheritedChangelog, ...preparedChangelog]
            .filter(entry => !removedStreetIds.has(entry.streetId))
            .map(entry => JSON.stringify([entry.recordKey, entry.streetId])),
        )
        await completeSnapshotPublication(
          publicationDb,
          publication,
          [
            buildPublicationRowCountSql('streets', scopeId, lifecycle.current.length),
            buildPublicationRowCountSql(
              'streetChangelog',
              scopeId,
              expectedChangelog.size,
            ),
            buildPublicationRowCountSql(
              'streetsI18n',
              scopeId,
              lifecycle.current.reduce((sum, street) => sum + street.i18n.length, 0),
            ),
          ].join(' AND '),
        )
        return {
          importedRows: records.length,
          changedRows: changedMaterialisedStreets.length,
          sourceRowsChanged: changedSourceRecords.length,
        }
      },
    )
    await client.stageCompleted(
      releaseId,
      'processDataset',
      {
        resourceType: 'street',
        sourceRows: previewPlan.rowCount,
        ...completionCounts,
      },
      releaseCode,
    )
    const publishResult = await client.publishDataset(releaseId, releaseCode, {
      skipSnapshotCleanup: options.skipSnapshotCleanup,
    })
    completed = true
    return { importedRows: records.length, publishResult, snapshotId: snapshot.id }
  } catch (error) {
    progress.fail()
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
    if (completed) await completeSqlDeliveryRelease(context.state.dbCacheDir, releaseId)
    context.cleanup()
  }
}

export type { LandsdStreetUploadPlan } from './processLocalStreetSqlUploadTypes.ts'
