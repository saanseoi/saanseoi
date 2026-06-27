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
) {
  const apiBaseUrl = resolveHarbourApiUrl(target)

  if (!target.remote) {
    return uploadFileViaWorker(apiBaseUrl, registerOptions, previewResult)
  }

  const fileBytes = await readFile(registerOptions.filePath)
  const fileStats = await stat(registerOptions.filePath)
  const signResponse = await requestSignedUpload(
    apiBaseUrl,
    previewResult,
    fileStats.size,
    schemaVersionId,
  )

  await uploadFileToSignedUrl(signResponse, fileBytes)

  return finalizeUpload(apiBaseUrl, signResponse.releaseId)
}

async function uploadFileViaWorker(
  apiBaseUrl: string,
  registerOptions: CliUploadOptions,
  previewResult: UploadPreviewResult,
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
      schemaVersionId,
    }),
  })

  return parseJsonResponse<SignUploadResponse>(response, 'Harbour signUpload')
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
