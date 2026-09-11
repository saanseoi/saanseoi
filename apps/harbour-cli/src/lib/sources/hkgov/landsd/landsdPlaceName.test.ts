import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

import { describe, expect, test } from 'bun:test'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

import {
  buildDivisionHierarchyLookup,
  normaliseDivisionRow,
} from '@repo/core/pipeline/services/divisions/division'

import {
  prepareLandsdPlaceNameDivisionUpload,
  landsdSettlementDivisionRows,
  readLandsdPlaceNameArchive,
} from './landsdPlaceName.ts'

describe('LandsD native Place Name FileGDB intake', () => {
  test('official relationship names precede aliases without modifying native properties', () => {
    const feature = {
      id: '123',
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [114.15, 22.28] },
      sourceGeometry: { type: 'Point' as const, coordinates: [832000, 816000] },
      properties: {
        GEO_NAME_ID: '123',
        PLACE_CLASS: 'Settlement',
        PLACE_TYPE: 'Village',
      },
      placeNames: [
        { nameEn: 'Alias', nameZhHant: '別名', status: 'Alias' as const },
        { nameEn: 'Official', nameZhHant: '正名', status: 'Official' as const },
      ],
    }
    const original = structuredClone(feature)
    const [row] = landsdSettlementDivisionRows([feature])
    expect(row).toBeDefined()
    if (!row) throw new Error('Expected a settlement projection.')
    const normalised = normaliseDivisionRow(row)
    expect(normalised.i18n).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locale: 'en', name: 'Official', nameAlts: 'Alias' }),
        expect.objectContaining({ locale: 'zh-hant', name: '正名', nameAlts: '別名' }),
      ]),
    )
    expect(normalised.base.geometry).toEqual(feature.geometry)
    expect(feature).toEqual(original)
    expect(
      landsdSettlementDivisionRows([
        {
          ...feature,
          properties: { ...feature.properties, PLACE_CLASS: 'Topographic' },
        },
      ]),
    ).toEqual([])
  })

  test('joins GEO_PLACE_NAME geometry to the publisher PLACE_NAME labels', async () => {
    const repoRoot = resolve(import.meta.dir, '../../../../../../..')
    const features = await readLandsdPlaceNameArchive(
      await readFile(
        join(
          repoRoot,
          'data/hkgov/csdi/archive/landsd_rcd_1648571595120_89752/2026-Q2/source.zip',
        ),
      ),
    )

    expect(features).toHaveLength(2706)
    expect(features[0]?.sourceGeometry).not.toEqual(features[0]?.geometry)
    const firstFeature = features[0]
    if (!firstFeature?.sourceGeometry)
      throw new Error('LandsD feature is missing source geometry')
    expect(
      (firstFeature.sourceGeometry as { coordinates: number[] }).coordinates[0],
    ).toBeGreaterThan(100000)
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
        { source: 'hkgov-landsd', sourceVersion: '2026-06-10.0' },
      )

      expect(hierarchy.get('LANDSD:123')).toMatchObject({ level: 5 })
    } finally {
      await rm(outputDir, { force: true, recursive: true })
    }
  })
})
