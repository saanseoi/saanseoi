import { resolveHarbourBaseUrl as resolveCoreHarbourBaseUrl } from '@repo/core'

import type { UploadTarget } from './options.ts'

export function resolveHarbourBaseUrl(target: UploadTarget) {
  return resolveCoreHarbourBaseUrl(target.environment)
}

export function resolveHarbourApiUrl(target: UploadTarget) {
  return resolveCoreHarbourBaseUrl(target.environment)
}

export function getAuthHeaders() {
  const apiKey = process.env.HARBOUR_API_KEY?.trim()

  if (!apiKey) {
    throw new Error('Missing HARBOUR_API_KEY for authenticated Harbour API requests.')
  }

  return {
    'x-api-key': apiKey,
  }
}
