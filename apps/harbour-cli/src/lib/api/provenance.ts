import { normaliseBaseUrl } from '@repo/core'
import {
  MAX_OBJECT_BYTES,
  hashBytes,
  serialise,
  transferProcessingResult,
  objectKey,
  type ObjectRef,
  type ProvenanceStore,
} from '@repo/core/provenance'
import { getAuthHeaders, resolveHarbourApiUrl } from './api'
import { resolveR2Target, type UploadTarget } from '../cli/options'
import { retainRemoteR2Object } from '../storage/remoteR2.ts'

const PROVENANCE_UPLOAD_RETRY_LIMIT = 3
const PROVENANCE_UPLOAD_RETRY_DELAY_MS = 250
const PROVENANCE_REQUEST_TIMEOUT_MS = 60_000

function isRetryableProvenanceUploadError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === 'TimeoutError' ||
      /database is locked|sqlite_busy|internal error|network connection lost|fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|HTTP (408|429|500|502|503|504)\b/i.test(
        error.message,
      ))
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
        signal: AbortSignal.timeout(PROVENANCE_REQUEST_TIMEOUT_MS),
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
          signal: AbortSignal.timeout(PROVENANCE_REQUEST_TIMEOUT_MS),
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

async function checkProvenanceObjects(
  baseUrl: string,
  headers: Record<string, string>,
  objects: ObjectRef[],
): Promise<ObjectRef[]> {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetch(`${baseUrl}/v1/provenance/objects/check`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ objects }),
        signal: AbortSignal.timeout(PROVENANCE_REQUEST_TIMEOUT_MS),
      })
      const result = (await readProvenanceResponse(response)) as {
        objects?: ObjectRef[]
      }
      if (
        !Array.isArray(result.objects) ||
        result.objects.some(
          ref =>
            !ref ||
            !objects.some(
              expected =>
                expected.hash === ref.hash && expected.byteLength === ref.byteLength,
            ),
        )
      )
        throw new Error('Invalid provenance object acknowledgement.')
      return result.objects
    } catch (error) {
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
}

/** Upload retained results, never regenerate decisions during delivery/retry. */
export async function deliverProcessingResult(
  target: UploadTarget,
  source: ProvenanceStore,
  ref: ObjectRef,
  onProgress?: (message: string, retainedObjects: number) => void,
  options: { retainRemoteObject?: typeof retainRemoteR2Object } = {},
) {
  const baseUrl = normaliseBaseUrl(resolveHarbourApiUrl(target))
  const headers = getAuthHeaders()
  let uploaded = 0
  const destination: ProvenanceStore = {
    // Uploads are idempotent at the content-addressed endpoint. No remote HEAD required.
    async get() {
      return null
    },
    async put(key, bytes) {
      const r2 = resolveR2Target(target)
      if (!target.remote && r2 !== 'local')
        await (options.retainRemoteObject ?? retainRemoteR2Object)(
          r2,
          key,
          new Uint8Array(bytes),
          { contentType: 'application/json' },
        )
      const hash = await hashBytes(new Uint8Array(bytes))
      await uploadProvenanceObject(baseUrl, headers, hash, bytes)
      uploaded++
      onProgress?.(`Provenance objects retained: ${uploaded}`, uploaded)
    },
  }
  // retainObject verifies readback, so provide a bounded cache of acknowledged uploads.
  const acknowledged = new Map<string, ArrayBuffer>()
  const remote: ProvenanceStore = {
    async hasObjects(refs) {
      const existing: ObjectRef[] = []
      for (let start = 0; start < refs.length; start += 64) {
        const objects = refs.slice(start, start + 64)
        const retained = await checkProvenanceObjects(baseUrl, headers, objects)
        // Local metadata and a separately selected R2 destination have distinct
        // ownership. Confirm the second destination even when the API has bytes.
        const r2 = resolveR2Target(target)
        if (!target.remote && r2 !== 'local') {
          for (const ref of retained) {
            const key = objectKey(ref.hash)
            const object = await source.get(key)
            if (!object) throw new Error(`Missing provenance object: ${ref.hash}`)
            await (options.retainRemoteObject ?? retainRemoteR2Object)(
              r2,
              key,
              new Uint8Array(await object.arrayBuffer()),
              { contentType: 'application/json' },
            )
          }
        }
        existing.push(...retained)
      }
      return existing
    },
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
  onProgress?.(`Registering provenance after ${uploaded} objects`, uploaded)
  await registerProvenanceResult(baseUrl, headers, manifest.releaseId, ref)
}
