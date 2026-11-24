import { Database } from 'bun:sqlite'
import { readFootprints } from '../../apps/building-benchmark/src/fgb'
import {
  searchBounds,
  footprintDistance,
} from '../../apps/building-benchmark/src/spatial'
const root = process.argv[2] ?? '.local/buildings-review/2026-09'
// Suppress library index tracing in this offline verification process only.
console.debug = () => {}
const db = new Database(`${root}/review.sqlite`, { readonly: true })
for (const inventory of ['landsd', 'overture']) {
  const bytes = await Bun.file(`${root}/${inventory}.fgb`).arrayBuffer()
  const table =
    inventory === 'landsd' ? 'benchmarkLandsdBuilding' : 'benchmarkOvertureBuilding'
  for (const [lng, lat] of [
    [114.17, 22.32],
    [114.1577, 22.2819],
    [114.1898, 22.3832],
    [114.066, 22.446],
  ])
    for (const radius of [100, 250, 500, 1000]) {
      const b = searchBounds(lng, lat, radius)
      const fgb = await readFootprints(
        { getRange: async (offset, length) => bytes.slice(offset, offset + length) },
        b,
      )
      const rows = db
        .query(
          `SELECT id,geometry FROM ${table} WHERE minX<=? AND maxX>=? AND minY<=? AND maxY>=?`,
        )
        .all(b.maxX, b.minX, b.maxY, b.minY) as { id: string; geometry: string }[]
      const a = fgb
        .filter(f => footprintDistance(f.geometry, lng, lat) <= radius)
        .map(f => String(f.properties?.id))
        .sort()
      const c = rows
        .filter(f => footprintDistance(JSON.parse(f.geometry), lng, lat) <= radius)
        .map(f => f.id)
        .sort()
      if (JSON.stringify(a) !== JSON.stringify(c))
        throw Error(`Mismatch ${inventory} ${lng} ${radius}: ${a.length}/${c.length}`)
    }
  console.log(`${inventory}: 16 radius queries match exactly`)
}
