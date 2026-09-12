import type { HarbourReadableDb } from '@repo/core/db/types'
import { placeLocaleHash } from './placeHistory.ts'
import { latLngToCell } from 'h3-js'
import { PLACE_H3_LEVELS } from './processLocalPlaceSqlUploadConfig.ts'
import type { EnrichedPlace } from './processLocalPlaceSqlUploadTypes.ts'
import { loadCollection, type PlaceAddress3dReadObserver } from './placeAddress3d.ts'
import { recordCacheKey, type PlaceRecordCache } from './placeRecordCache.ts'

type Dependency = { snapshotId: string; ownerId: string; hash: string }
type CachedEnrichment = { result: EnrichedPlace; dependencies: Dependency[] }

export function createRecordEnrichmentReuse(
  db: HarbourReadableDb,
  cache?: PlaceRecordCache,
  observe?: PlaceAddress3dReadObserver,
) {
  // Bound validation reads and coalesce places sharing an owner.
  const reads = new Map<string, ReturnType<typeof loadCollection>>()
  return async (
    identity: string,
    generate: (observer: PlaceAddress3dReadObserver) => Promise<EnrichedPlace>,
  ): Promise<EnrichedPlace> => {
    const cached = cache?.get<CachedEnrichment>('enrichment', identity)
    if (cached) {
      let valid = true
      for (const dependency of cached.dependencies) {
        const key = JSON.stringify([dependency.snapshotId, dependency.ownerId])
        let read = reads.get(key)
        if (!read) {
          read = loadCollection(db, dependency.snapshotId, dependency.ownerId)
          reads.set(key, read)
          const oldest = reads.keys().next().value
          if (reads.size > 128 && oldest !== undefined) reads.delete(oldest)
        }
        const collection = await read
        if (recordCacheKey(collection ?? null) !== dependency.hash) {
          valid = false
          break
        }
        observe?.(dependency.snapshotId, dependency.ownerId, collection)
      }
      if (valid) return cached.result
      const counts = cache?.counts.get('enrichment')
      if (counts) {
        counts.reused--
        counts.computed++
      }
    }
    const dependencies: Dependency[] = []
    const result = await generate((snapshotId, ownerId, collection) => {
      dependencies.push({
        snapshotId,
        ownerId,
        hash: recordCacheKey(collection ?? null),
      })
      observe?.(snapshotId, ownerId, collection)
    })
    await preparePlaceProjection(result)
    cache?.set('enrichment', identity, { result, dependencies })
    return result
  }
}

/** Reusable derived values; snapshot ownership and observation dates remain fresh. */
export async function preparePlaceProjection(row: EnrichedPlace) {
  const lng = row.effectiveLng ?? row.place.lng
  const lat = row.effectiveLat ?? row.place.lat
  row.projection = {
    cells: PLACE_H3_LEVELS.map(h3Level => ({
      h3Level,
      h3Cell: latLngToCell(lat, lng, h3Level),
    })),
    i18nHashes: await Promise.all(
      row.place.i18n.map(localised =>
        placeLocaleHash(localised, row.searchDependencies?.[localised.locale]),
      ),
    ),
  }
}
