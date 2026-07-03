import { normalizeBaseUrl } from '@repo/core'
import { isRetryableSqliteWriteError } from '@repo/core/pipeline/utils'

import { getAuthHeaders, resolveHarbourApiUrl } from './api.ts'
import type { UploadTarget } from './options.ts'

type StagePayload = {
  releaseCode?: string
  releaseId?: string
  error?: string
  phase: string
  stats?: Record<string, unknown>
}

type PublishPayload = {
  releaseCode?: string
  releaseId?: string
  skipSnapshotCleanup?: boolean
}

const CONTROL_REQUEST_RETRY_LIMIT = 3
const CONTROL_REQUEST_RETRY_DELAY_MS = 150
const TRANSIENT_CONTROL_RESPONSE_STATUSES = new Set([429, 502, 503, 504])

export type HarbourControlRetryEvent = {
  attempt: number
  delayMs: number
  error: unknown
  maxRetries: number
  path: string
}

type HarbourControlClientOptions = {
  onRetry?: (event: HarbourControlRetryEvent) => void | Promise<void>
}

class RetryableControlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RetryableControlError'
  }
}

export function createHarbourControlClient(
  target: UploadTarget,
  clientOptions: HarbourControlClientOptions = {},
) {
  const baseUrl = normalizeBaseUrl(resolveHarbourApiUrl(target))
  const authHeaders = getAuthHeaders()

  return {
    publishDataset(
      releaseId: string,
      releaseCode?: string,
      publishOptions: { skipSnapshotCleanup?: boolean } = {},
    ) {
      return postControl(
        baseUrl,
        authHeaders,
        '/v1/control/publishDataset',
        {
          releaseCode,
          releaseId,
          ...(publishOptions.skipSnapshotCleanup ? { skipSnapshotCleanup: true } : {}),
        },
        clientOptions,
      )
    },
    stageCompleted(
      releaseId: string,
      phase: string,
      stats?: Record<string, unknown>,
      releaseCode?: string,
    ) {
      return postControl(
        baseUrl,
        authHeaders,
        '/v1/control/stageCompleted',
        {
          releaseCode,
          releaseId,
          phase,
          stats,
        },
        clientOptions,
      )
    },
    stageFailed(
      releaseId: string,
      phase: string,
      error: string,
      stats?: Record<string, unknown>,
      releaseCode?: string,
    ) {
      return postControl(
        baseUrl,
        authHeaders,
        '/v1/control/stageFailed',
        {
          releaseCode,
          releaseId,
          error,
          phase,
          stats,
        },
        clientOptions,
      )
    },
    stageRunning(
      releaseId: string,
      phase: string,
      stats?: Record<string, unknown>,
      releaseCode?: string,
    ) {
      return postControl(
        baseUrl,
        authHeaders,
        '/v1/control/stageRunning',
        {
          releaseCode,
          releaseId,
          phase,
          stats,
        },
        clientOptions,
      )
    },
  }
}

async function postControl(
  baseUrl: string,
  authHeaders: Record<string, string>,
  path: string,
  payload: StagePayload | PublishPayload,
  options: HarbourControlClientOptions,
  attempt = 0,
) {
  let response: Response

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...authHeaders,
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    if (!isRetryableControlError(error) || attempt >= CONTROL_REQUEST_RETRY_LIMIT) {
      throw error
    }

    const delayMs = CONTROL_REQUEST_RETRY_DELAY_MS * (attempt + 1)
    await options.onRetry?.({
      attempt: attempt + 1,
      delayMs,
      error,
      maxRetries: CONTROL_REQUEST_RETRY_LIMIT,
      path,
    })
    await sleep(delayMs)
    return postControl(baseUrl, authHeaders, path, payload, options, attempt + 1)
  }

  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (!response.ok) {
    const message =
      typeof body?.message === 'string'
        ? body.message
        : `Harbour control request failed with status ${response.status}.`

    const error =
      TRANSIENT_CONTROL_RESPONSE_STATUSES.has(response.status) ||
      isRetryableSqliteWriteError(new Error(message))
        ? new RetryableControlError(message)
        : new Error(message)

    if (!isRetryableControlError(error) || attempt >= CONTROL_REQUEST_RETRY_LIMIT) {
      throw error
    }

    const delayMs = CONTROL_REQUEST_RETRY_DELAY_MS * (attempt + 1)
    await options.onRetry?.({
      attempt: attempt + 1,
      delayMs,
      error,
      maxRetries: CONTROL_REQUEST_RETRY_LIMIT,
      path,
    })
    await sleep(delayMs)
    return postControl(baseUrl, authHeaders, path, payload, options, attempt + 1)
  }
}

function isRetryableControlError(error: unknown) {
  if (error instanceof RetryableControlError) {
    return true
  }

  if (!(error instanceof Error)) {
    return false
  }

  return /network connection lost|fetch failed|econnreset|socket closed|connection reset/i.test(
    error.message,
  )
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
