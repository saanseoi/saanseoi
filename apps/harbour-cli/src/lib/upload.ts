import { readFile, stat } from 'node:fs/promises'

import { isReleaseId } from '@repo/core'
import type { prepareUpload } from '@repo/core/upload-local'

import { getAuthHeaders, resolveHarbourApiUrl } from './api.ts'
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
type DispatchUploadOptions = {
  force?: boolean
}
const TRANSIENT_UPLOAD_RESPONSE_STATUSES = new Set([502, 503, 504])
const DIRECT_UPLOAD_RETRY_LIMIT = 2
const DIRECT_UPLOAD_RETRY_DELAY_MS = 250
const DIRECT_UPLOAD_RECOVERY_POLL_LIMIT = 8
const DIRECT_UPLOAD_RECOVERY_POLL_DELAY_MS = 500

function resolveShardYear(snapshotMonth: string, sourceVersion: string) {
  const snapshotYear = snapshotMonth.slice(0, 4)
  const sourceYear = sourceVersion.slice(0, 4)

  if (!/^\d{4}$/.test(snapshotYear) || !/^\d{4}$/.test(sourceYear)) {
    throw new Error(
      `Could not resolve shard year from snapshotMonth=${snapshotMonth} and sourceVersion=${sourceVersion}.`,
    )
  }

  if (snapshotYear !== sourceYear) {
    throw new Error(
      `Shard year mismatch: snapshotMonth=${snapshotMonth} and sourceVersion=${sourceVersion} point to different years.`,
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

export function buildRequeueUploadEndpoint(apiBaseUrl: string) {
  return `${apiBaseUrl}/v1/requeueUpload`
}

export async function dispatchUpload(
  target: UploadTarget,
  registerOptions: CliUploadOptions,
  previewResult: UploadPreviewResult,
  schemaVersionId: string,
  options: DispatchUploadOptions = {},
) {
  const apiBaseUrl = resolveHarbourApiUrl(target)

  if (!target.remote) {
    await assertLocalDirectUploadCanProceed(target, previewResult, options.force)
    return uploadFileViaWorker(
      apiBaseUrl,
      target,
      registerOptions,
      previewResult,
      options,
    )
  }

  const fileBytes = await readFile(registerOptions.filePath)
  const fileStats = await stat(registerOptions.filePath)
  const signResponse = await requestSignedUpload(
    apiBaseUrl,
    previewResult,
    fileStats.size,
    schemaVersionId,
    options,
  )

  await uploadFileToSignedUrl(signResponse, fileBytes)

  return finalizeUpload(apiBaseUrl, signResponse.releaseId)
}

async function uploadFileViaWorker(
  apiBaseUrl: string,
  target: UploadTarget,
  registerOptions: CliUploadOptions,
  previewResult: UploadPreviewResult,
  options: DispatchUploadOptions,
  attempt = 0,
) {
  const shardYear = resolveShardYear(
    previewResult.plan.snapshotMonth,
    previewResult.plan.sourceVersion,
  )
  const fileBytes = await readFile(registerOptions.filePath)
  const formData = new FormData()
  const file = new File([fileBytes], previewResult.plan.fileName, {
    type: 'application/octet-stream',
  })

  formData.set('file', file)
  formData.set('regionCode', previewResult.plan.regionCode)
  formData.set('shardYear', shardYear)
  formData.set('snapshotMonth', previewResult.plan.snapshotMonth)
  formData.set('theme', previewResult.plan.theme)
  formData.set('type', previewResult.plan.type)
  formData.set('source', previewResult.plan.source)
  formData.set('sourceVersion', previewResult.plan.sourceVersion)
  if (options.force) {
    formData.set('force', 'true')
  }

  let response: Response

  try {
    response = await fetch(buildDirectUploadEndpoint(apiBaseUrl), {
      method: 'POST',
      body: formData,
      headers: getAuthHeaders(),
    })
  } catch (error) {
    if (attempt >= DIRECT_UPLOAD_RETRY_LIMIT) {
      throw error
    }

    const recovered = await tryRecoverDirectUpload(
      target,
      previewResult.plan.releaseCode,
    )

    if (recovered) {
      return recovered
    }

    await sleep(DIRECT_UPLOAD_RETRY_DELAY_MS * (attempt + 1))
    return uploadFileViaWorker(
      apiBaseUrl,
      target,
      registerOptions,
      previewResult,
      options,
      attempt + 1,
    )
  }

  if (response.ok) {
    return parseJsonResponse<Record<string, unknown>>(response, 'Harbour upload')
  }

  if (
    TRANSIENT_UPLOAD_RESPONSE_STATUSES.has(response.status) &&
    attempt < DIRECT_UPLOAD_RETRY_LIMIT
  ) {
    const recovered = await tryRecoverDirectUpload(
      target,
      previewResult.plan.releaseCode,
    )

    if (recovered) {
      return recovered
    }

    await sleep(DIRECT_UPLOAD_RETRY_DELAY_MS * (attempt + 1))
    return uploadFileViaWorker(
      apiBaseUrl,
      target,
      registerOptions,
      previewResult,
      options,
      attempt + 1,
    )
  }

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
    previewResult.plan.snapshotMonth,
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
        snapshotMonth: previewResult.plan.snapshotMonth,
        theme: previewResult.plan.theme,
        type: previewResult.plan.type,
      },
      force: Boolean(options.force),
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
    headers: signResponse.uploadHeaders,
    body: fileBytes,
  })

  if (!response.ok) {
    throw new Error(`R2 upload failed with status ${response.status}.`)
  }
}

