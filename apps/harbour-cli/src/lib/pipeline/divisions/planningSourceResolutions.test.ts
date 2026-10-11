import { expect, test } from 'bun:test'
import { planningSourceResolutions } from './planningSourceResolutions'
import type { PreparedDivision } from './processLocalHkgovPlandDivisionSqlUploadTypes'

const record = (id: string, cells: PreparedDivision['cells'] = []): PreparedDivision =>
  ({
    base: { id },
    cells,
    newTown: null,
    sourceCellIds: ['PLAND:111:1'],
  }) as PreparedDivision
const cell = {
  sourceRecordId: 'PLAND:111:1:feature',
  tpuCode: '111',
  subunitCode: '1',
  ppuCode: '1',
  spuCode: '11',
  properties: { ppu: 1, spu: 11, tpu: 111, sbVc: 1 },
  sourceGeometry: { type: 'Polygon', coordinates: [] },
  wasGeometryRepaired: false,
}

test('each retained feature resolves every contributing level, including unchanged parents', async () => {
  const records = [
    record('ppu'),
    record('spu'),
    record('tpu'),
    record('subunit', [cell]),
  ]
  const rows = await planningSourceResolutions('snapshot', 'release', records)
  expect(rows).toHaveLength(1)
  expect(rows[0]).toMatchObject({
    snapshotId: 'snapshot',
    sourceReleaseId: 'release',
    sourceRecordId: cell.sourceRecordId,
    resolutions: { entities: { division: ['ppu', 'spu', 'subunit', 'tpu'] } },
  })
  expect(rows[0]!.sourceVersionHash).toHaveLength(64)
  expect(
    await planningSourceResolutions('snapshot', 'release', records.toReversed()),
  ).toEqual(rows)
})

test('removed divisions are absent and missing cell membership blocks retention', async () => {
  const subunit = record('subunit', [cell])
  expect(
    (await planningSourceResolutions('next', 'release', [subunit]))[0]!.resolutions
      .entities.division,
  ).toEqual(['subunit'])
  subunit.sourceCellIds = []
  await expect(planningSourceResolutions('next', 'release', [subunit])).rejects.toThrow(
    'Missing Planning cell membership',
  )
})

test('new towns retain the exact publisher identity and one canonical Division', async () => {
  const town = {
    ...record('town'),
    sourceCellIds: [],
    newTown: {
      sourceRecordId: 'publisher-town',
      properties: { newTownEn: 'Town' },
      sourceGeometry: null,
    },
  } as PreparedDivision
  expect(
    (await planningSourceResolutions('snapshot', 'release', [town]))[0],
  ).toMatchObject({
    sourceRecordId: 'publisher-town',
    resolutions: { entities: { division: ['town'] } },
  })
})

test('omitted assertions remain explicit replay tombstones', async () => {
  expect(
    await planningSourceResolutions(
      'next',
      'release',
      [],
      [{ sourceRecordId: 'removed', versionHash: 'old' }],
    ),
  ).toEqual([
    {
      snapshotId: 'next',
      sourceReleaseId: 'release',
      sourceRecordId: 'removed',
      sourceVersionHash: 'old',
      resolutions: { entities: {}, decisions: [{ type: 'source_omission' }] },
    },
  ])
})

test('unmatched prepared membership blocks an evidence-free Division', async () => {
  const unmatched = { ...record('parent'), sourceCellIds: ['PLAND:999:1'] }
  await expect(
    planningSourceResolutions('snapshot', 'release', [
      unmatched,
      record('subunit', [cell]),
    ]),
  ).rejects.toThrow('Missing Planning source evidence for parent')
})
