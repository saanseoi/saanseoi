import { timingSafeEqual as constantTimeEqual } from 'node:crypto'
import { json } from '@sveltejs/kit'
import {
  parseD1PlacementProbeIterations,
  runD1PlacementProbe,
  saanseoiD1BindingNames,
} from '@repo/db'
import type { RequestHandler } from './$types'

const CONFIGURED_PLACEMENT_REGION = 'azure:eastasia'
const API_KEY_HEADER = 'x-api-key'

export const GET: RequestHandler = async event => {
  const env = event.platform?.env

  if (!env) {
    return json(
      {
        error: 'platform_env_unavailable',
        message: 'Cloudflare bindings are unavailable for this request.',
      },
      {
        headers: {
          'cache-control': 'no-store',
        },
        status: 500,
      },
    )
  }

  const configuredApiKey = env.D1_PLACEMENT_PROBE_API_KEY?.trim()

  if (!configuredApiKey) {
    return json(
      {
        error: 'auth_misconfigured',
        message: 'D1 placement probe authentication is not configured.',
      },
      {
        headers: {
          'cache-control': 'no-store',
        },
        status: 500,
      },
    )
  }

  const providedApiKey = event.request.headers.get(API_KEY_HEADER)?.trim()

  if (!providedApiKey || !timingSafeEqual(providedApiKey, configuredApiKey)) {
    return json(
      {
        error: 'unauthorized',
        message: 'Missing or invalid API key.',
      },
      {
        headers: {
          'cache-control': 'no-store',
        },
        status: 401,
      },
    )
  }

  let iterations: number

  try {
    iterations = parseD1PlacementProbeIterations(
      event.url.searchParams.get('iterations'),
    )
  } catch (error) {
    return json(
      {
        error: 'invalid_iterations',
        message: error instanceof Error ? error.message : String(error),
      },
      {
        headers: {
          'cache-control': 'no-store',
        },
        status: 400,
      },
    )
  }

  const bindings = Object.fromEntries(
    saanseoiD1BindingNames.map(bindingName => [bindingName, env[bindingName]]),
  ) as Parameters<typeof runD1PlacementProbe>[0]

  const startedAt = new Date().toISOString()
  const result = await runD1PlacementProbe(bindings, { iterations })
  const completedAt = new Date().toISOString()

  return json(
    {
      ok: true,
      worker: 'atlas-app',
      configuredPlacementRegion: CONFIGURED_PLACEMENT_REGION,
      request: {
        city: event.platform?.cf?.city ?? null,
        colo: event.platform?.cf?.colo ?? null,
        country: event.platform?.cf?.country ?? null,
        host: event.url.host,
        path: event.url.pathname,
        region: event.platform?.cf?.region ?? null,
        timezone: event.platform?.cf?.timezone ?? null,
      },
      startedAt,
      completedAt,
      ...result,
    },
    {
      headers: {
        'cache-control': 'no-store',
      },
    },
  )
}

function timingSafeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)

  if (leftBytes.byteLength !== rightBytes.byteLength) {
    return false
  }

  return constantTimeEqual(leftBytes, rightBytes)
}
