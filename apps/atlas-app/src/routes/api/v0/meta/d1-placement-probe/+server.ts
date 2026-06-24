import { json } from '@sveltejs/kit'
import {
  parseD1PlacementProbeIterations,
  runD1PlacementProbe,
  saanseoiD1BindingNames,
} from '@repo/db'
import type { RequestHandler } from './$types'

const CONFIGURED_PLACEMENT_REGION = 'azure:eastasia'

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
