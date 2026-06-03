import { readFile } from 'node:fs/promises'

import type { prepareUpload } from '@repo/core/upload-local'

import type { CliUploadOptions, ParsedArgs, UploadTarget } from './options.ts'

type UploadPreviewResult = Awaited<ReturnType<typeof prepareUpload>>

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
}

/**
 * Resolve the default Harbour base URL for a given deployment environment.
 */
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

/**
 * Resolve the Harbour API base URL from CLI flags, env overrides, or defaults.
 */
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

/**
 * Build the dataset upload endpoint from a Harbour API base URL.
 */
export function buildUploadEndpoint(apiBaseUrl: string) {
  return `${apiBaseUrl}/v1/uploads`
}

function buildUploadFormData(
  inputFilePath: string,
  previewResult: UploadPreviewResult,
): Promise<FormData> {
  return readFile(inputFilePath).then(fileBytes => {
    const formData = new FormData()
    const fileName = inputFilePath.split(/[\\/]+/).pop() ?? 'upload.parquet'

    formData.set(
      'file',
      new File([fileBytes], fileName, {
        type: 'application/octet-stream',
      }),
    )

    formData.set('type', previewResult.plan.type)
    formData.set('theme', previewResult.plan.theme)
    formData.set('regionCode', previewResult.plan.regionCode)
    formData.set('snapshotMonth', previewResult.plan.snapshotMonth)
    formData.set('source', previewResult.plan.source)
    formData.set('sourceVersion', previewResult.plan.sourceVersion)

    return formData
  })
}

/**
 * Send the prepared parquet file and metadata to the Harbour upload endpoint.
 */
export async function dispatchUpload(
  args: ParsedArgs,
  target: UploadTarget,
  registerOptions: CliUploadOptions,
  previewResult: UploadPreviewResult,
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

  const formData = await buildUploadFormData(registerOptions.filePath, previewResult)
  const uploadEndpoint = buildUploadEndpoint(apiBaseUrl)
  const response = await fetch(uploadEndpoint, {
    method: 'POST',
    body: formData,
  })

  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (!response.ok) {
    const message =
      typeof payload?.message === 'string'
        ? payload.message
        : `Harbour API upload failed with status ${response.status}.`

    throw new Error(message)
  }

  return payload
}
