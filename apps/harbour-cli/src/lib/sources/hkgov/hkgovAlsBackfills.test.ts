import { test, expect } from 'bun:test'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-3d-backfills.json'
import {
  buildAls2dBackfillFeatures,
  labelAls2dBackfillRows,
} from './hkgovAls2dBackfills'
import { readAls3dWithBackfills } from './hkgovAls3dBackfills'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import type { HkgovAlsFeature } from './hkgovAlsTypes'

function normalise(
  feature: HkgovAlsFeature,
  sourceFile = 'verification.geojson',
  version = '2025-06-20.0',
) {
  return normaliseHkgovAlsFeature(
    feature,
    sourceFile,
    1,
    '202506',
    version,
    {
      areaByEn: new Map(),
      areaByZh: new Map(),
      ambiguousAreaEn: new Set(),
      ambiguousAreaZh: new Set(),
      countryId: null,
      districtByEn: new Map(),
      districtByZh: new Map(),
      ambiguousDistrictEn: new Set(),
      ambiguousDistrictZh: new Set(),
      snapshotId: 'test',
    },
    true,
    new Map(),
    new Map(),
    new Map(),
  )
}
test('reconstructs only dated named parents and preserves unnamed CSU assertions', () => {
  const first = buildAls2dBackfillFeatures([], '2024-07-25.0')
  expect(first).toHaveLength(4)
  expect(buildAls2dBackfillFeatures([], '2024-07-24.0')).toHaveLength(0)
  expect(buildAls2dBackfillFeatures([], '2025-06-20.0')).toHaveLength(0)
  expect(() => buildAls2dBackfillFeatures(first, '2024-07-25.0')).toThrow(
    'named source already present',
  )
  const blank = structuredClone(first[0]!)
  delete blank.feature.properties!.Address!.PremisesAddress!.EngPremisesAddress!
    .BuildingName
  delete blank.feature.properties!.Address!.PremisesAddress!.ChiPremisesAddress!
    .BuildingName
  const before = JSON.stringify(blank)
  expect(buildAls2dBackfillFeatures([blank], '2024-07-25.0')).toHaveLength(4)
  expect(JSON.stringify(blank)).toBe(before)
  const rows = first.map(s => normalise(s.feature, s.sourceFile, '2024-07-25.0'))
  labelAls2dBackfillRows(rows)
  expect(
    rows.every(
      r =>
        JSON.parse(r.sources).hkgovAlsAddressBackfill &&
        !JSON.parse(r.sources).hkgovAls,
    ),
  ).toBe(true)
})
test('guards full inventory backfills against changed, missing and ambiguous parents or present sources', async () => {
  const path = await mkdtemp(join(tmpdir(), 'als-backfill-test-'))
  const file = join(path, 'input.geojson')
  const rows = fixture.backfills.map(b => {
    const f = structuredClone(b.feature)
    delete (
      f.properties.Address.PremisesAddress.EngPremisesAddress as {
        Eng3dAddress?: unknown
      }
    ).Eng3dAddress
    delete (
      f.properties.Address.PremisesAddress.ChiPremisesAddress as {
        Chi3dAddress?: unknown
      }
    ).Chi3dAddress
    return normalise({
      ...f,
      geometry: {
        ...f.geometry,
        coordinates: [f.geometry.coordinates[0]!, f.geometry.coordinates[1]!],
      },
    })
  })
  const empty = {
    geometry: { type: 'Point', coordinates: [114, 22] },
    properties: {
      Address: {
        PremisesAddress: {
          EngPremisesAddress: { EngEstate: { EstateName: 'CHING TIN ESTATE' } },
        },
      },
    },
  }
  const write = (feature: unknown) =>
    writeFile(
      file,
      JSON.stringify({ type: 'FeatureCollection', features: [feature] }, null, 2),
    )
  const collect = async (input = rows, version = '2025-06-20.0') => {
    const records = []
    for await (const r of readAls3dWithBackfills(file, version, input)) records.push(r)
    return records
  }
  try {
    await write(empty)
    expect(await collect()).toHaveLength(6)
    expect(await collect(rows, '2025-08-13.0')).toHaveLength(1)
    await expect(collect([])).rejects.toThrow('missing parent')
    await expect(collect([...rows, rows[0]!])).rejects.toThrow('ambiguous')
    const changed = structuredClone(rows)
    changed[0]!.engPremisesAddressJson = JSON.stringify({ BuildingName: 'CHANGED' })
    await expect(collect(changed)).rejects.toThrow()
    await write(fixture.backfills[0]!.feature)
    await expect(collect()).rejects.toThrow('no longer absent')
  } finally {
    await rm(path, { recursive: true, force: true })
  }
})
