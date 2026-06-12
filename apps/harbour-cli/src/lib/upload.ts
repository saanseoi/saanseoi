import { readFile, stat } from 'node:fs/promises'

import type { prepareUpload } from '@repo/core/upload-local'

import type { CliUploadOptions, ParsedArgs, UploadTarget } from './options.ts'

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

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

export function resolveHarbourBaseUrl(target: UploadTarget) {
  switch (target.environment) {
    case 'dev':
      return 'http://localhost:8788'
    case 'preview':
      return 'https://ss-harbour-preview.hypehk.workers.dev'
    case 'production':
      return 'https://ss-harbour-production.hypehk.workers.dev'
  }
}

export function resolveHarbourApiUrl(args: ParsedArgs, target: UploadTarget) {
  const explicitUrl =
    typeof args.options.api === 'string' ? args.options.api.trim() : undefined

  if (explicitUrl) {
    return normalizeBaseUrl(explicitUrl)
  }

  const genericBaseUrl =
    process.env.HARBOUR_BASE_URL?.trim() ?? process.env.HARBOUR_API_URL?.trim()

  switch (target.environment) {
    case 'dev':
      return normalizeBaseUrl(
        process.env.HARBOUR_BASE_URL_DEV?.trim() ??
          process.env.HARBOUR_API_URL_DEV?.trim() ??
          genericBaseUrl ??
          resolveHarbourBaseUrl(target),
      )
    case 'preview':
      return normalizeBaseUrl(
        process.env.HARBOUR_BASE_URL_PREVIEW?.trim() ??
          process.env.HARBOUR_API_URL_PREVIEW?.trim() ??
          genericBaseUrl ??
          resolveHarbourBaseUrl(target),
      )
    case 'production':
      return normalizeBaseUrl(
        process.env.HARBOUR_BASE_URL_PRODUCTION?.trim() ??
          process.env.HARBOUR_API_URL_PRODUCTION?.trim() ??
          genericBaseUrl ??
          resolveHarbourBaseUrl(target),
      )
  }
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

function getAuthHeaders() {
  const apiKey = process.env.HARBOUR_API_KEY?.trim()

  if (!apiKey) {
    throw new Error('Missing HARBOUR_API_KEY for authenticated Harbour API requests.')
  }

  return {
    'x-api-key': apiKey,
  }
}

export async function dispatchUpload(
  args: ParsedArgs,
  target: UploadTarget,
  registerOptions: CliUploadOptions,
  previewResult: UploadPreviewResult,
  schemaVersionId: string,
) {
  const apiBaseUrl = resolveHarbourApiUrl(args, target)

  if (!apiBaseUrl) {
    const envSuffix =
      target.environment === 'preview'
        ? '_PREVIEW'
        : target.environment === 'production'
          ? '_PRODUCTION'
          : '_DEV'

    throw new Error(
      `Missing Harbour API URL for ${target.environment}. Pass --api or set HARBOUR_API_URL${envSuffix}.`,
    )
  }

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
  const fileBytes = await readFile(registerOptions.filePath)
  const formData = new FormData()
  const file = new File([fileBytes], previewResult.plan.fileName, {
    type: 'application/octet-stream',
  })

  formData.set('file', file)
  formData.set('regionCode', previewResult.plan.regionCode)
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
  const response = await fetch(buildFinalizeUploadEndpoint(apiBaseUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      releaseId,
    }),
  })

  return parseJsonResponse<Record<string, unknown>>(response, 'Harbour finalizeUpload')
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
