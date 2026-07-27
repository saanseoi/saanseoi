import type { ResourceType } from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import {
  createRawObjectKey,
  registerUpload as registerLocalUpload,
} from '@repo/core/upload'
import { and, eq, metaSchema } from '@repo/db'
import type { ReleaseStatus } from '@repo/db'
import type { prepareUpload } from '@repo/core/uploadLocal'

import { getAuthHeaders, resolveHarbourApiUrl } from '../api/api.ts'
import { resolveLocalAddressDbContext } from '../addressSql/localDbCache.ts'
import type { CliUploadOptions, UploadTarget } from '../cli/options.ts'

type UploadPreviewResult = Awaited<ReturnType<typeof prepareUpload>>

type UploadResponse = Record<string, unknown> & {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}

type SnapshotCleanupResponse = {
  candidateCount: number
  delaySeconds: number
  dryRun: boolean
  snapshotIds: string[]
  status: 'queued' | 'skipped'
}

type DispatchUploadOptions = {
  /** Restricted local repair path for a source-specific deterministic reprocess. */
  allowReprocessPublished?: boolean
  force?: boolean
  resolveLocalDbContext?: typeof resolveLocalAddressDbContext
}

type ScheduleSnapshotCleanupOptions = {
  delaySeconds?: number
  dryRun?: boolean
  resourceType?: ResourceType
  snapshotIds?: string[]
}

function resolveShardYear(cohortKey: string, sourceVersion: string) {
  const snapshotYear = cohortKey.slice(0, 4)
  const sourceYear = sourceVersion.slice(0, 4)

  if (!/^\d{4}$/.test(snapshotYear) || !/^\d{4}$/.test(sourceYear)) {
    throw new Error(
      `Could not resolve shard year from cohortKey=${cohortKey} and sourceVersion=${sourceVersion}.`,
    )
  }

  if (snapshotYear !== sourceYear) {
    throw new Error(
      `Shard year mismatch: cohortKey=${cohortKey} and sourceVersion=${sourceVersion} point to different years.`,
    )
  }

  return snapshotYear
}

export function buildRegisterUploadEndpoint(apiBaseUrl: string) {
  return `${apiBaseUrl}/v1/registerUpload`
}

export function buildCleanupSnapshotsEndpoint(apiBaseUrl: string) {
  return `${apiBaseUrl}/v1/control/cleanupSnapshots`
}

/**
 * Registers a release and returns a local-only pipeline key. The prepared
 * Parquet never crosses this boundary: local processors seed it directly into
 * their LocalPipelineBucket before loading the destination databases.
 */
export async function dispatchUpload(
  target: UploadTarget,
  registerOptions: CliUploadOptions,
  previewResult: UploadPreviewResult,
  _schemaVersionId: string,
  options: DispatchUploadOptions = {},
) {
  if (!target.remote) {
    return registerUploadLocally(target, registerOptions, previewResult, options)
  }

  return requestRemoteRegistration(target, previewResult, options)
}

