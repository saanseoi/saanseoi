import { normaliseBaseUrl } from '@repo/core'
import { getAuthHeaders, resolveHarbourApiUrl } from '../api/api.ts'
import type { UploadTarget } from '../cli/options.ts'
import type { ApiReleaseSetDocsRow, ReleaseDocsRow } from './docsTypes.ts'

export async function fetchApiReleaseSetDocsRows(target: UploadTarget) {
  const baseUrl = normaliseBaseUrl(resolveHarbourApiUrl(target))
  const response = await fetch(`${baseUrl}/api/v1/meta/docs/apiReleaseSets`, {
    headers: getAuthHeaders(),
    method: 'GET',
  })
  const payload = (await response.json().catch(() => null)) as {
    rows?: ApiReleaseSetDocsRow[]
    message?: string
  } | null

  if (!response.ok) {
    throw new Error(
      payload?.message ??
        `Failed to fetch API release-set docs metadata with status ${response.status}.`,
    )
  }

  return payload?.rows ?? []
}

export async function fetchReleaseDocsRows(target: UploadTarget) {
  const baseUrl = normaliseBaseUrl(resolveHarbourApiUrl(target))
  const response = await fetch(`${baseUrl}/api/v1/meta/docs/releases`, {
    headers: getAuthHeaders(),
    method: 'GET',
  })
  const payload = (await response.json().catch(() => null)) as {
    rows?: ReleaseDocsRow[]
    message?: string
  } | null

  if (!response.ok) {
    throw new Error(
      payload?.message ??
        `Failed to fetch release docs metadata with status ${response.status}.`,
    )
  }

  return payload?.rows ?? []
}

export async function putApiReleaseSetDocumentation(
  target: UploadTarget,
  code: string,
  documentation: { guide: string | null; notes: string | null },
) {
  const baseUrl = normaliseBaseUrl(resolveHarbourApiUrl(target))
  const response = await fetch(
    `${baseUrl}/api/v1/meta/docs/apiReleaseSets/${encodeURIComponent(code)}`,
    {
      body: JSON.stringify(documentation),
      headers: {
        'content-type': 'application/json',
        ...getAuthHeaders(),
      },
      method: 'PUT',
    },
  )
  const payload = (await response.json().catch(() => null)) as {
    message?: string
  } | null

  if (!response.ok) {
    throw new Error(
      payload?.message ??
        `Failed to publish docs for ${code} with status ${response.status}.`,
    )
  }
}

export async function putReleaseNotes(
  target: UploadTarget,
  code: string,
  notes: string,
) {
  const baseUrl = normaliseBaseUrl(resolveHarbourApiUrl(target))
  const response = await fetch(
    `${baseUrl}/api/v1/meta/docs/releases/${encodeURIComponent(code)}`,
    {
      body: JSON.stringify({ notes }),
      headers: {
        'content-type': 'application/json',
        ...getAuthHeaders(),
      },
      method: 'PUT',
    },
  )
  const payload = (await response.json().catch(() => null)) as {
    message?: string
  } | null

  if (!response.ok) {
    throw new Error(
      payload?.message ??
        `Failed to publish release docs for ${code} with status ${response.status}.`,
    )
  }
}
