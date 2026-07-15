import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import { prepareHkgovHadDistrictUpload } from './hkgovHad.ts'

const INPUT_FILE = resolve(
  import.meta.dir,
  '../../../../data/hkgov/2022/hkgov-had-districts-20230609.geojson',
)

describe('HAD district GeoJSON preparation', () => {
  test('writes the registered release contract and preserves source provenance', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'harbour-hkgov-had-test-'))

    try {
      const prepared = await prepareHkgovHadDistrictUpload(
        INPUT_FILE,
        outputDir,
        '2022',
      )
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
        source_crs: 'EPSG:4326',
        source_feature: {
          properties: { AREA_CODE: 'STH', AREA_ID: 'D' },
          type: 'Feature',
        },
      })
    } finally {
      await rm(outputDir, { force: true, recursive: true })
    }
  })
})
