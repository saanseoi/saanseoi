import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Plugin } from 'vite'
const execute = promisify(execFile)

/** Development-only input generation; never bundled into the public viewer. */
export function reviewInputsPlugin(): Plugin {
  let pending: Promise<string> | undefined
  return {
    name: 'division-review-inputs',
    apply: 'serve',
    configureServer(server) {
      const root = resolve(server.config.root, '../..')
      const assets = new Map([
        [
          'catalogue.json',
          resolve(root, '.local/division-review/assets/catalogue.json'),
        ],
        [
          'buildings.json',
          resolve(root, '.local/division-review/assets/buildings.json'),
        ],
        [
          'road-centrelines.geojson',
          resolve(root, '.local/division-review/assets/road-centrelines.geojson'),
        ],
        [
          'coastline-land.geojson',
          resolve(
            root,
            '.local/tiles/data/hk/hongkong-2026-09-01.coastline-land.geojson',
          ),
        ],
      ])
      server.middlewares.use(
        '/__division-review/assets/',
        async (request, response) => {
          const path = assets.get((request.url ?? '').split('?')[0]!.replace(/^\//, ''))
          if (request.method !== 'GET' || !path) {
            response.statusCode = 404
            response.end('Not found')
            return
          }
          try {
            response.setHeader('Content-Type', 'application/json')
            response.setHeader('Cache-Control', 'no-store')
            response.end(await readFile(path))
          } catch {
            response.statusCode = 503
            response.end(
              JSON.stringify({
                error:
                  'Local geometry asset unavailable. See the division editor setup documentation.',
              }),
            )
          }
        },
      )
      server.middlewares.use('/__division-review/inputs', async (request, response) => {
        if (request.method !== 'GET') {
          response.statusCode = 405
          response.end()
          return
        }
        try {
          pending ??= execute('bun', ['scripts/divisions/prepare-review.ts'], {
            cwd: root,
            maxBuffer: 1024 * 1024,
          })
            .then(() =>
              readFile(resolve(root, '.local/division-review/editor.json'), 'utf8'),
            )
            .finally(() => {
              pending = undefined
            })
          const content = await pending
          response.setHeader('Content-Type', 'application/json')
          response.setHeader('Cache-Control', 'no-store')
          response.end(content)
        } catch (error) {
          response.statusCode = 503
          response.setHeader('Content-Type', 'application/json')
          response.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : String(error),
            }),
          )
        }
      })
    },
  }
}
