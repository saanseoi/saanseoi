import type { OpenAPIHonoOptions } from '@hono/zod-openapi'
import type { ZodError } from 'zod'

import type { AppEnv } from '../types'

function formatZodErrors(error: ZodError) {
  return error.issues.map(issue => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.join('.'),
  }))
}

export const defaultOpenAPIHook: OpenAPIHonoOptions<AppEnv>['defaultHook'] = (
  result,
  c,
) => {
  if (result.success) {
    return
  }

  return c.json(
    {
      error: 'validation_error',
      message: 'Request validation failed.',
      details: formatZodErrors(result.error),
      target: result.target,
    },
    422,
  )
}
