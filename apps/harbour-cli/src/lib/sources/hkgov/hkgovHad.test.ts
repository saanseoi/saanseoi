import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { describe, expect, test } from 'bun:test'
import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import {
  prepareHkgovHadDistrictUpload,
  readHkgovHadDistrictArchive,
} from './hkgovHad.ts'

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
      const prepared = await prepareHkgovHadDistrictUpload(
        inputFile,
        outputDir,
        '2022',
        {
          sourceArchive: {
            key: 'by-source/hk/hkgov-csdi/had/source.zip',
            sha256: 'a'.repeat(64),
          },
        },
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
        source_geometry: { type: 'Polygon' },
        source_properties: { AREA_CODE: 'STH', AREA_ID: 'D' },
      })
      expect(rows[0]?.sources).toEqual([
        {
          areaCode: 'STH',
          areaId: 'D',
          dataset: 'hkgov-had',
          sourceArchiveKey: 'by-source/hk/hkgov-csdi/had/source.zip',
          sourceArchiveSha256: 'a'.repeat(64),
        },
      ])
      expect(rows[0]).not.toHaveProperty('source_feature')
    } finally {
      await rm(inputDir, { force: true, recursive: true })
      await rm(outputDir, { force: true, recursive: true })
    }
  })

  test('reads the native FGDB DCD layer with the historical district coverage', async () => {
    const repoRoot = resolve(import.meta.dir, '../../../../../..')
    const [archive, baseline] = await Promise.all([
      readFile(
        join(
          repoRoot,
          'data/hkgov/csdi/archive/had_rcd_1634523272907_75218/2025-Q3/source.zip',
        ),
      ),
      readFile(
        join(repoRoot, 'data/hkgov/had/2022/hkgov-had-districts-20230609.geojson'),
        'utf8',
      ),
    ])
    const native = await readHkgovHadDistrictArchive(archive)
    const nativeFeatures = native.features as Array<{
      geometry?: { coordinates?: unknown; type?: string }
      properties?: { AREA_ID?: unknown }
    }>
    const historical = JSON.parse(baseline) as {
      features: Array<{
        geometry: { coordinates: unknown[]; type: string }
        properties: { AREA_ID: string }
      }>
    }

    expect(nativeFeatures).toHaveLength(18)
    expect(new Set(nativeFeatures.map(feature => feature.properties?.AREA_ID))).toEqual(
      new Set(historical.features.map(feature => feature.properties.AREA_ID)),
    )
    for (const feature of nativeFeatures) {
      const areaId = String(feature.properties?.AREA_ID)
      const matching = historical.features.find(
        candidate => candidate.properties.AREA_ID === areaId,
      )
      expect(matching).toBeDefined()
      expect(feature.geometry?.type).toBe(matching?.geometry.type)
      // The native FGDB carries an additional closure coordinate per district;
      // its shape and district coverage are otherwise the historical baseline.
      expect(positionCount(feature.geometry)).toBe(
        positionCount(matching?.geometry) + 1,
      )
    }
  })
})

function positionCount(geometry: unknown) {
  if (!geometry || typeof geometry !== 'object') return 0
  const value = geometry as { coordinates?: unknown; type?: unknown }
  if (value.type === 'Polygon' && Array.isArray(value.coordinates))
    return value.coordinates.flat().length
  if (value.type === 'MultiPolygon' && Array.isArray(value.coordinates))
    return value.coordinates.flat(2).length
  return 0
}
