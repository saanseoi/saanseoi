import { describe, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  prepareHkgovPlandTpuNativeShpZip,
  readHkgovPlandTpuNativeShpZip,
} from './hkgovPland.ts'
import {
  prepareHkgovPlandNewTownNativeShpZip,
  readHkgovPlandNewTownNativeShpZip,
} from './hkgovPlandNewTown.ts'
import { parquetMetadataAsync, parquetReadObjects } from 'hyparquet'
import { compressors } from 'hyparquet-compressors'
import { asyncBufferFromFile } from 'hyparquet/src/node.js'

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

  test('canonicalises native 2021 non-noded aggregate boundaries', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'saanseoi-pland-2021-'))
    try {
      await expect(
        prepareHkgovPlandTpuNativeShpZip({
          inputFile: resolve(
            REPO_ROOT,
            'data/hkgov/csdi/archive/pland_rcd_1634022783366_65050/2023-Q4/source.zip',
          ),
          outputFile: join(outputDir, 'division.parquet'),
          sourceVersion: '2021',
          type: 'division',
        }),
      ).resolves.toMatchObject({
        divisionCount: 5269,
        sourceFeatureCount: 5088,
      })
    } finally {
      await rm(outputDir, { force: true, recursive: true })
    }
  }, 30_000)
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

  test('proves C&SD code 28 and its Planning domain code use the prepared 2021 division', async () => {
    const outputDir = await mkdtemp(join(tmpdir(), 'saanseoi-pland-new-town-2021-'))
    const outputFile = join(outputDir, 'division.parquet')
    try {
      await prepareHkgovPlandNewTownNativeShpZip({
        inputFile: resolve(
          REPO_ROOT,
          'data/hkgov/csdi/archive/pland_rcd_1634023103904_16865/2023-Q4/source.zip',
        ),
        outputFile,
        sourceVersion: '2021',
        type: 'division',
      })
      const file = await asyncBufferFromFile(outputFile)
      const preparedRows = await parquetReadObjects({
        compressors,
        file,
        metadata: await parquetMetadataAsync(file),
      })
      const prepared = preparedRows.find(
        row =>
          jsonRecord(row.identifiers)['PLAND:NEWTOWN'] === 'tsuen wan-tsing yi area',
      )
      const [bridgeFixture, divisionCodeFixture] = await Promise.all([
        readFixture<IdentifierBridgeFixture>(
          'identifierBridges/dr-hk-hkgov-censtatd-division-statistic-new-towns-2021.json',
        ),
        readFixture<DivisionCodeFixture>('divisionCodes/hkgov-pland-new-town.json'),
      ])
      const bridge = bridgeFixture.mappings.find(mapping => mapping.externalId === '28')
      const divisionCode = divisionCodeFixture.assignments.find(
        assignment => assignment.divisionCode === 'tsuen-wan-tsing-yi-area',
      )

      expect(prepared).toMatchObject({
        id: 'd0b06deb-4842-507b-8284-a3254615e5aa',
        identifiers: { 'PLAND:NEWTOWN': 'tsuen wan-tsing yi area' },
        source_version: '2021',
      })
      expect(bridge?.canonicalId).toBe(prepared?.id)
      expect(divisionCode?.canonicalId).toBe(prepared?.id)
    } finally {
      await rm(outputDir, { force: true, recursive: true })
    }
  })
})

type IdentifierBridgeFixture = {
  mappings: Array<{ canonicalId: string; externalId: string }>
}

type DivisionCodeFixture = {
  assignments: Array<{ canonicalId: string; divisionCode: string }>
}

async function readFixture<T>(path: string) {
  return JSON.parse(
    await readFile(resolve(REPO_ROOT, 'fixtures/meta', path), 'utf8'),
  ) as T
}

function jsonRecord(value: unknown) {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, unknown>
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  throw new Error('Prepared Planning Division identifiers must be a JSON object.')
}
