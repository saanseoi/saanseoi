import { normaliseBaseUrl } from '@repo/core'
import type { ResourceType } from '@repo/core'
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
  carriedSnapshots?: Array<{
    resourceType: ResourceType
    snapshotId: string
    variant?: string
  }>
  deferApiReleaseSet?: boolean
  deferStatsReleaseSet?: boolean
  deferSourcePublish?: boolean
  releaseCode?: string
  releaseId?: string
  skipSnapshotCleanup?: boolean
}

const LOCAL_PROXY_RETRY_DELAYS_MS = [250, 1_000, 3_000]

function controlErrorMessage(body: Record<string, unknown> | null, status: number) {
  if (typeof body?.message === 'string') return body.message
  if (typeof body?.error === 'string') return body.error
  return `Harbour control request failed with status ${status}.`
}

export function createHarbourControlClient(target: UploadTarget) {
  const baseUrl = normaliseBaseUrl(resolveHarbourApiUrl(target))
  const authHeaders = getAuthHeaders()

  return {
    publishDataset(
      releaseId: string,
      releaseCode?: string,
      publishOptions: {
        carriedSnapshots?: Array<{
          resourceType: ResourceType
          snapshotId: string
          variant?: string
        }>
        deferApiReleaseSet?: boolean
        deferStatsReleaseSet?: boolean
        deferSourcePublish?: boolean
        skipSnapshotCleanup?: boolean
      } = {},
    ) {
      return postControl<PublishDatasetResult>(
        baseUrl,
        authHeaders,
        '/v1/control/publishDataset',
        {
          releaseCode,
          releaseId,
          ...(publishOptions.carriedSnapshots
            ? { carriedSnapshots: publishOptions.carriedSnapshots }
            : {}),
          ...(publishOptions.deferApiReleaseSet ? { deferApiReleaseSet: true } : {}),
          ...(publishOptions.deferStatsReleaseSet
            ? { deferStatsReleaseSet: true }
            : {}),
          ...(publishOptions.deferSourcePublish ? { deferSourcePublish: true } : {}),
          ...(publishOptions.skipSnapshotCleanup ? { skipSnapshotCleanup: true } : {}),
        },
        {
          // These deferred publication paths cannot create an API release-set
          // revision, so repeating them after Wrangler loses its proxy
          // connection is idempotent. Other publication paths retain the
          // normal no-retry policy.
          retryLocalDeferredPublishFailure:
            !target.remote &&
            (publishOptions.deferStatsReleaseSet === true ||
              publishOptions.deferSourcePublish === true),
        },
      )
    },
    async stageCompleted(
      releaseId: string,
      phase: string,
      stats?: Record<string, unknown>,
      releaseCode?: string,
    ) {
      await postControl(
        baseUrl,
        authHeaders,
        '/v1/control/stageCompleted',
        { releaseCode, releaseId, phase, stats },
        { retryLocalProxyConnectionFailure: !target.remote },
      )
    },
    async stageFailed(
      releaseId: string,
      phase: string,
      error: string,
      stats?: Record<string, unknown>,
      releaseCode?: string,
    ) {
      await postControl(
        baseUrl,
        authHeaders,
        '/v1/control/stageFailed',
        { releaseCode, releaseId, error, phase, stats },
        { retryLocalProxyConnectionFailure: !target.remote },
      )
    },
    async stageRunning(
      releaseId: string,
      phase: string,
      stats?: Record<string, unknown>,
      releaseCode?: string,
    ) {
      await postControl(
        baseUrl,
        authHeaders,
        '/v1/control/stageRunning',
        { releaseCode, releaseId, phase, stats },
        { retryLocalProxyConnectionFailure: !target.remote },
      )
    },
  }
}

async function postControl<TResponse = Record<string, unknown>>(
  baseUrl: string,
  authHeaders: Record<string, string>,
  path: string,
  payload: StagePayload | PublishPayload,
  options: {
    retryLocalDeferredPublishFailure?: boolean
    retryLocalProxyConnectionFailure?: boolean
  } = {},
): Promise<TResponse | null> {
  let lastError: string | undefined
  for (let attempt = 0; attempt <= LOCAL_PROXY_RETRY_DELAYS_MS.length; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
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

    if (response.ok) return body as TResponse | null

    lastError = controlErrorMessage(body, response.status)

    const retryDeferredPublish =
      attempt === 0 &&
      options.retryLocalDeferredPublishFailure &&
      response.status === 500
    const retryProxyConnection =
      options.retryLocalProxyConnectionFailure &&
      response.status === 500 &&
      // Wrangler can return an empty or non-JSON 500 when its proxy drops.
      // Stage updates are idempotent; structured application failures are not retried.
      (body === null || lastError.includes('Network connection lost'))

    if (retryDeferredPublish || retryProxyConnection) {
      await Bun.sleep(LOCAL_PROXY_RETRY_DELAYS_MS[attempt] ?? 0)
      continue
    }

    throw new Error(lastError)
  }

  throw new Error(lastError ?? 'Harbour control request failed after proxy recovery.')
}