async function registerUploadLocally(
  target: UploadTarget,
  registerOptions: CliUploadOptions,
  previewResult: UploadPreviewResult,
  options: DispatchUploadOptions,
) {
  const shardYear = resolveShardYear(
    previewResult.plan.cohortKey,
    previewResult.plan.sourceVersion,
  )
  const resolveDbContext = options.resolveLocalDbContext ?? resolveLocalAddressDbContext
  const dbContext = await resolveDbContext(
    target,
    previewResult.plan.regionCode,
    shardYear,
    {
      cacheTableProfile:
        previewResult.plan.type === 'division'
          ? 'division'
          : previewResult.plan.type === 'divisionArea' ||
              previewResult.plan.type === 'divisionBoundary'
            ? 'divisionGeometry'
            : 'address',
    },
  )

  try {
    const metaDb = dbContext.metaDb as unknown as HarbourReadableDb & HarbourWritableDb
    const allowExistingDatasetStatuses: ReleaseStatus[] | undefined = options.force
      ? options.allowReprocessPublished
        ? ['staged', 'published']
        : ['staged']
      : undefined
    const registered = await registerLocalUpload(metaDb, {
      ...registerOptions,
      allowExistingDatasetStatuses,
      cohortKey: previewResult.plan.cohortKey,
      filePath: previewResult.plan.fileName,
      inspection: previewResult.inspection,
      originalFileName: previewResult.plan.originalFileName,
      regionCode: previewResult.plan.regionCode,
      releaseNotesUrl: previewResult.plan.releaseNotesUrl,
      resolveSchemaFingerprint: createLocalSchemaFingerprintResolver(metaDb),
      shardYear,
      source: previewResult.plan.source,
      sourceVersion: previewResult.plan.sourceVersion,
      theme: previewResult.plan.theme,
      type: previewResult.plan.type,
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
      status: 'staged',
      type: registered.plan.type,
    }
  } finally {
    dbContext.cleanup()
  }
}

async function requestRemoteRegistration(
  target: UploadTarget,
  previewResult: UploadPreviewResult,
  options: DispatchUploadOptions,
) {
  const shardYear = resolveShardYear(
    previewResult.plan.cohortKey,
    previewResult.plan.sourceVersion,
  )
  const response = await fetch(
    buildRegisterUploadEndpoint(resolveHarbourApiUrl(target)),
    {
      body: JSON.stringify({
        fileName: previewResult.plan.fileName,
        force: Boolean(options.force),
        inspection: previewResult.inspection,
        plan: {
          cohortKey: previewResult.plan.cohortKey,
          datasetCode: previewResult.plan.datasetCode,
          regionCode: previewResult.plan.regionCode,
          releaseNotesUrl: previewResult.plan.releaseNotesUrl,
          shardYear,
          source: previewResult.plan.source,
          sourceVersion: previewResult.plan.sourceVersion,
          theme: previewResult.plan.theme,
          type: previewResult.plan.type,
        },
      }),
      headers: { 'content-type': 'application/json', ...getAuthHeaders() },
      method: 'POST',
    },
  )
  return parseJsonResponse<UploadResponse>(
    response,
    'Harbour local upload registration',
  )
}

function createLocalSchemaFingerprintResolver(db: HarbourReadableDb) {
  return async (_rawObjectKey: string | null, releaseCode?: string) => {
    if (!releaseCode) return null

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
          eq(metaSchema.ingestRuns.phase, 'registerDataset'),
        ),
      )
      .limit(1)
      .get()

    return readSchemaFingerprint(row?.stats)
  }
}

function readSchemaFingerprint(stats: unknown) {
  const parsed = typeof stats === 'string' ? parseStatsJson(stats) : stats
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const schemaFingerprint = (parsed as { schemaFingerprint?: unknown })
    .schemaFingerprint
  return typeof schemaFingerprint === 'string' && schemaFingerprint.trim()
    ? schemaFingerprint
    : null
}

function parseStatsJson(stats: string) {
  try {
    return JSON.parse(stats) as unknown
  } catch {
    return null
  }
}

export async function scheduleSnapshotCleanup(
  target: UploadTarget,
  options: ScheduleSnapshotCleanupOptions = {},
) {
  const apiBaseUrl = resolveHarbourApiUrl(target)
  const response = await fetch(buildCleanupSnapshotsEndpoint(apiBaseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      ...(options.delaySeconds !== undefined
        ? { delaySeconds: options.delaySeconds }
        : {}),
      ...(options.dryRun ? { dryRun: true } : {}),
      ...(options.resourceType ? { resourceType: options.resourceType } : {}),
      ...(options.snapshotIds ? { snapshotIds: options.snapshotIds } : {}),
    }),
  })

  return parseJsonResponse<SnapshotCleanupResponse>(
    response,
    'Harbour cleanupSnapshots',
  )
}

async function parseJsonResponse<T>(response: Response, action: string) {
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : `${action} failed with status ${response.status}.`
    throw new Error(message)
  }

  return payload as T
}
