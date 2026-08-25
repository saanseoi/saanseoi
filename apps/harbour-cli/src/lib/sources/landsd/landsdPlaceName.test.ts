import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, test } from 'bun:test'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import { buildDivisionHierarchyLookup } from '@repo/core/pipeline/services/division'

import {
  prepareLandsdPlaceNameDivisionUpload,
  readLandsdPlaceNameArchive,
} from './landsdPlaceName.ts'

describe('LandsD native Place Name FileGDB intake', () => {
  test('joins GEO_PLACE_NAME geometry to the publisher PLACE_NAME labels', async () => {
    const repoRoot = resolve(import.meta.dir, '../../../../../..')
    const features = await readLandsdPlaceNameArchive(
      await readFile(
        join(
          repoRoot,
          'data/hkgov/csdi/archive/landsd_rcd_1648571595120_89752/2026-Q2/source.zip',
        ),
      ),
    )

    expect(features).toHaveLength(2706)
    expect(
      features.filter(feature => feature.properties.PLACE_CLASS === 'Settlement'),
    ).toHaveLength(1613)
    expect(features[0]).toMatchObject({
      geometry: { type: 'Point' },
      properties: {
        GEO_NAME_ID: '5062',
        PLACE_CLASS: 'Topographic',
        PLACE_TYPE: 'Hill',
      },
    })
    expect(features.find(feature => feature.id === '1')?.placeNames).toContainEqual({
      nameEn: 'A Chau',
      nameZhHant: '鴉洲',
      status: 'Official',
    })
  })

  test('writes the common hierarchy preflight columns for settlement divisions', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'saanseoi-landsd-place-name-'))
    const inputFile = join(outputDir, 'settlements.geojson')
    try {
      await writeFile(
        inputFile,
        JSON.stringify({
          features: [
            {
              geometry: { coordinates: [114.15, 22.28], type: 'Point' },
              properties: {
                GEO_NAME_ID: '123',
                NAME_EN: 'Example Settlement',
                PLACE_CLASS: 'Settlement',
                PLACE_TYPE: 'Village',
              },
              type: 'Feature',
            },
          ],
          type: 'FeatureCollection',
        }),
      )
      const prepared = await prepareLandsdPlaceNameDivisionUpload(
        inputFile,
        outputDir,
        '2026-06-10.0',
      )

      const hierarchy = await buildDivisionHierarchyLookup(
        await asyncBufferFromFile(prepared.filePath),
      )

      expect(hierarchy.get('LANDSD:123')).toMatchObject({ level: 5 })
    } finally {
      await rm(outputDir, { force: true, recursive: true })
    }
  })
})
