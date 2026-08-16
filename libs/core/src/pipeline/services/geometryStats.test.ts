import { describe, expect, test } from 'bun:test'

import {
  calculateDistrictGeometryStatistics,
  calculateGeometryMeasurement,
} from './geometryStats'

const southWest: [number, number] = [114, 22]
const southEast: [number, number] = [114.01, 22]
const northEast: [number, number] = [114.01, 22.01]
const northWest: [number, number] = [114, 22.01]
const square = [southWest, southEast, northEast, northWest, southWest]

describe('geometry statistics', () => {
  test('measures a Polygon, including its closed boundary only once', () => {
    const measurement = calculateGeometryMeasurement('divisionArea', {
      type: 'Polygon',
      coordinates: [square],
    })
    expect(measurement.polygonCount).toBe(1)
    expect(measurement.boundarySegmentCount).toBe(4)
    expect(measurement.area).toBeGreaterThan(1)
    expect(measurement.area).toBeLessThan(1.3)
    expect(measurement.boundaryLength).toBeGreaterThan(4)
    expect(measurement.boundaryLength).toBeLessThan(5)
  })

  test('counts MultiPolygon constituents and subtracts polygon holes', () => {
    const multipart = calculateGeometryMeasurement('divisionArea', {
      type: 'MultiPolygon',
      coordinates: [
        [square],
        [
          [
            [114.02, 22],
            [114.03, 22],
            [114.03, 22.01],
            [114.02, 22.01],
            [114.02, 22],
          ],
        ],
      ],
    })
    const withHole = calculateGeometryMeasurement('divisionArea', {
      type: 'Polygon',
      coordinates: [
        square,
        [
          [114.002, 22.002],
          [114.008, 22.002],
          [114.008, 22.008],
          [114.002, 22.008],
          [114.002, 22.002],
        ],
      ],
    })
    expect(multipart.polygonCount).toBe(2)
    expect(multipart.boundarySegmentCount).toBe(8)
    expect(withHole.boundarySegmentCount).toBe(8)
    expect(withHole.area ?? 0).toBeLessThan(
      calculateGeometryMeasurement('divisionArea', {
        type: 'Polygon',
        coordinates: [square],
      }).area ?? 0,
    )
    expect(withHole.boundaryLength).toBeGreaterThan(
      calculateGeometryMeasurement('divisionArea', {
        type: 'Polygon',
        coordinates: [square],
      }).boundaryLength,
    )
  })

  test('measures LineString and MultiLineString lengths', () => {
    const line = calculateGeometryMeasurement('divisionBoundary', {
      type: 'LineString',
      coordinates: [southWest, southEast],
    })
    const multiLine = calculateGeometryMeasurement('divisionBoundary', {
      type: 'MultiLineString',
      coordinates: [
        [southWest, southEast],
        [southEast, northEast],
      ],
    })
    expect(line.boundaryLength).toBeGreaterThan(1)
    expect(multiLine.boundaryLength).toBeGreaterThan(line.boundaryLength)
    expect(line.boundarySegmentCount).toBe(1)
    expect(multiLine.boundarySegmentCount).toBe(2)
  })

  test('attributes shared boundaries to both adjacent districts', () => {
    const metrics = calculateDistrictGeometryStatistics(
      'divisionBoundary',
      [
        {
          id: 'edge',
          geometry: { type: 'LineString', coordinates: [southWest, southEast] },
          leftDivisionId: 'west',
          rightDivisionId: 'east',
        },
      ],
      new Map([
        ['west', 'district-west'],
        ['east', 'district-east'],
      ]),
    )
    expect(metrics.get('district-west')).toEqual(metrics.get('district-east'))
    expect(metrics.get('district-west')?.featureCount).toBe(1)
    expect(metrics.get('district-west')?.boundarySegmentCount).toBe(1)
  })

  test('does not count repeated positions or an already-closed ring twice', () => {
    const polygon = calculateGeometryMeasurement('divisionArea', {
      type: 'Polygon',
      coordinates: [
        [
          [114, 22],
          [114.01, 22],
          [114.01, 22],
          [114.01, 22.01],
          [114, 22.01],
          [114, 22],
        ],
      ],
    })
    expect(polygon.boundarySegmentCount).toBe(4)
  })

  test('rejects empty and invalid geometry instead of silently skipping it', () => {
    expect(() =>
      calculateGeometryMeasurement('divisionArea', {
        type: 'Polygon',
        coordinates: [],
      }),
    ).toThrow('without rings')
    expect(() =>
      calculateGeometryMeasurement('divisionBoundary', {
        type: 'LineString',
        coordinates: [
          [200, 22],
          [114, 22],
        ],
      }),
    ).toThrow('outside EPSG:4326')
  })
})
