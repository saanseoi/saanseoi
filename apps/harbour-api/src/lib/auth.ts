import { timingSafeEqual as constantTimeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'

import type { AppEnv } from '../types'

const API_KEY_HEADER = 'x-api-key'
const HEALTH_PATH = '/v1/meta/health'
const D1_PLACEMENT_PROBE_PATH = '/api/v1/meta/d1-placement-probe'

export const requireApiKey: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.path === HEALTH_PATH) {
    return next()
  }

  const isD1PlacementProbe = c.req.path === D1_PLACEMENT_PROBE_PATH
  const configuredApiKey = (
    isD1PlacementProbe ? c.env.D1_PLACEMENT_PROBE_API_KEY : c.env.HARBOUR_API_KEY
  )?.trim()

  if (!configuredApiKey) {
    return c.json(
      {
        httpStatus: 500,
        error: 'auth_misconfigured',
        message: isD1PlacementProbe
          ? 'D1 placement probe authentication is not configured.'
          : 'Harbour API authentication is not configured.',
      },
      500,
    )
  }

  const providedApiKey = c.req.header(API_KEY_HEADER)?.trim()

  if (!providedApiKey || !timingSafeEqual(providedApiKey, configuredApiKey)) {
    return c.json(
      {
        httpStatus: 401,
        error: 'unauthorized',
        message: 'Missing or invalid API key.',
      },
      401,
    )
  }

  return next()
}

function timingSafeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left)
  const rightBytes = new TextEncoder().encode(right)

  if (leftBytes.byteLength !== rightBytes.byteLength) {
    return false
  }

  return constantTimeEqual(leftBytes, rightBytes)
}
