import { HttpReader } from 'flatgeobuf/lib/mjs/http-reader.js'
import type { RangeClient } from 'flatgeobuf/lib/mjs/http-reader.js'
import { fromFeature } from 'flatgeobuf/lib/mjs/geojson/feature.js'
import type { Feature } from 'geojson'
import type { Bounds, Footprint } from './spatial'

/** Read only indexed bounding-box candidates through an injected range transport.
 * @param client Per-request R2 or local-file range reader, with its own counters.
 * @param bounds Conservative search rectangle.
 * @returns Source features, without merging identities or inventories.
 * @remarks Reader state is request-scoped; no cross-request I/O objects are cached.
 */
export async function readFootprints(
  client: RangeClient,
  bounds: Bounds,
): Promise<Feature<Footprint>[]> {
  const reader = await HttpReader.openSource(client, true)
  const result: Feature<Footprint>[] = []
  for await (const row of reader.selectBbox(bounds)) {
    const feature = fromFeature(row.id, row.feature, reader.header)
    if (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon')
      throw new Error('Unexpected footprint geometry type.')
    result.push(feature as Feature<Footprint>)
    if (result.length > 10000)
      throw new Error('Too many candidates; reduce the radius.')
  }
  return result
}
