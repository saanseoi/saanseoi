import { readFile, stat } from 'node:fs/promises'

import type { ResourceType } from '@repo/core'
import type { HarbourReadableDb, HarbourWritableDb } from '@repo/core/db/types'
import {
  finaliseUpload as coreFinaliseLocalUpload,
  requestUpload as coreRequestLocalUpload,
} from '@repo/core/upload'
import { and, eq, metaSchema } from '@repo/db'
import type { ReleaseStatus } from '@repo/db'
import type { prepareUpload } from '@repo/core/uploadLocal'

import { getAuthHeaders, resolveHarbourApiUrl } from './api.ts'
import { resolveLocalAddressDbContext } from './addressSql/localDbCache.ts'
import { prepareUploadFileForDispatch } from './parquetRepack.ts'
import type { CliUploadOptions, UploadTarget } from './options.ts'

type UploadPreviewResult = Awaited<ReturnType<typeof prepareUpload>>

type SignUploadResponse = {
  datasetId: string
  datasetCode: string
  expiresAt: string
  rawObjectKey: string
  releaseCode: string
  releaseId: string
  status: string
  uploadHeaders: Record<string, string>
  uploadMethod: 'PUT'
  uploadUrl: string
}

type UploadResponse = Record<string, unknown> & {
  datasetCode?: string
  datasetId?: string
  rawObjectKey?: string
  releaseCode?: string
  releaseId?: string
}
export type UploadDispatchTimings = {
  fileBytes: number
  finaliseMs: number
  signMs: number
  totalMs: number
  uploadMs: number
}
const UPLOAD_TIMINGS_KEY = '__uploadTimings'
type SnapshotCleanupResponse = {
  candidateCount: number
  delaySeconds: number
  dryRun: boolean
  snapshotIds: string[]
  status: 'queued' | 'skipped'
}
type DispatchUploadOptions = {
  force?: boolean
  finaliseLocalUpload?: typeof coreFinaliseLocalUpload
  requestLocalUpload?: typeof coreRequestLocalUpload
  resolveLocalDbContext?: typeof resolveLocalAddressDbContext
  skipSnapshotCleanup?: boolean
  uploadFilePath?: string
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

export function buildSignUploadEndpoint(apiBaseUrl: string) {
  return `${apiBaseUrl}/v1/signUpload`
}

export function buildDirectUploadEndpoint(apiBaseUrl: string) {
  return `${apiBaseUrl}/v1/upload`
}

export function buildFinaliseUploadEndpoint(apiBaseUrl: string) {
  return `${apiBaseUrl}/v1/finaliseUpload`
}

export function buildCleanupSnapshotsEndpoint(apiBaseUrl: string) {
  return `${apiBaseUrl}/v1/control/cleanupSnapshots`
}

export async function dispatchUpload(
  target: UploadTarget,
  registerOptions: CliUploadOptions,
  previewResult: UploadPreviewResult,
  schemaVersionId: string,
  options: DispatchUploadOptions = {},
) {
  const dispatchStartedAt = Date.now()
  const apiBaseUrl = resolveHarbourApiUrl(target)
  const uploadFile = options.uploadFilePath
    ? {
        cleanup: async () => undefined,
        filePath: options.uploadFilePath,
      }
    : await prepareUploadFileForDispatch(registerOptions.filePath, previewResult)

  try {
    if (!target.remote) {
      return await registerLocalUpload(target, registerOptions, previewResult, options)
    }

    const fileStats = await stat(uploadFile.filePath)
    const signStartedAt = Date.now()
    const signResponse = await requestSignedUpload(
      apiBaseUrl,
      previewResult,
      fileStats.size,
      schemaVersionId,
      options,
    )
    const signMs = Date.now() - signStartedAt

    const uploadStartedAt = Date.now()
    const fileBytes = await readFile(uploadFile.filePath)
    await uploadFileToSignedUrl(signResponse, fileBytes)
    const uploadMs = Date.now() - uploadStartedAt

    const finaliseStartedAt = Date.now()
    const result = await finaliseRemoteUpload(apiBaseUrl, signResponse.releaseId, {
      skipSnapshotCleanup: options.skipSnapshotCleanup,
    })
    const finaliseMs = Date.now() - finaliseStartedAt

    return attachUploadTimings(result, {
      fileBytes: fileStats.size,
      finaliseMs,
      signMs,
      totalMs: Date.now() - dispatchStartedAt,
      uploadMs,
    })
  } finally {
    await uploadFile.cleanup()
  }
}

export function getUploadDispatchTimings(
  value: Record<string, unknown> | undefined,
): UploadDispatchTimings | null {
  const timings = value?.[UPLOAD_TIMINGS_KEY]

  if (typeof timings !== 'object' || timings === null || Array.isArray(timings)) {
    return null
  }

  const candidate = timings as UploadDispatchTimings

  return typeof candidate.fileBytes === 'number' &&
    typeof candidate.finaliseMs === 'number' &&
    typeof candidate.signMs === 'number' &&
    typeof candidate.totalMs === 'number' &&
    typeof candidate.uploadMs === 'number'
    ? candidate
    : null
}

function attachUploadTimings<T extends UploadResponse>(
  result: T,
  timings: UploadDispatchTimings,
) {
  return {
    ...result,
    [UPLOAD_TIMINGS_KEY]: timings,
  }
}

async function registerLocalUpload(
  target: UploadTarget,
  registerOptions: CliUploadOptions,
  previewResult: UploadPreviewResult,
  options: DispatchUploadOptions,
) {
  const shardYear = resolveShardYear(
    previewResult.plan.cohortKey,
    previewResult.plan.sourceVersion,
  )

  const resolveLocalDbContext =
    options.resolveLocalDbContext ?? resolveLocalAddressDbContext
  const dbContext = await resolveLocalDbContext(
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
    const resolveSchemaFingerprint = createLocalSchemaFingerprintResolver(metaDb)
    const allowExistingDatasetStatuses: ReleaseStatus[] | undefined = options.force
      ? ['uploading']
      : undefined
    const uploadOptions = {
      ...registerOptions,
      filePath: previewResult.plan.fileName,
      originalFileName: previewResult.plan.originalFileName,
      regionCode: previewResult.plan.regionCode,
      shardYear,
      cohortKey: previewResult.plan.cohortKey,
      source: previewResult.plan.source,
      sourceVersion: previewResult.plan.sourceVersion,
      releaseNotesUrl: previewResult.plan.releaseNotesUrl,
      theme: previewResult.plan.theme,
      type: previewResult.plan.type,
      inspection: previewResult.inspection,
      resolveSchemaFingerprint,
      allowExistingDatasetStatuses,
    }
    const requestLocalUpload = options.requestLocalUpload ?? coreRequestLocalUpload
    const finaliseLocalUpload = options.finaliseLocalUpload ?? coreFinaliseLocalUpload
    const requested = await requestLocalUpload(metaDb, uploadOptions)
    const finalised = await finaliseLocalUpload(metaDb, {
      ...uploadOptions,
      rawObjectKey: requested.rawObjectKey,
    })

    return {
      datasetId: finalised.datasetId,
      datasetCode: finalised.plan.datasetCode,
      rawObjectKey: finalised.rawObjectKey,
      releaseCode: finalised.plan.releaseCode,
      releaseId: finalised.releaseId,
      rowCount: finalised.plan.rowCount,
      source: finalised.plan.source,
      sourceVersion: finalised.plan.sourceVersion,
      status: 'staged',
      type: finalised.plan.type,
    }
  } finally {
    dbContext.cleanup()
  }
}

function createLocalSchemaFingerprintResolver(db: HarbourReadableDb) {
  return async (_rawObjectKey: string, releaseCode?: string) => {
    if (!releaseCode) {
      return null
    }

    const row = await db
      .select({
        stats: metaSchema.ingestRuns.stats,
      })
      .from(metaSchema.ingestRuns)
      .innerJoin(
        metaSchema.metaReleases,
        eq(metaSchema.ingestRuns.releaseId, metaSchema.metaReleases.id),
      )
      .where(
        and(
          eq(metaSchema.metaReleases.code, releaseCode),
          eq(metaSchema.ingestRuns.phase, 'requestUpload'),
        ),
      )
      .limit(1)
      .get()

    return readSchemaFingerprint(row?.stats)
  }
}

function readSchemaFingerprint(stats: unknown) {
  const parsed = typeof stats === 'string' ? parseStatsJson(stats) : stats

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

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

async function requestSignedUpload(
  apiBaseUrl: string,
  previewResult: UploadPreviewResult,
  fileSize: number,
  schemaVersionId: string,
  options: DispatchUploadOptions,
) {
  const shardYear = resolveShardYear(
    previewResult.plan.cohortKey,
    previewResult.plan.sourceVersion,
  )
  const response = await fetch(buildSignUploadEndpoint(apiBaseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      fileName: previewResult.plan.fileName,
      contentType: 'application/octet-stream',
      fileSize,
      inspection: previewResult.inspection,
      plan: {
        regionCode: previewResult.plan.regionCode,
        shardYear,
        source: previewResult.plan.source,
        sourceVersion: previewResult.plan.sourceVersion,
        releaseNotesUrl: previewResult.plan.releaseNotesUrl,
        cohortKey: previewResult.plan.cohortKey,
        theme: previewResult.plan.theme,
        type: previewResult.plan.type,
      },
      force: Boolean(options.force),
      skipSnapshotCleanup: Boolean(options.skipSnapshotCleanup),
      schemaVersionId,
    }),
  })

  try {
    return await parseJsonResponse<SignUploadResponse>(response, 'Harbour signUpload')
  } catch (error) {
    throw appendForceUploadDeploymentHint(error, options)
  }
}

