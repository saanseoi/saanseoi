import { describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { readHkgovPlandTpuNativeShpZip } from './hkgovPland.ts'
import { readHkgovPlandNewTownNativeShpZip } from './hkgovPlandNewTown.ts'

const REPO_ROOT = resolve(import.meta.dir, '../../../../../..')

const TPU_ARCHIVES = {
  '2001': 'pland_rcd_1636535158118_80594',
  '2006': 'pland_rcd_1636535383021_30595',
  '2011': 'pland_rcd_1634025118087_40967',
  '2016': 'pland_rcd_1634281887222_15002',
  '2021': 'pland_rcd_1634022783366_65050',
} as const

describe('Planning Department native TPU SHP intake', () => {
  test('matches historical GeoJSON planning-cell coverage after publisher duplicate removal', async () => {
    for (const [year, datasetId] of Object.entries(TPU_ARCHIVES)) {
      const native = await readHkgovPlandTpuNativeShpZip(
        resolve(REPO_ROOT, 'data/hkgov/csdi/archive', datasetId, '2023-Q4/source.zip'),
        year,
      )
      const baseline = JSON.parse(
        await readFile(
          resolve(
            REPO_ROOT,
            `data/hkgov/pland/${year}/hkgov-pland-tpu-${year}.geojson`,
          ),
          'utf8',
        ),
      ) as { features: Array<{ properties: Record<string, unknown> }> }
      const nativeFeatures = native.features as Array<{
        properties: Record<string, unknown>
      }>
      const key = (feature: { properties: Record<string, unknown> }) =>
        [
          feature.properties.PPU,
          feature.properties.SPU,
          feature.properties.TPU,
          year === '2021' ? feature.properties.Subunit : feature.properties.SB_VC,
        ].join(':')

      expect(nativeFeatures.length).toBeGreaterThanOrEqual(baseline.features.length)
      expect(new Set(nativeFeatures.map(key))).toEqual(
        new Set(baseline.features.map(key)),
      )
    }
  })
})

const NEW_TOWN_ARCHIVES = {
  '2006': 'pland_rcd_1636535014241_1352',
  '2011': 'pland_rcd_1634024777903_55269',
  '2016': 'pland_rcd_1634281414408_50485',
  '2021': 'pland_rcd_1634023103904_16865',
} as const

describe('Planning Department native New Town SHP intake', () => {
  test('matches historical GeoJSON feature and New Town coverage', async () => {
    for (const [year, datasetId] of Object.entries(NEW_TOWN_ARCHIVES)) {
      const native = await readHkgovPlandNewTownNativeShpZip(
        resolve(REPO_ROOT, 'data/hkgov/csdi/archive', datasetId, '2023-Q4/source.zip'),
      )
      const baseline = JSON.parse(
        await readFile(
          resolve(
            REPO_ROOT,
            `data/hkgov/pland/${year}/hkgov-pland-new-town-${year}.geojson`,
          ),
          'utf8',
        ),
      ) as { features: Array<{ properties: Record<string, unknown> }> }
      const nativeFeatures = native.features as Array<{
        properties: Record<string, unknown>
      }>

      expect(nativeFeatures).toHaveLength(baseline.features.length)
      expect(
        new Set(nativeFeatures.map(feature => String(feature.properties.NewTown_en))),
      ).toEqual(
        new Set(
          baseline.features.map(feature => String(feature.properties.NewTown_en)),
        ),
      )
    }
  })
})
