import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { readIdentityReview } from '../../scripts/lib/als-identity-review-files.ts'

/** Read-only, development-only bridge from sealed ALS evidence to the local map. */
export function identityReviewPlugin(): Plugin {
  return {
    name: 'als-identity-review-inputs',
    apply: 'serve',
    configureServer(server) {
      const root = resolve(server.config.root, '../..')
      server.middlewares.use(
        '/__address-review/identity',
        async (request, response) => {
          response.setHeader('Cache-Control', 'no-store')
          response.setHeader('Content-Type', 'application/json')
          if (request.method !== 'GET') {
            response.statusCode = 405
            response.end(JSON.stringify({ error: 'Review inputs are read-only.' }))
            return
          }
          try {
            const sourceVersion =
              new URL(request.url ?? '/', 'http://localhost').searchParams.get(
                'release',
              ) ?? ''
            const { review } = await readIdentityReview(root, sourceVersion)
            response.end(JSON.stringify(review))
          } catch (error) {
            response.statusCode = 400
            response.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : String(error),
              }),
            )
          }
        },
      )
    },
  }
}
