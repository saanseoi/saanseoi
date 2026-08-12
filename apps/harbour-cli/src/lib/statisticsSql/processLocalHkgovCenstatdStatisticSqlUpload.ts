import { createHash } from '@repo/core/pipeline/utils'
import { sourceSchema } from '@repo/db'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import { and, eq, inArray } from 'drizzle-orm'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'
import { readParquetObjectsInBatches } from '@repo/core/pipeline/parquetR2'

import { resolveLocalAddressDbContext } from '../addressSql/localDbCache.ts'
import type { UploadTarget } from '../cli/options.ts'
import { createHarbourControlClient } from '../api/harbourControl.ts'
import { createLocalControlClient } from '../localPipeline/localControlClient.ts'
import type { PreparedUploadFile } from '../upload/parquetRepack.ts'
import { updateDatasetStatus } from '@repo/core/db/metaRegistry'

export async function processLocalHkgovCenstatdStatisticSqlUpload(
  target: UploadTarget,
  plan: {
    cohortKey: string
    releaseCode: string
    rowCount: number
    sourceVersion: string
  },
  upload: { releaseCode?: string; releaseId?: string },
  prepared: PreparedUploadFile,
) {
  const releaseId = required(upload.releaseId, 'releaseId')
  const releaseCode = required(upload.releaseCode, 'releaseCode')
  const context = await resolveLocalAddressDbContext(
    target,
    'hk',
    plan.sourceVersion.slice(0, 4),
  )
  const metaDb = context.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
  const client = target.remote
    ? createHarbourControlClient(target)
    : createLocalControlClient(metaDb, {
        publishClient: {
          async publishDataset(id) {
            await updateDatasetStatus(metaDb, id, 'published')
          },
          async stageCompleted() {},
          async stageFailed() {},
          async stageRunning() {},
        },
      })
  try {
    await client.stageRunning(
      releaseId,
      'processDataset',
      { resourceType: 'divisionStatistic', sourceRows: plan.rowCount },
      releaseCode,
    )
    const rows = await readRows(prepared.filePath, releaseId, releaseCode)
    if (rows.length !== plan.rowCount)
      throw new Error(
        `Expected ${plan.rowCount} C&SD statistic rows; found ${rows.length}.`,
      )
    await (context.sourceDb as HarbourWritableDb)
      .update(sourceSchema.sourceHkgovCenstatdStatistics)
      .set({
        isCurrent: false,
        validToRelease: releaseCode,
        updatedAt: new Date().toISOString(),
      })
      .where(
        and(
          eq(sourceSchema.sourceHkgovCenstatdStatistics.isCurrent, true),
          inArray(
            sourceSchema.sourceHkgovCenstatdStatistics.sourceRecordId,
            rows.map(row => row.sourceRecordId),
          ),
        ),
      )
      .run()
    await (context.sourceDb as HarbourWritableDb)
      .insert(sourceSchema.sourceHkgovCenstatdStatistics)
      .values(rows)
      .run()
    await client.stageCompleted(
      releaseId,
      'processDataset',
      { importedRows: rows.length },
      releaseCode,
    )
    return client.publishDataset(releaseId, releaseCode)
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
    context.cleanup()
  }
}

async function readRows(filePath: string, releaseId: string, releaseCode: string) {
  const rows: Array<Record<string, unknown>> = []
  for await (const batch of readParquetObjectsInBatches(
    await asyncBufferFromFile(filePath),
    2048,
  ))
    rows.push(...batch)
  return Promise.all(
    rows.map(async row => {
      const sourceRecordId = requiredString(row.id, 'id')
      const properties = json(row.raw_properties, 'raw_properties')
      const source = json(row.sources, 'sources')
      const payload = {
        datasetCode: requiredString(row.dataset_code, 'dataset_code'),
        featureId: requiredString(row.feature_id, 'feature_id'),
        layerName: requiredString(row.layer_name, 'layer_name'),
        referenceYear: requiredString(row.reference_year, 'reference_year'),
        sourceGeometry: json(row.source_geometry, 'source_geometry'),
        sources: source,
        rawProperties: properties,
      }
      const now = new Date().toISOString()
      return {
        ...payload,
        sourceRecordId,
        releaseId,
        validFromRelease: releaseCode,
        validToRelease: null,
        isCurrent: true,
        version: 1,
        versionHash: await createHash(JSON.stringify(payload)),
        createdAt: now,
        updatedAt: now,
      }
    }),
  )
}
function json(value: unknown, field: string) {
  try {
    return typeof value === 'string' ? JSON.parse(value) : value
  } catch {
    throw new Error(`Invalid ${field} JSON.`)
  }
}
function required(value: string | undefined, field: string) {
  if (!value) throw new Error(`Missing ${field}.`)
  return value
}
function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing ${field}.`)
  return value
}
