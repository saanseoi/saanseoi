import { normaliseBaseUrl } from '@repo/core'
import type { PublishDatasetResult } from '@repo/core/pipeline/harbourClient'

import { getAuthHeaders, resolveHarbourApiUrl } from './api.ts'
import type { UploadTarget } from '../cli/options.ts'

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

export function createHarbourControlClient(target: UploadTarget) {
  const baseUrl = normaliseBaseUrl(resolveHarbourApiUrl(target))
  const authHeaders = getAuthHeaders()

  return {
    publishDataset(
      releaseId: string,
      releaseCode?: string,
      publishOptions: { skipSnapshotCleanup?: boolean } = {},
    ) {
      return postControl<PublishDatasetResult>(
        baseUrl,
        authHeaders,
        '/v1/control/publishDataset',
        {
          releaseCode,
          releaseId,
          ...(publishOptions.skipSnapshotCleanup ? { skipSnapshotCleanup: true } : {}),
        },
      )
    },
    async stageCompleted(
      releaseId: string,
      phase: string,
      stats?: Record<string, unknown>,
      releaseCode?: string,
    ) {
      await postControl(baseUrl, authHeaders, '/v1/control/stageCompleted', {
        releaseCode,
        releaseId,
        phase,
        stats,
      })
    },
    async stageFailed(
      releaseId: string,
      phase: string,
      error: string,
      stats?: Record<string, unknown>,
      releaseCode?: string,
    ) {
      await postControl(baseUrl, authHeaders, '/v1/control/stageFailed', {
        releaseCode,
        releaseId,
        error,
        phase,
        stats,
      })
    },
    async stageRunning(
      releaseId: string,
      phase: string,
      stats?: Record<string, unknown>,
      releaseCode?: string,
    ) {
      await postControl(baseUrl, authHeaders, '/v1/control/stageRunning', {
        releaseCode,
        releaseId,
        phase,
        stats,
      })
    },
  }
}

async function postControl<TResponse = Record<string, unknown>>(
  baseUrl: string,
  authHeaders: Record<string, string>,
  path: string,
  payload: StagePayload | PublishPayload,
): Promise<TResponse | null> {
  let response: Response

  response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...authHeaders,
    },
    body: JSON.stringify(payload),
  })

  const body = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null

  if (!response.ok) {
    const message =
      typeof body?.message === 'string'
        ? body.message
        : `Harbour control request failed with status ${response.status}.`

    throw new Error(message)
  }

  return body as TResponse | null
}
