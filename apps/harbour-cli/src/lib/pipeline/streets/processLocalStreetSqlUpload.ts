import {
  ensureDraftSnapshotForRelease,
  recordSnapshotAssembly,
  resolveShardForTypeRegionYear,
  upsertReleaseShardAssignment,
  upsertSnapshotShardAssignment,
  upsertSnapshotSource,
  waitForDatasetRecord,
} from '@repo/core/db/metaRegistry'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { replaceDatasetStats } from '@repo/core/pipeline/db/stats'
import type { HarbourClient } from '@repo/core/pipeline/harbourClient'
import type { DatasetProcessingStats } from '@repo/core/pipeline/processingRunStats'
import {
  buildPublicationRowCountSql,
  type PublicationPreparation,
} from '@repo/core/pipeline/services/publication/sql.ts'
import { currentSchema, eq, toIsoTimestamp } from '@repo/db'
import { createHarbourControlClient } from '../../api/harbourControl.ts'
import { OperationProgress } from '../../cli/operationProgress.ts'
import { resolvePipelineEnvironment, type UploadTarget } from '../../cli/options.ts'
import { resolveCurrentWriteContext } from '../../dbCache/currentWriteContext.ts'
import { materialiseLandsdStreetLifecycle } from '../../sources/hkgov/landsd/street/landsdStreetLifecycle.ts'
import type { PreparedUploadFile } from '../../upload/parquetRepack.ts'
import { LocalPipelineBucket } from '../local/localBucket.ts'
import { createLocalControlClient } from '../local/localControlClient.ts'
import { runLocalProgressPhase } from '../local/orchestrator.ts'
import {
  beginSnapshotPublication,
  completeSnapshotPublication,
  getPreparedPublication,
  guardSnapshotPublicationWrites,
} from '../local/snapshotPublication.ts'
import { deliveryFileSha256 } from '../local/sqlDeliveryFiles.ts'
import { completeSqlDeliveryRelease } from '../local/sqlDeliveryPending.ts'
import { syncStagedReleaseIntoLocalMetaCache } from '../local/syncStagedRelease.ts'
import {
  LANDSD_STREET_SNAPSHOT_SOURCE_ROLE,
  LOCAL_RELEASE_ROOT,
} from './processLocalStreetSqlUploadConfig.ts'
import { requireString } from './processLocalStreetSqlUploadParsing.ts'
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
  closeStreetOwnedVersions,
  insertHistoryI18nRows,
  insertHistoryRows,
  insertHistoryStreetChangelog,
  insertSourceRows,
  listCurrentSourceRows,
  replaceCurrentStreetI18nRows,
  replaceCurrentStreetRows,
  syncCurrentStreetChangelog,
} from './processLocalStreetSqlUploadRows.ts'
import { buildStreetStats } from './processLocalStreetSqlUploadStatistics.ts'
import type {
  LandsdStreetUploadPlan,
  UploadResult,
} from './processLocalStreetSqlUploadTypes.ts'
import { deliverStreetWorkflow } from './streetDelivery.ts'
import { readStreetSnapshot } from './streetHistory'
import { retainStreetProvenance } from './streetProvenance.ts'

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
  const resourceReleaseId = requireString(
    uploadResult.resourceReleaseId,
    'resourceReleaseId',
  )
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
      resolveCurrentWriteContext(
        target,
        previewPlan.regionCode,
        previewPlan.sourceVersion,
        {
          resumeSqlDeliveryReleaseId: resourceReleaseId,
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
      { datasetCode, rawObjectKey, releaseCode, resourceReleaseId },
      previewPlan,
    )
    await client.stageRunning(
      resourceReleaseId,
      'processDataset',
      { resourceType: 'street', sourceRows: previewPlan.rowCount },
      releaseCode,
    )

    const dataset = await waitForDatasetRecord(metaDb, { resourceReleaseId })
    if (!dataset) throw new Error(`Release not found: ${resourceReleaseId}`)
    const snapshot = await ensureDraftSnapshotForRelease(metaDb, 'street', {
      cohortKey: previewPlan.cohortKey,
      datasetCode,
      datasetId: dataset.datasetId,
      identityMode: 'persistent',
      regionCode: previewPlan.regionCode,
      sourceReleaseId: dataset.resourceReleaseId,
      variant: previewPlan.source,
    })
    await upsertSnapshotSource(
      metaDb,
      snapshot.id,
      dataset.resourceReleaseId,
      LANDSD_STREET_SNAPSHOT_SOURCE_ROLE,
      {
        anchorReleaseId: dataset.resourceReleaseId,
        selectedByRule: 'snapshot-assembly-hkgov-landsd-street-v1',
        // This snapshot is deliberately pinned to this exact staged release,
        // rather than selecting the latest release through a rolling rule.
        selectionMode: 'exact_ref',
      },
    )
    await recordSnapshotAssembly(metaDb, {
      snapshotId: snapshot.id,
      resourceType: 'street',
      anchorReleaseId: dataset.resourceReleaseId,
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
      upsertReleaseShardAssignment(metaDb, dataset.resourceReleaseId, historyShard.id),
      upsertReleaseShardAssignment(metaDb, dataset.resourceReleaseId, sourceShard.id),
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

    const preparedSha256 = await deliveryFileSha256(preparedUpload.filePath)
    const completionCounts = await deliverStreetWorkflow(
      context,
      resourceReleaseId,
      {
        snapshotId: snapshot.id,
        preparedSha256,
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
        const publication: PublicationPreparation = {
          table: 'streetPublicationState',
          scopeId: snapshot.snapshotLineageId,
          snapshotId: snapshot.id,
          publicationToken: resourceReleaseId,
          timestamp: now,
          previous,
        }
        const publicationDb = context.currentDb
        await beginSnapshotPublication(publicationDb, publication)
        context = {
          ...context,
          currentDb: guardSnapshotPublicationWrites(publicationDb, publication),
        }
        const parentHistory = await readStreetSnapshot(
          metaDb,
          context.historyTargets.map(target => target.db as HarbourReadableDb),
          snapshot.parentSnapshotId,
        )
        const inheritedChangelog = parentHistory.changelog
        const recordIds = records.map(record => record.base.id)
        const [currentSourceRows, currentStreets] = await Promise.all([
          listCurrentSourceRows(
            context.sourceDb as unknown as HarbourReadableDb,
            recordIds,
          ),
          Promise.resolve(parentHistory.lifecycleStreets),
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
          events: (previous?.snapshotId === snapshot.parentSnapshotId
            ? changedSourceRecords
            : resolvedRecords
          ).map(toLifecycleInput),
        })
        validateBaselineCoverage(resolvedRecords, lifecycle.current)
        const changedMaterialisedStreets = await Promise.all(
          [...new Map(lifecycle.changed.map(row => [row.id, row])).values()].map(
            addMaterialisedStreetHash,
          ),
        )
        const parentStreets = await Promise.all(
          parentHistory.streets.map(addMaterialisedStreetHash),
        )
        const allPreparedChangelog = await Promise.all(
          lifecycle.changelog.map(entry =>
            addStreetChangelogHash(entry, {
              sourceReleaseId: resourceReleaseId,
              sourceShardId: sourceShard.id,
            }),
          ),
        )

        const preparedChangelog = allPreparedChangelog.filter(
          row =>
            !inheritedChangelog.some(
              prior =>
                prior.streetId === row.streetId &&
                prior.recordKey === row.recordKey &&
                prior.versionHash === row.versionHash,
            ),
        )

        await closeStreetOwnedVersions({
          sourceDb: context.sourceDb as unknown as HarbourWritableDb,
          historyDb: context.historyDb as unknown as HarbourWritableDb,
          sourceTargets: context.sourceTargets as unknown as Array<{
            db: HarbourWritableDb
          }>,
          historyTargets: context.historyTargets as unknown as Array<{
            db: HarbourWritableDb
          }>,
          records: changedSourceRecords,
          deletedRecords: changedMaterialisedStreets.filter(
            record => record.status === 'deleted',
          ),
          streetIds: changedMaterialisedStreets
            .filter(record => record.status === 'deleted')
            .map(record => record.id),
          sourceVersion: dataset.sourceVersion,
          snapshotId: snapshot.id,
          now,
        })
        if (previous?.snapshotId !== snapshot.parentSnapshotId) {
          await context.currentDb
            .delete(currentSchema.streets)
            .where(eq(currentSchema.streets.snapshotId, scopeId))
            .run()
          await context.currentDb
            .delete(currentSchema.streetChangelog)
            .where(eq(currentSchema.streetChangelog.snapshotId, scopeId))
            .run()
          const inherited = await Promise.all(
            parentHistory.streets.map(addMaterialisedStreetHash),
          )
          await replaceCurrentStreetRows(
            context.currentDb as never,
            scopeId,
            inherited,
            now,
          )
          await replaceCurrentStreetI18nRows(
            context.currentDb as never,
            scopeId,
            inherited,
            now,
          )
          await syncCurrentStreetChangelog(
            context.currentDb as never,
            scopeId,
            inheritedChangelog as never,
            [],
            now,
          )
        }
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
          resourceReleaseId,
          changedMaterialisedStreets,
          now,
          parentStreets,
        )
        await insertHistoryI18nRows(
          context.historyDb as unknown as HarbourWritableDb,
          snapshot.id,
          resourceReleaseId,
          changedMaterialisedStreets,
          now,
          parentHistory.locales,
        )
        await insertHistoryStreetChangelog(
          context.historyDb as unknown as HarbourWritableDb,
          snapshot.id,
          preparedChangelog,
          now,
        )
        await insertSourceRows(
          context.sourceDb as unknown as HarbourWritableDb,
          resourceReleaseId,
          dataset.sourceVersion,
          changedSourceRecords,
          now,
        )
        await replaceDatasetStats(
          metaDb,
          resourceReleaseId,
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
    await retainStreetProvenance({
      target,
      directory: `${releaseRoot}/provenance-street`,
      resourceReleaseId,
      datasetCode,
      snapshotId: snapshot.id,
      scopeId: snapshot.snapshotLineageId,
      preparedSha256,
      records,
      counts: completionCounts,
      currentDb: context.currentDb as unknown as HarbourReadableDb,
      sourceDb: context.sourceDb as unknown as HarbourReadableDb,
    })
    await client.stageCompleted(
      resourceReleaseId,
      'processDataset',
      {
        resourceType: 'street',
        sourceRows: previewPlan.rowCount,
        processedRows: completionCounts.importedRows,
        changedRows: completionCounts.changedRows,
        sourceRowsChanged: completionCounts.sourceRowsChanged,
      } satisfies DatasetProcessingStats & Record<string, unknown>,
      releaseCode,
    )
    const publishResult = await client.publishDataset(resourceReleaseId, releaseCode, {
      skipSnapshotCleanup: options.skipSnapshotCleanup,
    })
    completed = true
    return { importedRows: records.length, publishResult, snapshotId: snapshot.id }
  } catch (error) {
    progress.fail()
    await client
      .stageFailed(
        resourceReleaseId,
        'processDataset',
        error instanceof Error ? error.message : String(error),
        undefined,
        releaseCode,
      )
      .catch(() => undefined)
    throw error
  } finally {
    if (completed)
      await completeSqlDeliveryRelease(context.state.dbCacheDir, resourceReleaseId)
    context.cleanup()
  }
}

export type { LandsdStreetUploadPlan } from './processLocalStreetSqlUploadTypes.ts'
