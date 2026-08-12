import type { RequestHandler } from './$types'

import { createAMapLlmInstructions } from '../createAMapLlmInstructions'

export const GET: RequestHandler = () =>
  new Response(createAMapLlmInstructions(), {
    headers: {
      'cache-control': 'public, max-age=300',
      'content-type': 'text/plain; charset=utf-8',
    },
  })
