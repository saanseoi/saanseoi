import type { MiddlewareHandler } from 'hono'

import type { AppEnv } from '../types'

const API_KEY_HEADER = 'x-api-key'

export const requireApiKey: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.path === '/v1/meta/health') {
    return next()
  }

  const configuredApiKey = c.env.HARBOUR_API_KEY?.trim()

  if (!configuredApiKey) {
    return c.json(
      {
        httpStatus: 500,
        error: 'auth_misconfigured',
        message: 'Harbour API authentication is not configured.',
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

  return crypto.subtle.timingSafeEqual(leftBytes, rightBytes)
}
