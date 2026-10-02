import sourceFixture from '../../../../fixtures/meta/processing-rules/ingestion/protomaps-source-extraction.json'
import { registerRule, ruleDeclarationFromFixture } from '@repo/core/provenance'
import { createHash } from 'node:crypto'

export type SourceFeature = {
  id?: string | number
  geometry: { type: string; coordinates: unknown } | null
  properties?: Record<string, unknown>
}
export const sha256 = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex')

/** Only explicit publisher locale tags become localised names. */
export function sourceNames(tags: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(tags).flatMap(([key, value]) =>
      key.startsWith('name:') && typeof value === 'string' && value.trim()
        ? [[key.slice(5), value]]
        : [],
    ),
  )
}

function extractSourceRecords(
  { named, land }: { named: SourceFeature[]; land: SourceFeature[] },
  parameters: Readonly<typeof sourceFixture.parameters>,
) {
  const records = named
    .filter(feature => parameters.placeTags.includes(String(feature.properties?.place)))
    .map(feature => {
      if (!feature.id || !feature.geometry)
        throw Error('Named source features require their native OSM ID and geometry.')
      return {
        sourceRecordId: `OSM:${feature.id}`,
        properties: {
          kind: 'osm-island',
          tags: feature.properties ?? {},
          names: sourceNames(feature.properties ?? {}),
        },
        sourceGeometry: feature.geometry,
      }
    })
  // Coastline polygonisation has no native feature IDs. Content identifies the
  // source component; LandsD names and review identities never enter its identity.
  for (const feature of land) {
    if (
      !feature.geometry ||
      !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)
    )
      throw Error('Coastline land input must contain polygons.')
    records.push({
      sourceRecordId: `PROTOMAPS:LAND:${sha256(JSON.stringify(feature.geometry))}`,
      properties: { kind: 'coastline-land', tags: feature.properties ?? {}, names: {} },
      sourceGeometry: feature.geometry,
    })
  }
  const unique = new Map(records.map(row => [row.sourceRecordId, row]))
  for (const row of records) {
    if (JSON.stringify(row) !== JSON.stringify(unique.get(row.sourceRecordId)))
      throw Error(`Conflicting source feature ${row.sourceRecordId}`)
  }
  return [...unique.values()].sort((a, b) =>
    a.sourceRecordId.localeCompare(b.sourceRecordId),
  )
}

export const protomapsSourceExtractionRule = registerRule(
  ruleDeclarationFromFixture(sourceFixture),
  extractSourceRecords,
)
export function protomapsSourceRecords(named: SourceFeature[], land: SourceFeature[]) {
  return protomapsSourceExtractionRule.execute({ named, land })
}
