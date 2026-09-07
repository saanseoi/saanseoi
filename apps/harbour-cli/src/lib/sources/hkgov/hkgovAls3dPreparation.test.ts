import { expect, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
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

test('skip mode retains a block-free parent despite mismatched 3D block references', async () => {
  const { dir, rows } = await delivery(false)
  try {
    const file = join(dir, 'als_addresses_3d_test.geojson')
    const input = JSON.parse(await readFile(file, 'utf8'))
    const premises = input.features[0].properties.Address.PremisesAddress
    premises.EngPremisesAddress.EngBlock = { BlockDescriptor: 'BLK', BlockNo: '6' }
    premises.ChiPremisesAddress.ChiBlock = { BlockDescriptor: '座', BlockNo: '7' }
    await writeFile(file, JSON.stringify(input, null, 2))
    const originalRows = structuredClone(rows)
    const options = {
      sourceDir: dir,
      sourceVersion: '2020-01-01.0',
      outputFile: join(dir, 'output.parquet'),
      rows,
    }
    await expect(
      prepareAls3dCollections({ ...options, writeOutput: false }),
    ).rejects.toThrow('matching BLK/座 references')
    const review = await prepareAls3dCollections({
      ...options,
      writeOutput: false,
      skipCurationChecks: true,
    })
    expect(review).toEqual({ collectionCount: 1, unitCount: 1, sourceCount: 1 })
    expect(
      await prepareAls3dCollections({ ...options, skipCurationChecks: true }),
    ).toEqual(review)
    expect(rows).toEqual(originalRows)
    const records = (await readFile(`${options.outputFile}.address3d.jsonl`, 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(records.find(record => record.kind === 'collection').address2dId).toBe(
      'parent-0',
    )
    expect(
      records.find(record => record.kind === 'source').rawProperties.properties.Address
        .PremisesAddress,
    ).toEqual(premises)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

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

test('skipping curation checks retains separate shared-building owners in review and output', async () => {
  const { dir, rows } = await delivery(true)
  try {
    const options = {
      sourceDir: dir,
      sourceVersion: '2020-01-01.0',
      outputFile: join(dir, 'output.parquet'),
      rows,
      skipCurationChecks: true,
    }
    const review = await prepareAls3dCollections({ ...options, writeOutput: false })
    expect(review).toEqual({ collectionCount: 2, unitCount: 2, sourceCount: 2 })
    expect(await readdir(dir)).toEqual(['als_addresses_3d_test.geojson'])
    expect(await prepareAls3dCollections(options)).toEqual(review)
    expect(rows.map(row => row.id)).toEqual(['parent-0', 'parent-1'])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
