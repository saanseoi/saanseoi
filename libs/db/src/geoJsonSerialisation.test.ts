import { expect, test } from 'bun:test'
import { sqliteTable } from 'drizzle-orm/sqlite-core'
import { jsonText, jsonTextOrBinary } from './schema/shared'
import { orderGeoJsonText, stringifyGeoJson } from './geoJsonSerialisation'

test('all coordinate geometries order type, optional bbox, coordinates and foreign members', () => {
  for (const type of [
    'Point',
    'MultiPoint',
    'LineString',
    'MultiLineString',
    'Polygon',
    'MultiPolygon',
  ]) {
    for (const bounds of [{}, { bbox: [1, 2, 3, 4] }]) {
      const geometry = {
        coordinates: [1, 2, 3],
        extension: 'retained',
        ...bounds,
        type,
      }
      const result = stringifyGeoJson(geometry)
      expect(Object.keys(JSON.parse(result))).toEqual([
        'type',
        ...('bbox' in bounds ? ['bbox'] : []),
        'coordinates',
        'extension',
      ])
      expect(JSON.parse(result)).toEqual(geometry)
      expect(orderGeoJsonText(JSON.stringify(geometry))).toBe(result)
    }
  }
})

test('nested collections are ordered without mutating coordinates or ordinary properties', () => {
  const point = { coordinates: [114.1406108, 22.5276144], type: 'Point' }
  const value = {
    type: 'Feature',
    properties: { z: 1, a: 2 },
    geometry: {
      geometries: [point],
      bbox: [114, 22, 115, 23],
      type: 'GeometryCollection',
    },
  }
  const result = JSON.parse(stringifyGeoJson(value))
  expect(Object.keys(result.geometry)).toEqual(['type', 'bbox', 'geometries'])
  expect(Object.keys(result.geometry.geometries[0])).toEqual(['type', 'coordinates'])
  expect(Object.keys(result.properties)).toEqual(['z', 'a'])
  expect(Object.keys(point)).toEqual(['coordinates', 'type'])
  expect(result).toEqual(value)
  expect(orderGeoJsonText('not JSON')).toBe('not JSON')
  expect(orderGeoJsonText('{"coordinates":broken}')).toBe('{"coordinates":broken}')
})

test('shared database JSON and geometry bindings enforce the same order', () => {
  const table = sqliteTable('geometry_order', {
    sourceGeometry: jsonText('sourceGeometry'),
    geometry: jsonTextOrBinary('geometry'),
  })
  const point = { coordinates: [114, 22], type: 'Point' }
  for (const column of [table.sourceGeometry, table.geometry])
    expect(column.mapToDriverValue(point)).toBe(
      '{"type":"Point","coordinates":[114,22]}',
    )
  const binary = new Uint8Array([1, 2, 3])
  expect(table.geometry.mapToDriverValue(binary)).toBe(binary)
})

test('serialisation preserves attribution type order after alphabetical archive sorting', () => {
  const source = {
    dataset: 'openstreetmap',
    license: 'ODbL-1.0',
    property: '',
    publisher: 'openstreetmap',
    recordId: 'node',
    upstreamOf: 'overture',
  }
  const text = stringifyGeoJson({ properties: { sources: [source] } })
  expect(Object.keys(JSON.parse(text).properties.sources[0])).toEqual([
    'property',
    'publisher',
    'upstreamOf',
    'dataset',
    'recordId',
    'license',
  ])
  expect(JSON.parse(text).properties.sources[0]).toEqual(source)
  expect(orderGeoJsonText(JSON.stringify({ properties: { sources: [source] } }))).toBe(
    text,
  )
})
