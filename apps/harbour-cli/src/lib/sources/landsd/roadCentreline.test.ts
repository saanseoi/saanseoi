import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import type { GeoJsonGeometry } from '@repo/core/pipeline/geojson'

import {
  aggregateRoadCentrelineGeometry,
  buildRoadCentrelineReleaseStats,
  deriveRoadCentrelineDistrictIds,
  normaliseRoadCentrelineFeatures,
  readLandsdRoadCentrelineArchive,
  type RoadCentrelineDistrict,
} from './roadCentreline.ts'

const sourceLine: GeoJsonGeometry = {
  type: 'LineString',
  coordinates: [
    [836694.05, 819069.8],
    [836704.05, 819079.8],
  ],
}

const districts: RoadCentrelineDistrict[] = [
  {
    id: 'district-west',
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [114.17, 22.3],
          [114.18, 22.3],
          [114.18, 22.32],
          [114.17, 22.32],
          [114.17, 22.3],
        ],
      ],
    },
  },
  {
    id: 'district-east',
    geometry: {
      type: 'Polygon' as const,
      coordinates: [
        [
          [114.18, 22.3],
          [114.2, 22.3],
          [114.2, 22.32],
          [114.18, 22.32],
          [114.18, 22.3],
        ],
      ],
    },
  },
]

const feature = (overrides: Record<string, unknown> = {}) => ({
  geometry: sourceLine,
  properties: {
    STREET_CENTRELINE_ID: 1,
    STREET_CODE: 'A001',
    STREET_NAME_EN: 'Example Road',
    STREET_NAME_TC: '示例道',
    ...overrides,
  },
})

describe('LandsD Road Centreline matching', () => {
  test('reads both observed native FGDB schema revisions', async () => {
    const repoRoot = resolve(import.meta.dir, '../../../../../..')
    const [legacy, current] = await Promise.all(
      ['2024-Q1', '2026-Q2'].map(async releaseSlot =>
        readLandsdRoadCentrelineArchive(
          await readFile(
            join(
              repoRoot,
              'data/hkgov/csdi/archive/landsd_rcd_1637310758814_80061',
              releaseSlot,
              'source.zip',
            ),
          ),
        ),
      ),
    )

    expect(legacy).toMatchObject({
      layerName: 'GEO_STREET_CENTRELINE',
      sourceFeatureCount: 36976,
    })
    expect(current).toMatchObject({
      layerName: 'RoadCentreLine',
      sourceFeatureCount: 39724,
    })
    expect(current?.features[1]).toMatchObject({
      geometry: { type: 'LineString' },
      properties: {
        ENGLISHSTREETNAME: 'FUNG KAM STREET',
        STREETCENTRELINEID: 1810253285,
      },
    })
  })

  test('retains native EPSG:2326 geometry and uses English plus derived district IDs to resolve a collision', () => {
    const result = normaliseRoadCentrelineFeatures({
      releaseId: 'dr-hk-hkgov-landsd-road-centreline-2026-q2',
      features: [feature()],
      districts,
      streets: [
        {
          id: 'street-west',
          districtIds: ['district-west'],
          englishName: 'Example Road',
          traditionalChineseName: '示例道',
        },
        {
          id: 'street-east',
          districtIds: ['district-east'],
          englishName: 'Example Road',
          traditionalChineseName: '另一示例道',
        },
      ],
    })

    expect(result.issues).toEqual([])
    expect(result.records).toHaveLength(1)
    expect(result.records[0]).toMatchObject({
      streetId: 'street-east',
      sourceGeometry: sourceLine,
      derivedDistrictIds: ['district-east'],
      geometry: {
        type: 'LineString',
        coordinates: [
          [114.18100933, 22.31060243],
          [114.18110638, 22.31069274],
        ],
      },
    })
  })

  test('does not guess an ambiguous English-name match when the overlay cannot resolve it', () => {
    const result = normaliseRoadCentrelineFeatures({
      releaseId: 'release',
      features: [feature()],
      districts: [],
      streets: [
        {
          id: 'street-west',
          districtIds: ['district-west'],
          englishName: 'Example Road',
          traditionalChineseName: '示例道',
        },
        {
          id: 'street-east',
          districtIds: ['district-east'],
          englishName: 'Example Road',
          traditionalChineseName: '另一示例道',
        },
      ],
    })

    expect(result.records).toEqual([])
    expect(result.issues).toEqual([
      expect.objectContaining({
        candidates: ['street-west', 'street-east'],
        kind: 'ambiguous',
      }),
    ])
  })

  test('does not assign a district for a point-only boundary touch', () => {
    expect(
      deriveRoadCentrelineDistrictIds(
        {
          type: 'LineString',
          coordinates: [
            [114.2, 22.32],
            [114.21, 22.33],
          ],
        },
        districts,
      ),
    ).toEqual([])
  })

  test('emits canonical district distribution metrics for the Stats map', () => {
    const result = normaliseRoadCentrelineFeatures({
      releaseId: 'release',
      features: [feature()],
      districts,
      streets: [
        {
          id: 'street-east',
          districtIds: ['district-east'],
          englishName: 'EXAMPLE-ROAD',
          traditionalChineseName: '示例道',
        },
      ],
    })
    const stats = buildRoadCentrelineReleaseStats(result.records)

    expect(stats).toContainEqual({
      dimension: 'records',
      groupBy: 'district',
      groupValue: 'district-east',
      metric: 'distribution',
      metricUnit: 'count',
      value: 1,
    })
  })

  test('keeps a publisher MultiLineString as a MultiLineString street aggregate', () => {
    const result = normaliseRoadCentrelineFeatures({
      releaseId: 'release',
      features: [
        {
          ...feature(),
          geometry: {
            type: 'MultiLineString',
            coordinates: [sourceLine.coordinates],
          },
        },
      ],
      streets: [
        {
          id: 'street-east',
          districtIds: [],
          englishName: 'Example Road',
          traditionalChineseName: '示例道',
        },
      ],
    })

    expect(aggregateRoadCentrelineGeometry(result.records)[0]?.geometry.type).toBe(
      'MultiLineString',
    )
  })
})
