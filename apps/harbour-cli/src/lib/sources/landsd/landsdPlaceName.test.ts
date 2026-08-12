import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { readLandsdPlaceNameArchive } from './landsdPlaceName.ts'

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
})
