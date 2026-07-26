import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import {
  prepareLandsdPlaceNameDivisionUpload,
  prepareLandsdSettlementFeatureCollection,
} from './landsdPlaceName.ts'

const sourceFeatureCollection = {
  features: [
    {
      geometry: { coordinates: [114.1577, 22.2855], type: 'Point' },
      properties: {
        DISTRICT: 'CW',
        ENG_NAME: 'Central',
        EXTRA_PROVENANCE: 'preserved',
        GEO_NAME_ID: 101,
        NAME_CHI: '中環',
        PLACE_CLASS: 'Settlement',
        PLACE_TYPE: 'Town',
      },
      type: 'Feature',
    },
    {
      geometry: { coordinates: [114.14, 22.3], type: 'Point' },
      properties: {
        GEO_NAME_ID: 202,
        PLACE_CLASS: 'Hydrographic',
        PLACE_TYPE: 'Harbour',
      },
      type: 'Feature',
    },
    {
      geometry: { coordinates: [114.18, 22.32], type: 'Point' },
      properties: {
        GEO_NAME_ID: 303,
        PLACE_CLASS: 'Topographic',
        PLACE_TYPE: 'Peak',
      },
      type: 'Feature',
    },
  ],
  type: 'FeatureCollection',
}

describe('LandsD Place Name preparation', () => {
  test('filters non-settlement features without changing source properties or coordinates', () => {
    const prepared = prepareLandsdSettlementFeatureCollection({
      ...sourceFeatureCollection,
      features: [
        ...sourceFeatureCollection.features,
        {
          properties: { GEO_NAME_ID: 404, PLACE_CLASS: 'Topographic' },
          type: 'Feature',
        },
      ],
    })

    expect(prepared).toEqual({
      features: [
        expect.objectContaining({
          geometry: { coordinates: [114.1577, 22.2855], type: 'Point' },
          id: '101',
          properties: expect.objectContaining({
            DISTRICT: 'CW',
            EXTRA_PROVENANCE: 'preserved',
            GEO_NAME_ID: 101,
            PLACE_CLASS: 'Settlement',
            PLACE_TYPE: 'Town',
          }),
        }),
      ],
      type: 'FeatureCollection',
    })
  })

  test('writes deterministic point-division IDs with source classification and provenance', async () => {
    const inputDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-landsd-input-'))
    const outputDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-landsd-test-'))
    const inputFile = join(inputDir, '2026-06-10.0.geojson')
    await writeFile(inputFile, JSON.stringify(sourceFeatureCollection), 'utf8')

    try {
      const prepared = await prepareLandsdPlaceNameDivisionUpload(
        inputFile,
        outputDir,
        '2026-06-10.0',
      )
      const file = await asyncBufferFromFile(prepared.filePath)
      const metadata = await parquetMetadataAsync(file)
      const rows = await parquetReadObjects({ file, metadata, compressors })

      expect(prepared).toMatchObject({
        regionCode: 'hk',
        source: 'hkgov-landsd',
        sourceSchemaVersion: '1.0',
        sourceVersion: '2026-06-10.0',
        theme: 'divisions',
        type: 'division',
      })
      expect(Number(metadata.num_rows)).toBe(1)
      expect(rows[0]).toMatchObject({
        district: 'CW',
        geo_name_id: '101',
        geometry: { coordinates: [114.1577, 22.2855], type: 'Point' },
        id: 'LANDSD:101',
        identifiers: { hkgovLandsd: { geoNameId: '101' } },
        names: { common: { en: 'Central', 'zh-hant': '中環' } },
        place_class: 'Settlement',
        place_type: 'Town',
        source_feature: expect.objectContaining({
          properties: expect.objectContaining({ EXTRA_PROVENANCE: 'preserved' }),
        }),
      })
    } finally {
      await rm(inputDir, { force: true, recursive: true })
      await rm(outputDir, { force: true, recursive: true })
    }
  })
})
