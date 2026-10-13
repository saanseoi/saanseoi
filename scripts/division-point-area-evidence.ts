import { Database } from 'bun:sqlite'
import {
  canonicalDivisionPoint,
  divisionAreaUnion,
} from '../libs/core/src/pipeline/services/divisions/divisionPoint'
import { decompressJsonBrotli } from '../libs/core/src/pipeline/services/storage/brotliJson'
import type { GeoJsonGeometry } from '../libs/core/src/pipeline/geojson'

/** Resolve only companions pinned alongside the primary division inventory. */
export function missingDivisionAreaResolver(metaPath: string, currentPath: string) {
  const meta = new Database(metaPath, { readonly: true })
  const current = new Database(currentPath, { readonly: true })
  return {
    close() {
      meta.close()
      current.close()
    },
    resolve(id: string, snapshots: string[]): GeoJsonGeometry | null {
      const candidates = new Map<string, GeoJsonGeometry>()
      for (const snapshot of snapshots) {
        const areas = meta
          .query(`SELECT DISTINCT area.snapshotId FROM apiReleaseSetSnapshots own
          JOIN apiReleaseSetSnapshots area ON area.apiReleaseSetId=own.apiReleaseSetId AND area.variant=own.variant
          JOIN snapshots s ON s.id=area.snapshotId
          JOIN snapshotLineages sl ON sl.id=s.snapshotLineageId AND sl.resourceType='divisionArea'
          WHERE own.snapshotId=? AND own.role='primary' AND area.role='geometry'`)
          .all(snapshot) as { snapshotId: string }[]
        for (const area of areas) {
          const rows = current
            .query(`SELECT a.geometry FROM divisionAreas a
            JOIN divisionAreaPublicationState p ON p.scopeId=a.scopeId
            WHERE p.snapshotId=? AND p.status='current' AND a.divisionId=?`)
            .all(area.snapshotId, id) as { geometry: string | Uint8Array }[]
          const polygon = divisionAreaUnion(
            rows.map(row =>
              typeof row.geometry === 'string'
                ? JSON.parse(row.geometry)
                : decompressJsonBrotli(row.geometry),
            ),
          )
          if (!polygon) continue
          const point = canonicalDivisionPoint(null, { id, area: polygon })
          candidates.set(JSON.stringify(point), polygon)
        }
      }
      if (candidates.size > 1)
        throw Error(`Missing point has conflicting pinned area candidates: ${id}`)
      return candidates.values().next().value ?? null
    },
  }
}
