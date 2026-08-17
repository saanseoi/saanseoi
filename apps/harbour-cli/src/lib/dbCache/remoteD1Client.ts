export type RemoteD1Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type RemoteD1QueryClient = {
  query(sql: string): Promise<Array<Record<string, unknown>>>
}

type CloudflareD1QueryResult = {
  error?: unknown
  results?: Array<Record<string, unknown>>
  success?: boolean
}

type CloudflareD1QueryPayload = {
  errors?: Array<{ code?: number; message?: string }>
  result?: CloudflareD1QueryResult | CloudflareD1QueryResult[]
  success?: boolean
}

const DEFAULT_QUERY_RETRY_LIMIT = 3
const DEFAULT_QUERY_RETRY_DELAY_MS = 250

export function createCloudflareD1QueryClient(options: {
  accountId: string
  apiToken: string
  databaseId: string
  fetch?: RemoteD1Fetch
  retryDelayMs?: number
  retryLimit?: number
}): RemoteD1QueryClient {
  const fetchImpl = options.fetch ?? fetch
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/d1/database/${options.databaseId}/query`
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? DEFAULT_QUERY_RETRY_DELAY_MS)
  const retryLimit = Math.max(0, options.retryLimit ?? DEFAULT_QUERY_RETRY_LIMIT)
  const headers = {
    Authorization: `Bearer ${options.apiToken}`,
    'Content-Type': 'application/json',
  }

  return {
    async query(sql) {
      let lastError: unknown = null

      for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
        let response: Response
        let payload: CloudflareD1QueryPayload
        try {
          response = await fetchImpl(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify({ sql }),
          })
        } catch (error) {
          lastError = error
          if (attempt >= retryLimit) throw error
          await Bun.sleep(retryDelayMs * 2 ** attempt)
          continue
        }

        try {
          payload = (await response.json()) as CloudflareD1QueryPayload
        } catch (error) {
          lastError = error
          if (attempt >= retryLimit) throw error
          await Bun.sleep(retryDelayMs * 2 ** attempt)
          continue
        }

        const result = Array.isArray(payload.result)
          ? payload.result[0]
          : payload.result

        if (
          response.ok &&
          payload.success !== false &&
          result?.success !== false &&
          !result?.error &&
          Array.isArray(result?.results)
        ) {
          return result.results
        }

        const message =
          payload.errors
            ?.map(error => error.message ?? String(error.code ?? 'unknown_error'))
            .join('; ') ||
          (result?.error ? JSON.stringify(result.error) : response.statusText)
        const error = new Error(`D1 query failed: ${message}`)
        lastError = error
        if (!isRetryableStatus(response.status) || attempt >= retryLimit) {
          throw error
        }

        await Bun.sleep(retryDelayMs * 2 ** attempt)
      }

      throw lastError instanceof Error
        ? lastError
        : new Error('D1 query failed without an error detail.')
    },
  }
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}
