export type D1ImportFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type D1ImportClientOptions = {
  accountId: string
  apiToken: string
  databaseId: string
  fetch?: D1ImportFetch
  uploadRetryDelayMs?: number
  uploadRetryLimit?: number
}

export type D1ImportInitResult = {
  atBookmark?: string
  error?: string
  filename?: string
  messages?: string[]
  status?: string
  success?: boolean
  uploadUrl?: string
}

export type D1ImportIngestResult = {
  atBookmark?: string
  error?: string
  messages?: string[]
  status?: string
  success: boolean
}

export type D1ImportPollResult = {
  atBookmark?: string
  error?: string
  messages?: string[]
  status?: string
  success: boolean
}

export type D1ImportSqlOptions = {
  etag: string
  pollIntervalMs?: number
  sql: string | ArrayBuffer | Uint8Array
}

type CloudflareApiResponse<T> = {
  errors?: Array<{ code?: number; message?: string }>
  messages?: Array<{ code?: number; message?: string }>
  result?: T
  success?: boolean
}

const DEFAULT_POLL_INTERVAL_MS = 1000
const DEFAULT_BUSY_INIT_RETRY_LIMIT = 300
const DEFAULT_STORAGE_RESET_RETRY_LIMIT = 3
const DEFAULT_UPLOAD_RETRY_LIMIT = 5
const DEFAULT_UPLOAD_RETRY_DELAY_MS = 1000

