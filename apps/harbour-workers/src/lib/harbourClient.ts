type StagePayload = {
  releaseId: string
  error?: string
  phase: string
  stats?: Record<string, unknown>
}

export type HarbourControlApiConfig = {
  apiKey: string
  baseUrl: string
}

const CONTROL_REQUEST_RETRY_LIMIT = 3
const CONTROL_REQUEST_RETRY_DELAY_MS = 150
const TRANSIENT_CONTROL_RESPONSE_STATUSES = new Set([429, 502, 503, 504])

class RetryableControlError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RetryableControlError'
  }
}

export function createHarbourClient(config: HarbourControlApiConfig) {
  const baseUrl = normalizeBaseUrl(config.baseUrl)
  const apiKey = config.apiKey.trim()

  if (!baseUrl) {
    throw new Error('Missing Harbour API base URL.')
  }

  if (!apiKey) {
    throw new Error('Missing Harbour API key.')
  }

  return {
    publishDataset(releaseId: string) {
      return postControl(baseUrl, apiKey, '/v1/control/publishDataset', {
        releaseId,
      })
    },
    stageCompleted(releaseId: string, phase: string, stats?: Record<string, unknown>) {
      return postControl(baseUrl, apiKey, '/v1/control/stageCompleted', {
        releaseId,
        phase,
        stats,
      })
    },
    stageFailed(
      releaseId: string,
      phase: string,
      error: string,
      stats?: Record<string, unknown>,
    ) {
      return postControl(baseUrl, apiKey, '/v1/control/stageFailed', {
        releaseId,
        error,
        phase,
        stats,
      })
    },
    stageStarted(releaseId: string, phase: string, stats?: Record<string, unknown>) {
      return postControl(baseUrl, apiKey, '/v1/control/stageStarted', {
        releaseId,
        phase,
        stats,
      })
    },
  }
}

async function postControl(
  baseUrl: string,
  apiKey: string,
  path: string,
  payload: StagePayload | { releaseId: string },
  attempt = 0,
) {
  let response: Response

  try {
    response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    if (!isRetryableControlError(error) || attempt >= CONTROL_REQUEST_RETRY_LIMIT) {
      throw error
    }

    await sleep(CONTROL_REQUEST_RETRY_DELAY_MS * (attempt + 1))
    return postControl(baseUrl, apiKey, path, payload, attempt + 1)
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

    const error = TRANSIENT_CONTROL_RESPONSE_STATUSES.has(response.status)
      ? new RetryableControlError(message)
      : new Error(message)

    if (!isRetryableControlError(error) || attempt >= CONTROL_REQUEST_RETRY_LIMIT) {
      throw error
    }

    await sleep(CONTROL_REQUEST_RETRY_DELAY_MS * (attempt + 1))
    return postControl(baseUrl, apiKey, path, payload, attempt + 1)
  }
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '')
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

export const __test__ = {
  isRetryableControlError,
}
