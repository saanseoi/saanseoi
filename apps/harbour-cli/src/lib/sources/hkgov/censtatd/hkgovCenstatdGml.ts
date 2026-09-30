import { XMLParser } from 'fast-xml-parser'
import { projectHk80Geometry } from '../hk1980'

import type { GeoJsonGeometry, GeoJsonPosition } from '@repo/core/pipeline/geojson'

export type HkgovCenstatdGmlFeature = {
  geometry: GeoJsonGeometry
  properties: Record<string, unknown>
  sourceGeometry: GeoJsonGeometry
  sourceGml: Record<string, unknown>
  type: 'Feature'
}

/**
 * Reads native EPSG:2326 C&SD WFS GML 3.2. WFS supplies the CRS's
 * northing/easting axis order; the adapter retains source geometry as
 * easting/northing coordinates and projects it to canonical EPSG:4326.
 */
export function parseHkgovCenstatdDistrictGml(
  input: string,
  layerName: string,
): HkgovCenstatdGmlFeature[] {
  const document = new XMLParser({
    attributeNamePrefix: '@_',
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: true,
  }).parse(input) as Record<string, unknown>
  const collection = findElement(document, 'FeatureCollection')
  if (!isRecord(collection)) {
    throw new Error('C&SD district GML must contain a WFS FeatureCollection.')
  }

  const members = asArray(
    findElement(collection, 'member') ?? findElement(collection, 'featureMember'),
  )
  if (members.length === 0) {
    throw new Error('C&SD district GML FeatureCollection contains no members.')
  }

  return members.map((member, index) => {
    if (!isRecord(member)) {
      throw new Error(`C&SD district GML member ${index + 1} is invalid.`)
    }
    const feature = findElement(member, layerName)
    if (!isRecord(feature)) {
      throw new Error(
        `C&SD district GML member ${index + 1} must contain ${layerName}.`,
      )
    }
    const shape =
      findElement(feature, 'SHAPE') ?? findElement(feature, 'geometryProperty')
    if (!isRecord(shape)) {
      throw new Error(`C&SD district GML member ${index + 1} has no source geometry.`)
    }

    const properties: Record<string, unknown> = {}
    for (const [name, value] of Object.entries(feature)) {
      const localName = name.split(':').at(-1)
      if (
        !localName ||
        localName === 'SHAPE' ||
        localName === 'geometryProperty' ||
        name.startsWith('@_')
      )
        continue
      properties[localName] = value
    }

    const sourceGeometry = parseGmlSurface(shape, index)
    return {
      geometry: projectHk80Geometry(sourceGeometry),
      properties,
      sourceGeometry,
      sourceGml: feature,
      type: 'Feature',
    }
  })
}

function parseGmlSurface(
  shape: Record<string, unknown>,
  index: number,
): GeoJsonGeometry {
  const multiSurface = findElement(shape, 'MultiSurface')
  if (isRecord(multiSurface)) {
    assertHk80Crs(multiSurface, index)
    const polygons = asArray(findElement(multiSurface, 'surfaceMember')).map(member =>
      parsePolygonMember(member, index),
    )
    if (polygons.length === 0) {
      throw new Error(
        `C&SD district GML member ${index + 1} has an empty MultiSurface.`,
      )
    }
    return { coordinates: polygons, type: 'MultiPolygon' }
  }

  const polygon = findElement(shape, 'Polygon')
  if (isRecord(polygon)) {
    return { coordinates: parsePolygon(polygon, index), type: 'Polygon' }
  }

  throw new Error(
    `C&SD district GML member ${index + 1} must use gml:MultiSurface or gml:Polygon.`,
  )
}

function parsePolygonMember(value: unknown, index: number): GeoJsonPosition[][] {
  const polygon = isRecord(value) ? findElement(value, 'Polygon') : undefined
  if (!isRecord(polygon)) {
    throw new Error(`C&SD district GML member ${index + 1} has a non-polygon surface.`)
  }
  return parsePolygon(polygon, index)
}

function parsePolygon(
  value: Record<string, unknown>,
  index: number,
): GeoJsonPosition[][] {
  const exterior = findElement(value, 'exterior')
  if (!isRecord(exterior)) {
    throw new Error(
      `C&SD district GML member ${index + 1} polygon has no exterior ring.`,
    )
  }
  const interiors = asArray(findElement(value, 'interior'))
  return [
    parseLinearRing(exterior, index),
    ...interiors.map(interior => {
      if (!isRecord(interior)) {
        throw new Error(
          `C&SD district GML member ${index + 1} has an invalid interior ring.`,
        )
      }
      return parseLinearRing(interior, index)
    }),
  ]
}

function parseLinearRing(
  value: Record<string, unknown>,
  index: number,
): GeoJsonPosition[] {
  const ring = findElement(value, 'LinearRing')
  const posList = isRecord(ring) ? findElement(ring, 'posList') : undefined
  const text = textValue(posList)
  if (!text) {
    throw new Error(`C&SD district GML member ${index + 1} has an empty LinearRing.`)
  }

  const values = text.split(/\s+/).map(Number)
  if (
    values.some(value => !Number.isFinite(value)) ||
    values.length < 8 ||
    values.length % 2
  ) {
    throw new Error(`C&SD district GML member ${index + 1} has an invalid posList.`)
  }

  const positions: GeoJsonPosition[] = []
  for (let offset = 0; offset < values.length; offset += 2) {
    const northing = values[offset]
    const easting = values[offset + 1]
    if (northing === undefined || easting === undefined) continue
    positions.push([easting, northing])
  }
  return positions
}

function assertHk80Crs(value: Record<string, unknown>, index: number) {
  const srsName = value['@_srsName']
  if (srsName !== 'urn:ogc:def:crs:EPSG::2326') {
    throw new Error(
      `C&SD district GML member ${index + 1} must use EPSG:2326; received ${String(srsName)}.`,
    )
  }
}

function findElement(value: Record<string, unknown>, localName: string) {
  return Object.entries(value).find(
    ([name]) => name.split(':').at(-1) === localName,
  )?.[1]
}

function textValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null
}

function asArray(value: unknown) {
  return value === undefined ? [] : Array.isArray(value) ? value : [value]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
