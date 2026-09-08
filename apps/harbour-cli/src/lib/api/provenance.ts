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
      const response = await fetch(`${baseUrl}/v1/provenance/objects/${hash}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: bytes,
      })
      const result = (await response.json()) as {
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
    },
  }
  // retainObject verifies readback, so provide a bounded cache of acknowledged uploads.
  const acknowledged = new Map<string, ArrayBuffer>()
  const remote: ProvenanceStore = {
    async get(key) {
      const bytes = acknowledged.get(key)
      return bytes ? { arrayBuffer: async () => bytes } : null
    },
    async put(key, bytes) {
      if (bytes.byteLength > MAX_OBJECT_BYTES)
        throw new Error('Provenance object exceeds byte limit.')
      await destination.put(key, bytes)
      acknowledged.clear()
      acknowledged.set(key, bytes)
    },
  }
  const manifest = await transferProcessingResult(source, remote, ref)
  const response = await fetch(
    `${baseUrl}/v1/provenance/releases/${encodeURIComponent(manifest.releaseId)}`,
    {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: serialise(ref),
    },
  )
  const result = (await response.json()) as { manifestHash?: string; error?: string }
  if (!response.ok || result.manifestHash !== ref.hash)
    throw new Error(
      result.error ?? `Provenance registration failed (${response.status}).`,
    )
}