async function finalizeUpload(apiBaseUrl: string, releaseId: string) {
  return postReleaseAction(
    buildFinalizeUploadEndpoint(apiBaseUrl),
    releaseId,
    'Harbour finalizeUpload',
  )
}

async function requeueUpload(apiBaseUrl: string, releaseId: string) {
  return postReleaseAction(
    buildRequeueUploadEndpoint(apiBaseUrl),
    releaseId,
    'Harbour requeueUpload',
  )
}

async function postReleaseAction(endpoint: string, releaseId: string, action: string) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      releaseId,
    }),
  })

  return parseJsonResponse<UploadResponse>(response, action)
}

async function tryRecoverDirectUpload(
  target: UploadTarget,
  releaseCode: string,
): Promise<UploadResponse | null> {
  for (let attempt = 0; attempt < DIRECT_UPLOAD_RECOVERY_POLL_LIMIT; attempt += 1) {
    try {
      const report = await fetchReleaseReport(target, {
        limit: 1,
        releaseCode,
      })
      const release = report.rows[0]

      if (
        release &&
        ['staged', 'processing', 'published', 'superseded'].includes(release.status)
      ) {
        return {
          datasetCode: release.datasetCode,
          datasetId: release.datasetId,
          rawObjectKey: release.rawObjectKey,
          releaseCode: release.releaseCode,
          releaseId: release.releaseId,
          source: release.source,
          sourceVersion: release.sourceVersion,
          status: release.status,
          type: release.type,
        }
      }
    } catch {
      // Ignore report probe failures and keep polling within the recovery window.
    }

    if (attempt < DIRECT_UPLOAD_RECOVERY_POLL_LIMIT - 1) {
      await sleep(DIRECT_UPLOAD_RECOVERY_POLL_DELAY_MS)
    }
  }

  return null
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

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function resolveRelease(target: UploadTarget, releaseSpecifier: string) {
  const trimmedSpecifier = releaseSpecifier.trim()

  if (!trimmedSpecifier) {
    throw new Error(
      'Missing release identifier. Pass `--release <release-id|release-code>`.',
    )
  }

  const report = await fetchReleaseReport(target, {
    limit: 1,
    ...(isReleaseId(trimmedSpecifier)
      ? { releaseId: trimmedSpecifier }
      : { releaseCode: trimmedSpecifier }),
  })
  const [release] = report.rows

  if (!release) {
    throw new Error(`Release not found: ${trimmedSpecifier}`)
  }

  return release
}

export async function finalizeExistingUpload(
  target: UploadTarget,
  releaseSpecifier: string,
) {
  const release = await resolveRelease(target, releaseSpecifier)

  if (release.status !== 'uploading') {
    if (['staged', 'failed'].includes(release.status)) {
      throw new Error(
        `Release ${release.releaseCode} is already ${release.status}. Use \`upload:requeue\` to enqueue processing again.`,
      )
    }

    throw new Error(
      `Release ${release.releaseCode} is not awaiting upload finalization. Current status: ${release.status}.`,
    )
  }

  const apiBaseUrl = resolveHarbourApiUrl(target)

  const result = await finalizeUpload(apiBaseUrl, release.releaseId)

  return {
    release,
    result,
  }
}

export async function requeueExistingUpload(
  target: UploadTarget,
  releaseSpecifier: string,
) {
  const release = await resolveRelease(target, releaseSpecifier)

  if (!['staged', 'failed'].includes(release.status)) {
    throw new Error(
      `Release ${release.releaseCode} is not requeueable. Current status: ${release.status}.`,
    )
  }

  const apiBaseUrl = resolveHarbourApiUrl(target)
  const result = await requeueUpload(apiBaseUrl, release.releaseId)

  return {
    release,
    result,
  }
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
