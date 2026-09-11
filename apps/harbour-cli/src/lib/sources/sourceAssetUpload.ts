import { sourceAssetScope } from '../../../../../libs/core/src/lib/services/sourceAssetTransfer.ts'
import { getAuthHeaders, resolveHarbourApiUrl } from '../api/api.ts'
import type { UploadTarget } from '../cli/options.ts'
import {
  inspectSourceAssetFile,
  readSourceAssetFilePart,
} from '../storage/sourceAssetFile.ts'
import type { ManagedSourceAssetUpload } from './sourceAssets.ts'

/** Remote chunk existence is the durable receipt, scoped to the destination and full immutable key. */
export async function uploadSourceAssetRemotely(
  target: UploadTarget,
  input: ManagedSourceAssetUpload,
) {
  const file = await inspectSourceAssetFile(input.filePath)
  if (file.sha256 !== input.metadata.contentHash)
    throw new Error('Source asset SHA-256 does not match the declared content hash.')
  const base = resolveHarbourApiUrl(target)
  const headers = getAuthHeaders()
  const preflight = await sourceTransferRequest(`${base}/v1/assets/preflight`, () => ({
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({ byteLength: file.byteLength, metadata: input.metadata }),
  }))
  if (preflight.needsUpload === false && typeof preflight.assetId === 'string')
    return { assetId: preflight.assetId }
  if (preflight.needsUpload !== true)
    throw new Error('Invalid source asset preflight acknowledgement.')
  const scope = sourceAssetScope(input.metadata.assetKey)
  for (const [index, part] of file.parts.entries()) {
    const url = `${base}/v1/assets/parts/${scope}/${part.sha256}`
    const receipt = await sourceTransferRequest(
      `${url}?byteLength=${part.byteLength}`,
      () => ({ headers }),
    )
    if (receipt.exists === true) continue
    if (receipt.exists !== false)
      throw new Error('Invalid source chunk acknowledgement.')
    const bytes = await readSourceAssetFilePart(input.filePath, index, part)
    const uploaded = await sourceTransferRequest(url, () => ({
      method: 'PUT',
      headers: { ...headers, 'content-type': 'application/octet-stream' },
      body: bytes,
    }))
    if (uploaded.sha256 !== part.sha256 || uploaded.byteLength !== part.byteLength)
      throw new Error('Source chunk acknowledgement does not match its bytes.')
  }
  const result = await sourceTransferRequest(`${base}/v1/assets`, () => ({
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      fileName: input.fileName,
      metadata: input.metadata,
      byteLength: file.byteLength,
      parts: file.parts,
    }),
  }))
  if (typeof result.assetId !== 'string')
    throw new Error('Invalid source asset completion acknowledgement.')
  return { assetId: result.assetId }
}

async function sourceTransferRequest(
  url: string,
  init: () => RequestInit,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; ; attempt++) {
    let response: Response
    try {
      response = await fetch(url, init())
    } catch (error) {
      if (attempt >= 2) throw error
      await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt))
      continue
    }
    const body = await response.json().catch(() => null)
    if (response.ok) {
      if (!body || typeof body !== 'object' || Array.isArray(body))
        throw new Error('Invalid source transfer response.')
      return body as Record<string, unknown>
    }
    if (
      attempt < 2 &&
      (response.status === 408 || response.status === 429 || response.status >= 500)
    ) {
      await new Promise(resolve => setTimeout(resolve, 200 * 2 ** attempt))
      continue
    }
    throw new Error(
      body && typeof body.message === 'string'
        ? body.message
        : `Source transfer failed with HTTP ${response.status}.`,
    )
  }
}
