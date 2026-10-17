import type { HarbourReadableDb } from '@repo/core/db/types'
import {
  normaliseOvertureAttribution,
  readSourceAttributions,
} from '@repo/core/pipeline/services/sources/sourceAttribution'
import {
  metaSchema,
  eq,
  orderSourceAttribution,
  type SourceAttribution,
} from '@repo/db'

export type PlaceDependencySource = Pick<SourceAttribution, 'publisher' | 'dataset'>

/** The exact snapshot owner contributes the reference, not incidental name authors. */
export async function readPlaceSnapshotSource(
  db: HarbourReadableDb,
  snapshotId: string,
): Promise<PlaceDependencySource> {
  const {
    metaSnapshots: snapshots,
    metaSnapshotLineages: snapshotLineages,
    metaDatasets: datasets,
    metaPublishers: publishers,
  } = metaSchema
  const row = await db
    .select({ publisher: publishers.code, dataset: datasets.code })
    .from(snapshots)
    .innerJoin(snapshotLineages, eq(snapshotLineages.id, snapshots.snapshotLineageId))
    .innerJoin(datasets, eq(datasets.id, snapshotLineages.primaryDatasetId))
    .innerJoin(publishers, eq(publishers.id, datasets.publisherId))
    .where(eq(snapshots.id, snapshotId))
    .get()
  if (!row) throw new Error(`Missing Place dependency source owner for ${snapshotId}.`)
  return row
}

/** Scope retained supporting-record identities to the populated Place references. */
export function placeAddressSources(
  sources: unknown,
  properties: string[],
  fallback?: SourceAttribution,
): SourceAttribution[] {
  if (!properties.length) return []
  const retained = readSourceAttributions(sources)
  return (retained.length ? retained : fallback ? [fallback] : []).map(source => {
    const { property: _property, properties: _properties, ...identity } = source
    return orderSourceAttribution({
      ...identity,
      properties: [...new Set(properties)].sort(),
    })
  })
}

export function placeSources(
  upstream: unknown[],
  addressSources: SourceAttribution[],
  divisionSource: PlaceDependencySource,
  referenceSources: Partial<Record<string, string | null>>,
): SourceAttribution[] {
  const contributions = new Map<string, SourceAttribution>()
  const add = (source: SourceAttribution) => {
    const { properties, ...identity } = source
    const key = JSON.stringify(orderSourceAttribution(identity))
    const previous = contributions.get(key)
    contributions.set(
      key,
      orderSourceAttribution({
        ...identity,
        properties: [
          ...new Set([...(previous?.properties ?? []), ...(properties ?? [])]),
        ].sort(),
      }),
    )
  }
  for (const source of addressSources) add(source)
  for (const [property, recordId] of Object.entries(referenceSources)) {
    if (recordId) add({ ...divisionSource, recordId, properties: [property] })
  }
  return [
    ...normaliseOvertureAttribution(upstream),
    ...[...contributions.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, source]) => source),
  ]
}
