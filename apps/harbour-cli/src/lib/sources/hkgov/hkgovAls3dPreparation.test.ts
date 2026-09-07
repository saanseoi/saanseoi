import { expect, test } from 'bun:test'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareAls3dCollections } from './hkgovAls3dPreparation'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

async function delivery(duplicate: boolean) {
  const dir = await mkdtemp(join(tmpdir(), 'als-preflight-test-'))
  const features = [false, ...(duplicate ? [true] : [])].map(street => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [114.1, 22.3] },
    properties: {
      Address: {
        PremisesAddress: {
          BuildingCsuInformation: { CsuId: 'test-csu' },
          EngPremisesAddress: {
            BuildingName: 'TEST HOUSE',
            ...(street
              ? { EngStreet: { StreetName: 'TEST ROAD', BuildingNoFrom: '1' } }
              : {}),
            Eng3dAddress: [
              {
                EngFloor: { FloorNum: 1, FloorDescription: '1/F' },
                EngUnit: { UnitNo: '101', UnitDescriptor: 'FLAT' },
              },
            ],
          },
          ChiPremisesAddress: {
            BuildingName: '測試樓',
            Chi3dAddress: [
              {
                ChiFloor: { FloorNum: 1, FloorDescription: '1樓' },
                ChiUnit: { UnitNo: '101', UnitDescriptor: '室' },
              },
            ],
          },
        },
      },
    },
  }))
  const rows = features.map(
    (feature, index) =>
      ({
        id: `parent-${index}`,
        canonicalId: `parent-${index}`,
        hkgovCsuId: 'test-csu',
        engPremisesAddressJson: JSON.stringify(
          feature.properties.Address.PremisesAddress.EngPremisesAddress,
        ),
        chiPremisesAddressJson: JSON.stringify(
          feature.properties.Address.PremisesAddress.ChiPremisesAddress,
        ),
      }) as PreparedHkgovAlsRow,
  )
  await writeFile(
    join(dir, 'als_addresses_3d_test.geojson'),
    JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
  )
  return { dir, rows }
}

test('output-free 3D preparation validates inventories without creating a sidecar', async () => {
  const { dir, rows } = await delivery(false)
  try {
    const options = {
      sourceDir: dir,
      sourceVersion: '2020-01-01.0',
      outputFile: join(dir, 'output.parquet'),
      rows,
    }
    const review = await prepareAls3dCollections({ ...options, writeOutput: false })
    expect(await readdir(dir)).toEqual(['als_addresses_3d_test.geojson'])
    expect(review).toEqual({ collectionCount: 1, unitCount: 1, sourceCount: 1 })
    expect(await prepareAls3dCollections(options)).toEqual(review)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('output-free 3D preparation rejects competing owners of a shared building', async () => {
  const { dir, rows } = await delivery(true)
  try {
    await expect(
      prepareAls3dCollections({
        sourceDir: dir,
        sourceVersion: '2020-01-01.0',
        outputFile: join(dir, 'output.parquet'),
        rows,
        writeOutput: false,
      }),
    ).rejects.toThrow('shared building requires curation')
    expect(await readdir(dir)).toEqual(['als_addresses_3d_test.geojson'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
