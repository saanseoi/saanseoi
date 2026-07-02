export type D1ImportFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type D1ImportClientOptions = {
  accountId: string
  apiToken: string
  databaseId: string
  fetch?: D1ImportFetch
}

export type D1ImportInitResult = {
  filename: string
  uploadUrl: string
}

export type D1ImportIngestResult = {
  atBookmark: string
}

export type D1ImportPollResult = {
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

export function createD1ImportClient(options: D1ImportClientOptions) {
  const fetchImpl = options.fetch ?? fetch
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/d1/database/${options.databaseId}/import`
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
      const result = await postImport<{ filename: string; upload_url: string }>({
        action: 'init',
        etag,
      })

      return {
        filename: result.filename,
        uploadUrl: result.upload_url,
      }
    },

    async upload(uploadUrl: string, sql: string | ArrayBuffer | Uint8Array) {
      const response = await fetchImpl(uploadUrl, {
        method: 'PUT',
        body: sql,
      })

      if (!response.ok) {
        throw new Error(`D1 import upload failed: ${response.statusText}`)
      }

      return response.headers.get('ETag')?.replaceAll('"', '') ?? null
    },

    async ingest(filename: string, etag: string): Promise<D1ImportIngestResult> {
      const result = await postImport<{ at_bookmark: string }>({
        action: 'ingest',
        etag,
        filename,
      })

      return {
        atBookmark: result.at_bookmark,
      }
    },

    async poll(currentBookmark: string): Promise<D1ImportPollResult> {
      const result = await postImport<{
        error?: string
        messages?: string[]
        status?: string
        success: boolean
      }>({
        action: 'poll',
        current_bookmark: currentBookmark,
      })

      return {
        error: result.error,
        messages: result.messages,
        status: result.status,
        success: result.success,
      }
    },

    async importSql(options: D1ImportSqlOptions) {
      const init = await this.init(options.etag)
      const uploadedEtag = await this.upload(init.uploadUrl, options.sql)

      if (uploadedEtag && uploadedEtag !== options.etag) {
        throw new Error(
          `D1 import upload ETag mismatch: expected ${options.etag}, received ${uploadedEtag}.`,
        )
      }

      const ingest = await this.ingest(init.filename, options.etag)
      let poll = await this.poll(ingest.atBookmark)

      while (!poll.success && poll.error !== 'Not currently importing anything.') {
        await new Promise(resolve =>
          setTimeout(resolve, options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS),
        )
        poll = await this.poll(ingest.atBookmark)
      }

      return {
        filename: init.filename,
        poll,
        uploadedEtag,
      }
    },
  }
}
