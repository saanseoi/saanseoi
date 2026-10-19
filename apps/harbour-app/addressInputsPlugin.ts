import { readdir, readFile, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Feature, FeatureCollection, Geometry, Point } from 'geojson'
import type { Plugin } from 'vite'

/** Keep the map payload small, especially the separate public-housing unit lists. */
export function addressPoint(
  feature: Feature<Geometry | null>,
  file: string,
  id: number,
): Feature<Point> | null {
  const geometry = feature.geometry
  if (geometry?.type !== 'Point' || !Array.isArray(geometry.coordinates)) return null
  const [lng, lat] = geometry.coordinates
  if (
    !Number.isFinite(lng) ||
    !Number.isFinite(lat) ||
    Math.abs(lng!) > 180 ||
    Math.abs(lat!) > 90
  )
    return null
  const premise = feature.properties?.Address?.PremisesAddress ?? {}
  const { Chi3dAddress: chiUnits, ...chi } = premise.ChiPremisesAddress ?? {}
  const { Eng3dAddress: engUnits, ...eng } = premise.EngPremisesAddress ?? {}
  return {
    type: 'Feature',
    id,
    geometry,
    properties: {
      csuId: String(premise.BuildingCsuInformation?.CsuId ?? ''),
      geoAddress: String(premise.GeoAddress ?? ''),
      district: String(eng.EngDistrict ?? chi.ChiDistrict ?? ''),
      english: JSON.stringify(eng),
      chinese: JSON.stringify(chi),
      units: Math.max(chiUnits?.length ?? 0, engUnits?.length ?? 0),
      file,
    },
  }
}

export function addressInputsPlugin(): Plugin {
  return {
    name: 'als-address-inputs',
    apply: 'serve',
    configureServer(server) {
      const root = resolve(server.config.root, '../../data/hkgov/dpo/ALS')
      const cache = new Map<string, Promise<string>>()
      server.middlewares.use('/__addresses', async (request, response) => {
        response.setHeader('Content-Type', 'application/json')
        response.setHeader('Cache-Control', 'no-store')
        if (request.method !== 'GET') {
          response.statusCode = 405
          response.end()
          return
        }
        try {
          const kind =
            new URL(request.url ?? '/', 'http://localhost').searchParams.get('kind') ??
            '2d'
          if (!['2d', '3d'].includes(kind)) {
            response.statusCode = 400
            response.end(JSON.stringify({ error: 'Unknown address layer' }))
            return
          }
          const releases = (await readdir(root, { withFileTypes: true }))
            .filter(
              entry =>
                entry.isDirectory() && /^\d{8}-\d{4}-ALS-GeoJSON$/.test(entry.name),
            )
            .map(entry => entry.name)
            .sort()
          const release = releases.at(-1)
          if (!release)
            throw new Error('No extracted ALS archive found in data/hkgov/dpo/ALS.')
          const directory = resolve(root, release)
          const files = (await readdir(directory))
            .filter(name =>
              kind === '3d'
                ? /^als_addresses_3d_.*\.geojson$/.test(name)
                : /^als_addresses_\(.*\.geojson$/.test(name),
            )
            .sort()
          if (!files.length || (kind === '2d' && files.length !== 18))
            throw new Error(
              `Incomplete ALS archive: ${release} (${files.length} files for ${kind}).`,
            )
          const fingerprint = JSON.stringify([
            release,
            kind,
            await Promise.all(
              files.map(async file => {
                const info = await stat(resolve(directory, file))
                return [file, info.size, info.mtimeMs]
              }),
            ),
          ])
          let result = cache.get(fingerprint)
          if (!result) {
            result = (async () => {
              const features: Feature<Point>[] = []
              let sourceCount = 0
              for (const file of files) {
                const collection = JSON.parse(
                  await readFile(resolve(directory, file), 'utf8'),
                ) as FeatureCollection
                for (const feature of collection.features) {
                  sourceCount++
                  const point = addressPoint(feature, file, sourceCount)
                  if (point) features.push(point)
                }
              }
              return JSON.stringify({
                type: 'FeatureCollection',
                features,
                release,
                sourceCount,
                skipped: sourceCount - features.length,
              })
            })()
            cache.clear()
            cache.set(fingerprint, result)
            result.catch(() => cache.delete(fingerprint))
          }
          response.end(await result)
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
