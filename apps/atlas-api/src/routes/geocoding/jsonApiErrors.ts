import type { MiddlewareHandler } from 'hono'
import type { AppEnv } from '../../types'

/** Keep authentication, quota and validation failures in the endpoint's media type. */
export const geocodingJsonApiErrors: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next()
  if (
    c.res.status < 400 ||
    c.res.headers.get('content-type')?.includes('application/vnd.api+json')
  )
    return
  const body = (
    c.res.headers.get('content-type')?.includes('json')
      ? await c.res.clone().json()
      : {}
  ) as {
    error?: string
    message?: string
    details?: { message: string; path: string }[]
  }
  const errors = (Array.isArray(body.details) ? body.details : undefined)?.map(
    detail => ({
      status: String(c.res.status),
      code: body.error ?? 'request_failed',
      title: detail.message,
      source: { parameter: detail.path },
    }),
  ) ?? [
    {
      status: String(c.res.status),
      code: body.error ?? 'request_failed',
      title: body.message ?? (c.res.statusText || `HTTP ${c.res.status}`),
    },
  ]
  const headers = new Headers(c.res.headers)
  headers.set('content-type', 'application/vnd.api+json')
  headers.delete('content-length')
  c.res = new Response(JSON.stringify({ jsonapi: { version: '1.1' }, errors }), {
    status: c.res.status,
    headers,
  })
}
