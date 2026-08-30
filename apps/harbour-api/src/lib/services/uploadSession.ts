import { and, eq, metaSchema } from '@repo/db'
import { createRawObjectKey, registerUpload } from '@repo/core/upload'

import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import type { SchemaFingerprintResolver, UploadInspection } from '@repo/core'

export type RegisterUploadRequest = {
  fileName: string
  force?: boolean
  resumeStagedRelease?: boolean
  inspection: UploadInspection
  plan: {
    cohortKey?: string
    datasetCode?: string
    regionCode?: string
    releaseNotesUrl?: string
    shardYear?: string
    source?: string
    sourceVersion?: string
    theme?: string
    type?: string
  }
}

export async function handleRegisterUploadRequest(
  db: HarbourReadableDb & HarbourWritableDb,
  request: RegisterUploadRequest,
) {
  const registered = await registerUpload(db, {
    allowExistingDatasetStatuses: request.force
      ? ['staged', 'published']
      : request.resumeStagedRelease
        ? ['staged']
        : undefined,
    resumeInterruptedProcessingRelease: request.resumeStagedRelease,
    cohortKey: request.plan.cohortKey,
    datasetCode: request.plan.datasetCode,
    filePath: request.fileName,
    inspection: request.inspection,
    regionCode: request.plan.regionCode,
    releaseNotesUrl: request.plan.releaseNotesUrl,
    resolveSchemaFingerprint: createSchemaFingerprintResolver(db),
    shardYear: request.plan.shardYear,
    source: request.plan.source,
    sourceVersion: request.plan.sourceVersion,
    theme: request.plan.theme,
    type: request.plan.type,
  })

  if (!registered.datasetId || !registered.releaseId) {
    throw new Error(
      'Local upload registration returned incomplete release identifiers.',
    )
  }

  return {
    datasetCode: registered.plan.datasetCode,
    datasetId: registered.datasetId,
    rawObjectKey: createRawObjectKey(registered.plan),
    releaseCode: registered.plan.releaseCode,
    releaseId: registered.releaseId,
    rowCount: registered.plan.rowCount,
    source: registered.plan.source,
    sourceVersion: registered.plan.sourceVersion,
    status: 'staged' as const,
    type: registered.plan.type,
  }
}

function createSchemaFingerprintResolver(
  db: HarbourReadableDb,
): SchemaFingerprintResolver {
  return async (_rawObjectKey, releaseCode) => {
    if (!releaseCode) return null

    return readSchemaFingerprint(
      await getIngestRunStatsByReleaseCode(db, releaseCode, 'registerDataset'),
    )
  }
}

async function getIngestRunStatsByReleaseCode(
  db: HarbourReadableDb,
  releaseCode: string,
  phase: 'registerDataset',
): Promise<Record<string, unknown> | null> {
  const row = await db
    .select({ stats: metaSchema.ingestRuns.stats })
    .from(metaSchema.ingestRuns)
    .innerJoin(
      metaSchema.metaReleases,
      eq(metaSchema.ingestRuns.releaseId, metaSchema.metaReleases.id),
    )
    .where(
      and(
        eq(metaSchema.metaReleases.code, releaseCode),
        eq(metaSchema.ingestRuns.phase, phase),
      ),
    )
    .limit(1)
    .get()

  return parseStatsRecord(row?.stats)
}

function readSchemaFingerprint(stats: Record<string, unknown> | null) {
  const schemaFingerprint = stats?.schemaFingerprint
  return typeof schemaFingerprint === 'string' && schemaFingerprint.trim()
    ? schemaFingerprint
    : null
}

function parseStatsRecord(stats: unknown): Record<string, unknown> | null {
  if (!stats) return null

  const parsed =
    typeof stats === 'string'
      ? (() => {
          try {
            return JSON.parse(stats) as unknown
          } catch {
            return null
          }
        })()
      : stats

  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null
}
