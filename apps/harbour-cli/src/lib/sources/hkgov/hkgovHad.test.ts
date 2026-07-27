import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import { prepareHkgovHadDistrictUpload } from './hkgovHad.ts'

describe('HAD district GeoJSON preparation', () => {
  test('writes the registered release contract and preserves source provenance', async () => {
    const inputDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-had-input-'))
    const outputDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-had-test-'))
    const inputFile = join(inputDir, 'districts.geojson')
    const polygon = {
      coordinates: [
        [
          [114.1, 22.1],
          [114.2, 22.1],
          [114.2, 22.2],
          [114.1, 22.2],
          [114.1, 22.1],
        ],
      ],
      type: 'Polygon',
    }
    const features = Array.from({ length: 18 }, (_, index) => {
      const isFirst = index === 0
      const areaId = isFirst ? 'D' : `D${index}`
      const areaCode = isFirst ? 'STH' : `AREA${index}`

      return {
        geometry: polygon,
        properties: {
          AREA_CODE: areaCode,
          AREA_ID: areaId,
          AREA_TYPE: 'DCD',
          CSDI_ADMIN_AREA_ID: index + 1,
          OBJECTID: index + 1,
        },
        type: 'Feature',
      }
    })

    await writeFile(
      inputFile,
      JSON.stringify({ features, type: 'FeatureCollection' }),
      'utf8',
    )

    try {
      const prepared = await prepareHkgovHadDistrictUpload(inputFile, outputDir, '2022')
      const file = await asyncBufferFromFile(prepared.filePath)
      const metadata = await parquetMetadataAsync(file)
      const rows = await parquetReadObjects({ file, metadata, compressors })

      expect(prepared).toMatchObject({
        cohortKey: '2022',
        regionCode: 'hk',
        source: 'hkgov-had',
        sourceSchemaVersion: '1.2',
        sourceVersion: '2022',
        theme: 'divisions',
        type: 'divisionArea',
      })
      expect(Number(metadata.num_rows)).toBe(18)
      expect(rows[0]).toMatchObject({
        area_code: 'STH',
        area_id: 'D',
        area_type: 'DCD',
        country: 'HK',
        geometry: { type: 'Polygon' },
        id: 'HAD:D',
        region: 'HK',
        source_feature: {
          properties: { AREA_CODE: 'STH', AREA_ID: 'D' },
          type: 'Feature',
        },
      })
    } finally {
      await rm(inputDir, { force: true, recursive: true })
      await rm(outputDir, { force: true, recursive: true })
    }
  })
})