async function uploadFileToSignedUrl(
  signResponse: SignUploadResponse,
  fileBytes: Uint8Array,
) {
  const response = await fetch(signResponse.uploadUrl, {
    method: signResponse.uploadMethod,
    headers: filterSignedUploadHeaders(
      signResponse.uploadUrl,
      signResponse.uploadHeaders,
    ),
    body: fileBytes,
  })

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '')
    const detail = responseBody.trim()

    throw new Error(
      detail
        ? `R2 upload failed with status ${response.status}: ${detail}`
        : `R2 upload failed with status ${response.status}.`,
    )
  }
}

function filterSignedUploadHeaders(uploadUrl: string, headers: Record<string, string>) {
  const signedHeaders = new URL(uploadUrl).searchParams.get('X-Amz-SignedHeaders')

  if (!signedHeaders) {
    return headers
  }

  const allowedHeaders = new Set(
    signedHeaders
      .split(';')
      .map(header => header.trim().toLowerCase())
      .filter(header => header && header !== 'host'),
  )

  return Object.fromEntries(
    Object.entries(headers).filter(([header]) =>
      allowedHeaders.has(header.toLowerCase()),
    ),
  )
}

async function finaliseRemoteUpload(
  apiBaseUrl: string,
  releaseId: string,
  options: Pick<DispatchUploadOptions, 'skipSnapshotCleanup'> = {},
) {
  return postReleaseAction(
    buildFinaliseUploadEndpoint(apiBaseUrl),
    releaseId,
    'Harbour finaliseUpload',
    options,
  )
}

async function postReleaseAction(
  endpoint: string,
  releaseId: string,
  action: string,
  options: Pick<DispatchUploadOptions, 'force' | 'skipSnapshotCleanup'> = {},
) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      ...(options.force ? { force: true } : {}),
      releaseId,
      ...(options.skipSnapshotCleanup ? { skipSnapshotCleanup: true } : {}),
    }),
  })

  return parseJsonResponse<UploadResponse>(response, action)
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

function appendForceUploadDeploymentHint(
  error: unknown,
  options: DispatchUploadOptions,
) {
  if (
    options.force &&
    error instanceof Error &&
    error.message.startsWith('Dataset already exists with status uploading: ')
  ) {
    return new Error(
      [
        error.message,
        '',
        '`--force` was sent by the CLI, but the Harbour API still rejected the uploading release.',
        'Deploy harbour-api to this target so /v1/signUpload supports forced upload-session replacement.',
      ].join('\n'),
    )
  }

  return error
}
