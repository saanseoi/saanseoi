import geographicCodes from '../../../../../../fixtures/meta/divisionCodes/geographic.json'
import { calculateGeoJsonBbox } from '@repo/core/pipeline/geojson'

const object = (value: any) => (typeof value === 'string' ? JSON.parse(value) : value)

/** SaanSeoi label policy; zoom is the first useful display zoom, priority breaks collisions. */
export const divisionCartography = {
  country: [2, 100],
  sar: [5, 95],
  area: [8, 90],
  district: [10, 85],
  city: [8, 90],
  town: [10, 80],
  village: [13, 55],
  hamlet: [15, 40],
  macrohood: [12, 70],
  neighbourhood: [14, 60],
  microhood: [16, 45],
  major_island: [9, 80],
  minor_island: [12, 60],
  islet: [15, 35],
  island_group: [11, 65],
} as const

export function curatedNameObject(value: Record<string, any>) {
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, raw]) => {
      if (raw == null) return []
      const decoded = ['nameVariant', 'nameRules'].includes(key) ? object(raw) : raw
      return decoded == null ? [] : [[key, decoded]]
    }),
  )
}

export function applyCuratedRecordContract(
  rows: Record<string, any>[],
  areas: Record<string, any>[] = [],
) {
  for (const row of rows) {
    const geometry = object(row.geometry)
    const polygons = areas
      .filter(area => area.divisionId === row.id)
      .map(area => object(area.geometry))
    row.bbox = geometry
      ? calculateGeoJsonBbox(geometry)
      : polygons.length
        ? calculateGeoJsonBbox({ type: 'GeometryCollection', geometries: polygons })
        : (object(row.bbox) ?? null)
    row.wikidata ??= null
    row.divisionCode ??= null
    const policy = divisionCartography[row.class as keyof typeof divisionCartography]
    if (!policy) throw Error(`Missing cartography policy for ${row.class}`)
    row.cartography = { minZoom: policy[0], maxZoom: 24, prominence: policy[1] }
    const identifiers = object(row.identifiers) ?? {}
    const assignment = geographicCodes.assignments.find(
      code => code.canonicalId === row.id,
    )
    if (assignment && assignment.divisionClass !== row.class)
      throw Error(`Division code class mismatch: ${row.id}`)
    if (assignment && assignment.divisionCategory !== row.category)
      throw Error(`Division code category mismatch: ${row.id}`)
    row.divisionCode = assignment?.divisionCode ?? row.divisionCode
    row.identifiers = identifiers
    const sources = object(row.sources) ?? {}
    delete sources.evidence
    for (const [publisher, values] of Object.entries(sources)) {
      sources[publisher] = (values as any[]).flatMap(source => {
        const contributions = source.contributions?.filter(
          (value: string) => value !== 'membership',
        )
        if (source.contributions && !contributions.length) return []
        return [{ ...source, ...(contributions ? { contributions } : {}) }]
      })
      if (!sources[publisher].length) delete sources[publisher]
    }
    if (!sources.overture) {
      sources.saanseoi = [
        {
          dataset: 'ds-hk-saanseoi-division',
          recordId: row.id,
          contributions: ['identity', 'names', 'classification', 'hierarchy'],
          curation: identifiers.saanseoiIsland
            ? 'division-identity-matches'
            : 'division-additions',
        },
      ]
    }
    if (assignment)
      sources.saanseoi = [
        ...(sources.saanseoi ?? []),
        {
          dataset: 'ds-hk-saanseoi-division',
          recordId: row.id,
          curation: 'division-codes/geographic',
          contributions: ['divisionCode'],
        },
      ]
    row.sources = sources
  }
}

export function applyCuratedAreaContract(
  rows: Record<string, any>[],
  overtureRelease: string,
) {
  for (const row of rows) {
    const sources = object(row.sources) ?? {}
    if (sources.evidence) {
      sources.overture = [
        ...(sources.overture ?? []),
        ...sources.evidence.map((source: any) => ({
          dataset: 'ds-hk-overture-division-area',
          release: overtureRelease,
          recordId: source.record_id,
          contributions: ['geometry'],
        })),
      ]
      delete sources.evidence
    }
    if (sources.saanseoi)
      sources.saanseoi = sources.saanseoi.map((source: any) => ({
        ...source,
        dataset: 'ds-hk-saanseoi-division-area',
        curation: source.curation ?? source.dataset,
        contributions: source.contributions ?? ['geometry'],
      }))
    row.sources = sources
  }
}