export function createD1ImportClient(options: D1ImportClientOptions) {
  const fetchImpl = options.fetch ?? fetch
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/d1/database/${options.databaseId}/import`
  const uploadRetryDelayMs = normaliseRetryNumber(
    options.uploadRetryDelayMs,
    DEFAULT_UPLOAD_RETRY_DELAY_MS,
  )
  const uploadRetryLimit = normaliseRetryNumber(
    options.uploadRetryLimit,
    DEFAULT_UPLOAD_RETRY_LIMIT,
  )
  const headers = {
    Authorization: `Bearer ${options.apiToken}`,
    'Content-Type': 'application/json',
  }

  async function postImport<T>(body: Record<string, unknown>) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
    const payload = (await response.json()) as CloudflareApiResponse<T>

    if (!response.ok || payload.success === false || !payload.result) {
      const details =
        payload.errors
          ?.map(error => error.message ?? String(error.code ?? 'unknown_error'))
          .join('; ') || response.statusText

      throw new Error(`D1 import API request failed: ${details}`)
    }

    return payload.result
  }

  return {
    async init(etag: string): Promise<D1ImportInitResult> {
      const result = await postImport<{
        at_bookmark?: string
        error?: string
        filename?: string
        messages?: string[]
        status?: string
        success?: boolean
        upload_url?: string
      }>({
        action: 'init',
        etag,
      })

      return {
        atBookmark: result.at_bookmark,
        error: result.error,
        filename: result.filename,
        messages: result.messages,
        status: result.status,
        success: result.success,
        uploadUrl: normaliseUploadUrl(result.upload_url),
      }
    },

    async upload(uploadUrl: string, sql: string | ArrayBuffer | Uint8Array) {
      let lastError: unknown = null
      // `Uint8Array` may be backed by a SharedArrayBuffer, which is not accepted
      // by the DOM's `BodyInit` type. Copy it into an ordinary ArrayBuffer first.
      const body = sql instanceof Uint8Array ? new Uint8Array(sql).buffer : sql

      for (let attempt = 0; attempt <= uploadRetryLimit; attempt += 1) {
        try {
          const response = await fetchImpl(uploadUrl, {
            method: 'PUT',
            body,
          })

          if (response.ok) {
            return response.headers.get('ETag')?.replaceAll('"', '') ?? null
          }

          if (
            !isRetryableUploadStatus(response.status) ||
            attempt >= uploadRetryLimit
          ) {
            throw new Error(
              `D1 import upload failed: ${formatUploadResponse(response)}`,
            )
          }

          lastError = new Error(
            `D1 import upload failed: ${formatUploadResponse(response)}`,
          )
        } catch (error) {
          lastError = error

          if (!isRetryableUploadError(error) || attempt >= uploadRetryLimit) {
            throw error
          }
        }

        await sleep(uploadRetryDelayMs * 2 ** attempt)
      }

      throw lastError instanceof Error ? lastError : new Error(String(lastError))
    },

    async ingest(filename: string, etag: string): Promise<D1ImportIngestResult> {
      const result = await postImport<{
        at_bookmark?: string
        error?: string
        messages?: string[]
        status?: string
        success: boolean
      }>({
        action: 'ingest',
        etag,
        filename,
      })

      return {
        atBookmark: result.at_bookmark,
        error: result.error,
        messages: result.messages,
        status: result.status,
        success: result.success,
      }
    },

    async poll(currentBookmark: string): Promise<D1ImportPollResult> {
      const result = await postImport<{
        at_bookmark?: string
        error?: string
        messages?: string[]
        status?: string
        success: boolean
      }>({
        action: 'poll',
        current_bookmark: currentBookmark,
      })

      return {
        atBookmark: result.at_bookmark,
        error: result.error,
        messages: result.messages,
        status: result.status,
        success: result.success,
      }
    },

    async importSql(options: D1ImportSqlOptions) {
      const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS
      let storageResetAttempts = 0

      restartImport: while (true) {
        let init = await this.init(options.etag)
        let uploadedEtag: string | null = null
        let poll: D1ImportPollResult
        let currentBookmark: string
        let busyInitAttempts = 0

        while (isBusyImportPollWithoutBookmark(init)) {
          if (busyInitAttempts >= DEFAULT_BUSY_INIT_RETRY_LIMIT) {
            throw new Error(
              `D1 import is still busy after ${DEFAULT_BUSY_INIT_RETRY_LIMIT} retries: ${formatInitState(init)}`,
            )
          }

          busyInitAttempts += 1
          await sleep(pollIntervalMs)
          init = await this.init(options.etag)
        }

        if (init.uploadUrl && init.filename) {
          uploadedEtag = await this.upload(init.uploadUrl, options.sql)

          if (uploadedEtag && uploadedEtag !== options.etag) {
            throw new Error(
              `D1 import upload ETag mismatch: expected ${options.etag}, received ${uploadedEtag}.`,
            )
          }

          const ingest = await this.ingest(init.filename, options.etag)
          currentBookmark = ingest.atBookmark?.trim() ?? ''
          poll = ingest
        } else if (isImportPollResult(init)) {
          currentBookmark = init.atBookmark ?? ''
          poll = {
            atBookmark: init.atBookmark,
            error: init.error,
            messages: init.messages,
            status: init.status,
            success: init.success ?? false,
          }
        } else {
          throw new Error(
            'D1 import init response did not include an upload URL or poll status.',
          )
        }

        while (
          !isImportComplete(poll) &&
          poll.error !== 'Not currently importing anything.'
        ) {
          if (isBusyImportPollWithoutBookmark(poll)) {
            await sleep(pollIntervalMs)
            continue
          }

          if (
            isStorageResetImportPollWithoutBookmark(poll) &&
            storageResetAttempts < DEFAULT_STORAGE_RESET_RETRY_LIMIT
          ) {
            storageResetAttempts += 1
            await sleep(pollIntervalMs)
            continue restartImport
          }

          const nextBookmark = poll.atBookmark?.trim() || currentBookmark

          if (!nextBookmark) {
            throw new Error(
              `D1 import poll response did not include a bookmark for an incomplete import: ${formatPollState(poll)}`,
            )
          }

          await sleep(pollIntervalMs)
          poll = await this.poll(nextBookmark)
          currentBookmark = poll.atBookmark?.trim() || nextBookmark
        }

        return {
          filename: init.filename ?? null,
          poll,
          uploadedEtag,
        }
      }
    },
  }
}

function isImportComplete(poll: D1ImportPollResult) {
  return poll.status === 'complete' || (poll.success && !poll.status)
}

function isRetryableUploadStatus(status: number) {
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  )
}

function isRetryableUploadError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  return /network|fetch|timeout|timed out|connection|ECONNRESET|EAI_AGAIN|Bad Gateway|Service Unavailable|Gateway Timeout/i.test(
    error.message,
  )
}

function formatUploadResponse(response: Response) {
  const statusText = response.statusText.trim()

  return statusText ? `${response.status} ${statusText}` : String(response.status)
}

function normaliseRetryNumber(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback
}

function normaliseUploadUrl(value: string | undefined) {
  const normalised = value?.trim()

  return normalised ? normalised : undefined
}

function isImportPollResult(result: D1ImportInitResult) {
  return (
    typeof result.success === 'boolean' ||
    typeof result.status === 'string' ||
    typeof result.error === 'string'
  )
}

function isBusyImportPollWithoutBookmark(
  result: Pick<D1ImportInitResult, 'atBookmark' | 'error' | 'success'>,
) {
  return (
    result.success === false &&
    !result.atBookmark?.trim() &&
    /currently processing a long-running import/i.test(result.error ?? '')
  )
}

function isStorageResetImportPollWithoutBookmark(
  result: Pick<D1ImportPollResult, 'atBookmark' | 'error' | 'success'>,
) {
  const error = result.error ?? ''

  return (
    result.success === false &&
    !result.atBookmark?.trim() &&
    (/D1 DB storage operation exceeded timeout which caused object to be reset/i.test(
      error,
    ) ||
      /D1_RESET_DO/i.test(error) ||
      parsesAsD1ResetMarker(error))
  )
}

function parsesAsD1ResetMarker(value: string) {
  try {
    const parsed = JSON.parse(value) as { D1_RESET_DO?: unknown }

    return parsed.D1_RESET_DO === true
  } catch {
    return false
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function formatPollState(poll: D1ImportPollResult) {
  return JSON.stringify({
    error: poll.error ?? null,
    messages: poll.messages ?? [],
    status: poll.status ?? null,
    success: poll.success,
  })
}

function formatInitState(init: D1ImportInitResult) {
  return JSON.stringify({
    error: init.error ?? null,
    messages: init.messages ?? [],
    status: init.status ?? null,
    success: init.success ?? null,
  })
}
