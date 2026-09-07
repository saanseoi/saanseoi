import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareAls3dCollections } from './hkgovAls3dPreparation'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { consolidateEquivalentHkgovAlsPremises } from './hkgovAlsEvidence'

test('Bik Tsui precedence variants retain both assertions in one 456-unit collection', async () => {
  const units = Array.from({ length: 456 }, (_, i) => ({
    floor: Math.floor(i / 19) + 1,
    unit: (i % 19) + 1,
  }))
  const features = ['N', 'Y'].map(precedence => ({
    type: 'Feature' as const,
    geometry: { type: 'Point' as const, coordinates: [114.12924, 22.3563] },
    properties: {
      Address: {
        PremisesAddress: {
          BuildingCsuInformation: { CsuId: '3136124110T20170220' },
          GeoAddress: '3136124110T20170220',
          EngPremisesAddress: {
            BuildingName: 'BIK TSUI HSE',
            EngEstate: { EstateName: 'KWAI TSUI ESTATE' },
            EngBlock: {
              BlockNo: '1',
              BlockDescriptor: 'BLK',
              BlockDescriptorPrecedenceIndicator: precedence,
            },
            Eng3dAddress: units.map(({ floor, unit }) => ({
              EngFloor: { FloorNum: floor, FloorDescription: `${floor}/F` },
              EngUnit: {
                UnitNo: `${floor}${String(unit).padStart(2, '0')}`,
                UnitDescriptor: 'FLAT',
              },
            })),
          },
          ChiPremisesAddress: {
            BuildingName: '碧翠樓',
            ChiEstate: { EstateName: '葵翠邨' },
            ChiBlock: { BlockNo: '1', BlockDescriptor: '座' },
            Chi3dAddress: units.map(({ floor, unit }) => ({
              ChiFloor: { FloorNum: floor, FloorDescription: `${floor}樓` },
              ChiUnit: {
                UnitNo: `${floor}${String(unit).padStart(2, '0')}`,
                UnitDescriptor: '室',
              },
            })),
          },
        },
      },
    },
  }))
  const maps = {
    areaByEn: new Map(),
    areaByZh: new Map(),
    ambiguousAreaEn: new Set<string>(),
    ambiguousAreaZh: new Set<string>(),
    districtByEn: new Map(),
    districtByZh: new Map(),
    ambiguousDistrictEn: new Set<string>(),
    ambiguousDistrictZh: new Set<string>(),
    countryId: null,
    snapshotId: 'test',
  }
  const rows = consolidateEquivalentHkgovAlsPremises(
    features.map((feature, index) =>
      normaliseHkgovAlsFeature(
        feature,
        '2d.geojson',
        index + 1,
        'test',
        '2099-01-01.0',
        maps,
        true,
        new Map(),
        new Map(),
        new Map(),
      ),
    ),
  ).rows
  expect(rows).toHaveLength(1)
  const dir = await mkdtemp(join(tmpdir(), 'kwai-tsui-'))
  try {
    await writeFile(
      join(dir, 'als_addresses_3d_test.geojson'),
      JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
    )
    const outputFile = join(dir, 'test.parquet')
    // A date outside fixture ranges isolates precedence deduplication from other estates' backfills.
    expect(
      await prepareAls3dCollections({
        sourceDir: dir,
        sourceVersion: '2099-01-01.0',
        outputFile,
        rows,
      }),
    ).toEqual({ collectionCount: 1, unitCount: 456, sourceCount: 2 })
    const records = (await readFile(`${outputFile}.address3d.jsonl`, 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(records.filter(row => row.kind === 'source')).toHaveLength(2)
    expect(records.find(row => row.kind === 'collection').sourceRecordIds).toHaveLength(
      2,
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
