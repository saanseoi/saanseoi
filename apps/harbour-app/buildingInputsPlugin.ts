import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Database } from 'bun:sqlite'
import type { Plugin } from 'vite'
import {
  footprintDistance,
  parseSearch,
  searchBounds,
} from '../building-benchmark/src/spatial.ts'
import type { Footprint } from '../building-benchmark/src/spatial.ts'

type Row = { id: string; name: string; geometry: string }
const tables = {
  landsd: 'benchmarkLandsdBuilding',
  overture: 'benchmarkOvertureBuilding',
} as const
const categories = [
  'mutual',
  'partial',
  'reverse-partial',
  'ambiguous',
  'overlap',
  'unmatched',
]

/** Serve read-only building review evidence from the pinned local research bundle.
 * @returns A development-only Harbour middleware plugin.
 * @remarks Inventory tables and source IDs remain separate. Review decisions never mutate this database.
 */
export function buildingInputsPlugin(): Plugin {
  let db: Database | undefined
  return {
    name: 'building-comparison-inputs',
    apply: 'serve',
    configureServer(server) {
      const root = resolve(server.config.root, '../../.local/buildings-review/2026-09')
      server.httpServer?.once('close', () => db?.close())
      server.middlewares.use('/__buildings', async (request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        if (request.method !== 'GET') {
          response.statusCode = 405
          response.end()
          return
        }
        try {
          const url = new URL(request.url ?? '/', 'http://localhost')
          if (url.pathname === '/summary') {
            response.end(await readFile(resolve(root, 'summary.json'), 'utf8'))
            return
          }
          db ??= new Database(resolve(root, 'review.sqlite'), { readonly: true })
          if (url.pathname === '/list') {
            const category = url.searchParams.get('status') ?? ''
            if (category && !categories.includes(category))
              throw new Error('Unknown review category')
            const search = (url.searchParams.get('query') ?? '').slice(0, 100)
            const offset = Number(url.searchParams.get('offset') ?? 0)
            if (!Number.isInteger(offset) || offset < 0 || offset > 350000)
              throw new Error('Invalid offset')
            const where = `WHERE (?='' OR status=?) AND (?='' OR id LIKE ? OR name LIKE ?)`
            const params = [category, category, search, `%${search}%`, `%${search}%`]
            const rows = db
              .query(
                `SELECT * FROM buildingReview ${where} ORDER BY id LIMIT 40 OFFSET ?`,
              )
              .all(...params, offset)
            const count = db
              .query(`SELECT COUNT(*) AS total FROM buildingReview ${where}`)
              .get(...params)
            response.end(JSON.stringify({ rows, ...(count as object) }))
            return
          }
          if (url.pathname === '/nearby') {
            const { inventory, lng, lat, radius } = parseSearch(url)
            const b = searchBounds(lng, lat, radius)
            const rows = db
              .query<Row, number[]>(
                `SELECT id,name,geometry FROM ${tables[inventory]} WHERE minX<=? AND maxX>=? AND minY<=? AND maxY>=? LIMIT 10001`,
              )
              .all(b.maxX, b.minX, b.maxY, b.minY)
            if (rows.length > 10000)
              throw new Error('Too many buildings; reduce the radius')
            const features = rows
              .map(row => {
                const geometry = JSON.parse(row.geometry) as Footprint
                return {
                  type: 'Feature',
                  id: row.id,
                  geometry,
                  properties: {
                    id: row.id,
                    name: row.name,
                    inventory,
                    distanceMetres: footprintDistance(geometry, lng, lat),
                  },
                }
              })
              .filter(f => f.properties.distanceMetres <= radius)
            response.end(
              JSON.stringify({ type: 'FeatureCollection', inventory, features }),
            )
            return
          }
          if (url.pathname === '/record') {
            const inventory = url.searchParams.get('inventory')
            if (inventory !== 'landsd' && inventory !== 'overture')
              throw new Error('Unknown inventory')
            const id = url.searchParams.get('id') ?? ''
            const selected = db
              .query<Row, string[]>(
                `SELECT id,name,geometry FROM ${tables[inventory]} WHERE id=?`,
              )
              .get(id)
            if (!selected) {
              response.statusCode = 404
              response.end(JSON.stringify({ error: 'Building not found' }))
              return
            }
            const own = inventory === 'landsd' ? 'landsdId' : 'overtureId'
            const other = inventory === 'landsd' ? 'overture' : 'landsd'
            const otherKey = inventory === 'landsd' ? 'overtureId' : 'landsdId'
            const matches = db
              .query(
                `SELECT p.*,b.name,b.geometry FROM buildingOverlap p JOIN ${tables[other]} b ON b.id=p.${otherKey} WHERE p.${own}=? ORDER BY MIN(landsdCoverage,overtureCoverage) DESC,intersectionM2 DESC LIMIT 10`,
              )
              .all(id)
            const category =
              inventory === 'landsd'
                ? db.query('SELECT status FROM buildingReview WHERE id=?').get(id)
                : null
            response.end(JSON.stringify({ inventory, selected, matches, category }))
            return
          }
          response.statusCode = 404
          response.end(JSON.stringify({ error: 'Unknown building review route' }))
        } catch (error) {
          response.statusCode = 503
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
