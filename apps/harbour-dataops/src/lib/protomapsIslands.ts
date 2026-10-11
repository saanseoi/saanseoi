import sourceFixture from '../../../../fixtures/meta/processing-rules/ingestion/protomaps-source-extraction.json'
import { registerRule, ruleDeclarationFromFixture } from '@repo/core/provenance'
import { createHash } from 'node:crypto'
import {
  resolveProtomapsIslandSelections,
  type ProtomapsIslandSelection,
} from '@repo/core/pipeline/services/sources/protomapsSourceViews'
import GeoJSONReader from 'jsts/org/locationtech/jts/io/GeoJSONReader.js'
import GeometryFactory from 'jsts/org/locationtech/jts/geom/GeometryFactory.js'
import OverlayOp from 'jsts/org/locationtech/jts/operation/overlay/OverlayOp.js'
import IsValidOp from 'jsts/org/locationtech/jts/operation/valid/IsValidOp.js'

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
  {
    named,
    land,
    landBorder,
  }: {
    named: SourceFeature[]
    land: SourceFeature[]
    landBorder: SourceFeature[]
  },
  parameters: Readonly<typeof sourceFixture.parameters>,
) {
  const reader = new GeoJSONReader(new GeometryFactory())
  if (!landBorder.length)
    throw Error('Island extraction requires the regional land border.')
  const border = landBorder.map(feature => {
    if (
      !feature.geometry ||
      !['LineString', 'MultiLineString'].includes(feature.geometry.type)
    )
      throw Error('Regional land border input must contain lines.')
    const geometry = reader.read(feature.geometry)
    if (geometry.isEmpty() || !IsValidOp.isValid(geometry))
      throw Error('Regional land border input must contain valid, non-empty lines.')
    return geometry
  })
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
  const islandSelections: ProtomapsIslandSelection[] = records.map(row => ({
    sourceRecordId: row.sourceRecordId,
  }))
  // Coastline polygonisation has no native feature IDs. Content identifies the
  // source component; LandsD names and review identities never enter its identity.
  for (const feature of land) {
    if (
      !feature.geometry ||
      !['Polygon', 'MultiPolygon'].includes(feature.geometry.type)
    )
      throw Error('Coastline land input must contain polygons.')
    const geometry = feature.geometry
    const components =
      geometry.type === 'Polygon'
        ? [geometry.coordinates as number[][][]]
        : (geometry.coordinates as number[][][][])
    const componentIndexes = components.flatMap((coordinates, index) => {
      const polygon = reader.read({ type: 'Polygon', coordinates })
      if (polygon.isEmpty() || !IsValidOp.isValid(polygon))
        throw Error('Coastline land input must contain valid, non-empty polygons.')
      // A shared segment identifies land connected across the regional border.
      // A point contact alone does not make a detached island mainland.
      const mainland = border.some(
        line =>
          polygon.getEnvelopeInternal().intersects(line.getEnvelopeInternal()) &&
          OverlayOp.intersection(polygon, line).getLength() > 0,
      )
      return mainland ? [] : [index]
    })
    const sourceRecordId = `PROTOMAPS:LAND:${sha256(JSON.stringify(geometry))}`
    if (componentIndexes.length)
      islandSelections.push({ sourceRecordId, componentIndexes })
    records.push({
      sourceRecordId,
      properties: { kind: 'coastline-land', tags: feature.properties ?? {}, names: {} },
      sourceGeometry: geometry,
    })
  }
  const unique = new Map(records.map(row => [row.sourceRecordId, row]))
  for (const row of records) {
    if (JSON.stringify(row) !== JSON.stringify(unique.get(row.sourceRecordId)))
      throw Error(`Conflicting source feature ${row.sourceRecordId}`)
  }
  const selections = new Map<string, ProtomapsIslandSelection>()
  for (const selection of islandSelections) {
    const previous = selections.get(selection.sourceRecordId)
    if (previous && JSON.stringify(previous) !== JSON.stringify(selection))
      throw Error(`Conflicting island selection ${selection.sourceRecordId}`)
    selections.set(selection.sourceRecordId, selection)
  }
  return {
    records: [...unique.values()].sort((a, b) =>
      a.sourceRecordId.localeCompare(b.sourceRecordId),
    ),
    islandSelections: [...selections.values()].sort((a, b) =>
      a.sourceRecordId.localeCompare(b.sourceRecordId),
    ),
  }
}

export const protomapsSourceExtractionRule = registerRule(
  ruleDeclarationFromFixture(sourceFixture),
  extractSourceRecords,
)
export function protomapsSourceRecords(
  named: SourceFeature[],
  land: SourceFeature[],
  landBorder: SourceFeature[],
) {
  const bundle = protomapsSourceBundle(named, land, landBorder)
  return resolveProtomapsIslandSelections(bundle.records, bundle.islandSelections)
}

export function protomapsSourceBundle(
  named: SourceFeature[],
  land: SourceFeature[],
  landBorder: SourceFeature[],
) {
  return protomapsSourceExtractionRule.execute({ named, land, landBorder })
}
