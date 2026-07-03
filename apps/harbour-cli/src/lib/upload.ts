import { readFile, stat } from 'node:fs/promises'

import type { ResourceType } from '@repo/core'
import type { prepareUpload } from '@repo/core/uploadLocal'

import { getAuthHeaders, resolveHarbourApiUrl } from './api.ts'
import { prepareUploadFileForDispatch } from './parquetRepack.ts'
import { fetchReleaseReport } from './reporting.ts'
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

type UploadResponse = Record<string, unknown>
export type UploadDispatchTimings = {
  fileBytes: number
  finalizeMs: number
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

export function buildFinalizeUploadEndpoint(apiBaseUrl: string) {
  return `${apiBaseUrl}/v1/finalizeUpload`
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
      await assertLocalDirectUploadCanProceed(target, previewResult, options.force)
      return await uploadFileViaHarbourApi(
        apiBaseUrl,
        uploadFile.filePath,
        previewResult,
        options,
      )
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

    const finalizeStartedAt = Date.now()
    const result = await finalizeUpload(apiBaseUrl, signResponse.releaseId, {
      skipSnapshotCleanup: options.skipSnapshotCleanup,
    })
    const finalizeMs = Date.now() - finalizeStartedAt

    return attachUploadTimings(result, {
      fileBytes: fileStats.size,
      finalizeMs,
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
    typeof candidate.finalizeMs === 'number' &&
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

async function uploadFileViaHarbourApi(
  apiBaseUrl: string,
  filePath: string,
  previewResult: UploadPreviewResult,
  options: DispatchUploadOptions,
) {
  const shardYear = resolveShardYear(
    previewResult.plan.cohortKey,
    previewResult.plan.sourceVersion,
  )
  const fileBytes = await readFile(filePath)
  const formData = new FormData()
  const file = new File([fileBytes], previewResult.plan.fileName, {
    type: 'application/octet-stream',
  })

  formData.set('file', file)
  formData.set('regionCode', previewResult.plan.regionCode)
  formData.set('shardYear', shardYear)
  formData.set('cohortKey', previewResult.plan.cohortKey)
  formData.set('theme', previewResult.plan.theme)
  formData.set('type', previewResult.plan.type)
  formData.set('source', previewResult.plan.source)
  formData.set('sourceVersion', previewResult.plan.sourceVersion)
  if (options.force) {
    formData.set('force', 'true')
  }
  if (options.skipSnapshotCleanup) {
    formData.set('skipSnapshotCleanup', 'true')
  }

  const response = await fetch(buildDirectUploadEndpoint(apiBaseUrl), {
    method: 'POST',
    body: formData,
    headers: getAuthHeaders(),
  })

  return parseJsonResponse<Record<string, unknown>>(response, 'Harbour upload')
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

async function finalizeUpload(
  apiBaseUrl: string,
  releaseId: string,
  options: Pick<DispatchUploadOptions, 'skipSnapshotCleanup'> = {},
) {
  return postReleaseAction(
    buildFinalizeUploadEndpoint(apiBaseUrl),
    releaseId,
    'Harbour finalizeUpload',
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

async function assertLocalDirectUploadCanProceed(
  target: UploadTarget,
  previewResult: UploadPreviewResult,
  force = false,
) {
  try {
    const report = await fetchReleaseReport(target, {
      limit: 1,
      releaseCode: previewResult.plan.releaseCode,
    })
    const release = report.rows[0]

    if (!release || release.status === 'failed') {
      return
    }

    if (force && release.status === 'uploading') {
      return
    }

    throw new Error(
      `Dataset already exists with status ${release.status}: ${previewResult.plan.source}-${previewResult.plan.datasetCode}`,
    )
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith('Dataset already exists with status ')
    ) {
      throw error
    }

    throw error
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
