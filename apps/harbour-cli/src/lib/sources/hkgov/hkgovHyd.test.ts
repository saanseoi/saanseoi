import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  HKGOV_TD_PEDESTRIAN_STREET_LAYERS,
  readHkgovTdPedestrianStreetArchive,
} from './hkgovHyd.ts'

describe('TD pedestrian street native FileGDB intake', () => {
  test('reads all publisher layers and maps their published schema', async () => {
    const repoRoot = resolve(import.meta.dir, '../../../../../..')
    const archive = await readFile(
      join(
        repoRoot,
        'data/hkgov/csdi/archive/td_rcd_1697081765097_37742/2025-Q1/source.zip',
      ),
    )
    const layers = readHkgovTdPedestrianStreetArchive(archive)

    expect(Object.keys(layers).sort()).toEqual(
      [...HKGOV_TD_PEDESTRIAN_STREET_LAYERS].sort(),
    )
    expect(
      Object.fromEntries(
        Object.entries(layers).map(([name, layer]) => [name, layer.features.length]),
      ),
    ).toEqual({
      Full_Time_Pedestrian_Street: 8,
      Hawker_Street: 3,
      Market_Street: 11,
      Part_time_Pedestrian_Street: 26,
      Traffic_Calming_Street: 31,
    })

    expect(layers.Full_Time_Pedestrian_Street.features[0]).toEqual({
      geometry: expect.objectContaining({ type: 'Polygon' }),
      properties: {
        EN_Description: 'Full-Time Pedestrian Street',
        End_Time: undefined,
        OBJECTID: 44,
        Region: 'HK',
        SC_Description: '全日行人专用街道',
        SHAPE_Area: 2706.6111331315583,
        SHAPE_Length: 656.3103296592857,
        Start_Time: undefined,
        TC_Description: '全日行人專用街道',
      },
      type: 'Feature',
    })

    // A publisher-null SHAPE is retained as a source assertion rather than
    // being silently dropped by the FileGDB reader.
    expect(
      layers.Full_Time_Pedestrian_Street.features.find(
        feature => feature.properties.OBJECTID === 46,
      )?.geometry,
    ).toBeNull()
  })
})
