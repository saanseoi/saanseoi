import { normaliseBaseUrl } from '@repo/core'
import {
  MAX_OBJECT_BYTES,
  hashBytes,
  serialise,
  transferProcessingResult,
  type ObjectRef,
  type ProvenanceStore,
} from '@repo/core/provenance'
import { getAuthHeaders, resolveHarbourApiUrl } from './api'
import type { UploadTarget } from '../cli/options'

const PROVENANCE_UPLOAD_RETRY_LIMIT = 3
const PROVENANCE_UPLOAD_RETRY_DELAY_MS = 250

function isRetryableProvenanceUploadError(error: unknown) {
  return (
    error instanceof Error &&
    /database is locked|sqlite_busy|internal error|network connection lost|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|HTTP (408|429|500|502|503|504)\b/i.test(
      error.message,
    )
  )
}

async function readProvenanceResponse(response: Response) {
  const body = await response.text()
  if (!response.ok) {
    throw new Error(
      `Provenance request failed (HTTP ${response.status}): ${body.slice(0, 1000)}`,
    )
  }
  try {
    return JSON.parse(body)
  } catch {
    throw new Error(
      `Invalid provenance response (HTTP ${response.status}): expected JSON.`,
    )
  }
}

async function uploadProvenanceObject(
  baseUrl: string,
  headers: Record<string, string>,
  hash: string,
  bytes: ArrayBuffer,
) {
  let lastError: unknown

  for (let attempt = 0; attempt <= PROVENANCE_UPLOAD_RETRY_LIMIT; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/v1/provenance/objects/${hash}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: bytes,
      })
      const result = (await readProvenanceResponse(response)) as {
        hash?: string
        byteLength?: number
        error?: string
      }
      if (
        !response.ok ||
        result.hash !== hash ||
        result.byteLength !== bytes.byteLength
      )
        throw new Error(
          result.error ?? `Provenance upload failed (${response.status}).`,
        )
      return
    } catch (error) {
      lastError = error
      if (
        attempt === PROVENANCE_UPLOAD_RETRY_LIMIT ||
        !isRetryableProvenanceUploadError(error)
      )
        throw error
      await new Promise(resolve =>
        setTimeout(resolve, PROVENANCE_UPLOAD_RETRY_DELAY_MS * 2 ** attempt),
      )
    }
  }

  throw lastError
}

async function registerProvenanceResult(
  baseUrl: string,
  headers: Record<string, string>,
  releaseId: string,
  ref: ObjectRef,
) {
  let lastError: unknown

  for (let attempt = 0; attempt <= PROVENANCE_UPLOAD_RETRY_LIMIT; attempt += 1) {
    try {
      const response = await fetch(
        `${baseUrl}/v1/provenance/releases/${encodeURIComponent(releaseId)}`,
        {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: serialise(ref),
        },
      )
      const result = (await readProvenanceResponse(response)) as {
        manifestHash?: string
        error?: string
      }
      if (!response.ok || result.manifestHash !== ref.hash)
        throw new Error(
          result.error ?? `Provenance registration failed (${response.status}).`,
        )
      return
    } catch (error) {
      lastError = error
      if (
        attempt === PROVENANCE_UPLOAD_RETRY_LIMIT ||
        !isRetryableProvenanceUploadError(error)
      )
        throw error
      await new Promise(resolve =>
        setTimeout(resolve, PROVENANCE_UPLOAD_RETRY_DELAY_MS * 2 ** attempt),
      )
    }
  }

  throw lastError
}

/** Upload retained results, never regenerate decisions during delivery/retry. */
export async function deliverProcessingResult(
  target: UploadTarget,
  source: ProvenanceStore,
  ref: ObjectRef,
) {
  const baseUrl = normaliseBaseUrl(resolveHarbourApiUrl(target))
  const headers = getAuthHeaders()
  const destination: ProvenanceStore = {
    // Uploads are idempotent at the content-addressed endpoint. No remote HEAD required.
    async get() {
      return null
    },
    async put(_key, bytes) {
      const hash = await hashBytes(new Uint8Array(bytes))
      await uploadProvenanceObject(baseUrl, headers, hash, bytes)
    },
  }
  // retainObject verifies readback, so provide a bounded cache of acknowledged uploads.
  const acknowledged = new Map<string, ArrayBuffer>()
  const remote: ProvenanceStore = {
    async get(key) {
      const bytes = acknowledged.get(key)
      acknowledged.delete(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      if (bytes.byteLength > MAX_OBJECT_BYTES)
        throw new Error('Provenance object exceeds byte limit.')
      await destination.put(key, bytes)
      acknowledged.set(key, bytes)
    },
  }
  const manifest = await transferProcessingResult(source, remote, ref, {
    concurrency: 4,
  })
  await registerProvenanceResult(baseUrl, headers, manifest.releaseId, ref)
}
