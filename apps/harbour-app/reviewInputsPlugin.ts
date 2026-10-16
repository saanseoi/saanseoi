import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import type { Plugin } from 'vite'
import { createReviewInputCache, inputFingerprint } from './reviewInputCache.ts'
const execute = promisify(execFile)

/** Development-only input generation; never bundled into the public viewer. */
export function reviewInputsPlugin(): Plugin {
  return {
    name: 'division-review-inputs',
    apply: 'serve',
    configureServer(server) {
      const root = resolve(server.config.root, '../..')
      const dependencyPaths = [
        'scripts/divisions',
        'apps/harbour-cli/src/lib/pipeline/curatedDivisions',
        'apps/harbour-cli/src/lib/pipeline/islands',
        'apps/harbour-cli/src/lib/sources',
        'libs/core/src/pipeline/services/divisions',
        'libs/core/src/pipeline/services/sources',
        'libs/db/src/divisionTaxonomy.ts',
        'fixtures/meta/curations',
        'fixtures/meta/datasetInputs',
        '.local/division-review/archives',
        '.local/division-review/division-editor-project.json',
        'data/hkgov/csdi/hkgov-censtatd-division-statistic-land-area-population-density-district/2021.0.gml',
        'data/hkgov/csdi/archive/had_rcd_1634523272907_75218/2025-Q3/source.zip',
        'data/hkgov/censtatd/district-council-districts-2021.gml',
      ].map(path => resolve(root, path))
      const getInputs = createReviewInputCache(
        async () => {
          const paths = [...dependencyPaths]
          const optionsPath = process.env.SAANSEOI_REVIEW_OPTIONS
          if (optionsPath) {
            paths.push(resolve(root, optionsPath))
            const options = JSON.parse(
              await readFile(resolve(root, optionsPath), 'utf8'),
            )
            paths.push(
              ...Object.values(options.paths ?? {}).map(path =>
                resolve(root, String(path)),
              ),
            )
          }
          return JSON.stringify([
            process.env.SAANSEOI_REVIEW_API_URL,
            process.env.SAANSEOI_REVIEW_ARCHIVE_URL,
            optionsPath,
            await inputFingerprint(paths),
          ])
        },
        async () => {
          await execute('bun', ['scripts/divisions/prepare-review.ts'], {
            cwd: root,
            maxBuffer: 1024 * 1024,
          })
          const { governmentCandidates, ...inputs } = JSON.parse(
            await readFile(resolve(root, '.local/division-review/editor.json'), 'utf8'),
          )
          return {
            inputs: JSON.stringify(inputs),
            government: JSON.stringify(governmentCandidates),
          }
        },
      )
      server.middlewares.use(
        '/__division-review/government',
        async (request, response) => {
          if (request.method !== 'GET') {
            response.statusCode = 405
            response.end()
            return
          }
          try {
            response.setHeader('Content-Type', 'application/json')
            response.setHeader('Cache-Control', 'no-store')
            response.end((await getInputs()).government)
          } catch (error) {
            response.statusCode = 503
            response.end(JSON.stringify({ error: String(error) }))
          }
        },
      )
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
          const content = (await getInputs()).inputs
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
