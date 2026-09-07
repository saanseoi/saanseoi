import { expect, test } from 'bun:test'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveAlsCsuCorrection } from './hkgovAlsCsuCorrections'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { readAls3dFeatures } from './hkgovAls3d'
import { prepareAls3dCollections } from './hkgovAls3dPreparation'
import type { HkgovAlsFeature, DivisionLookupMaps } from './hkgovAlsTypes'

const maps: DivisionLookupMaps = {
  areaByEn: new Map(),
  areaByZh: new Map(),
  ambiguousAreaEn: new Set(),
  ambiguousAreaZh: new Set(),
  districtByEn: new Map(),
  districtByZh: new Map(),
  ambiguousDistrictEn: new Set(),
  ambiguousDistrictZh: new Set(),
  countryId: null,
  snapshotId: 'test',
}
test('Luen Yan CSU backfill keeps one identity and collection while preserving publisher evidence', async () => {
  const dir = 'data/hkgov/dpo/ALS/20240725-1048-ALS-GeoJSON'
  const data = JSON.parse(
    await readFile(`${dir}/als_addresses_(kwai_tsing_district).geojson`, 'utf8'),
  )
  const raw = data.features.find(
    (f: HkgovAlsFeature) =>
      f.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
      '3098724838T20110523',
  ) as HkgovAlsFeature
  const corrected = structuredClone(raw)
  corrected.properties!.Address!.PremisesAddress!.BuildingCsuInformation!.CsuId =
    '3095624822T20110523'
  const oldRow = normaliseHkgovAlsFeature(
    raw,
    '2d.geojson',
    1,
    'test',
    '2024-07-25.0',
    maps,
    true,
    new Map(),
    new Map(),
    new Map(),
  )
  const newRow = normaliseHkgovAlsFeature(
    corrected,
    '2d.geojson',
    1,
    'test',
    '2025-02-25.0',
    maps,
    true,
    new Map(),
    new Map(),
    new Map(),
  )
  expect(oldRow.id).toBe(newRow.id)
  expect(oldRow.hkgovCsuId).toBe('3095624822T20110523')
  expect(JSON.parse(oldRow.sources).hkgovAls.hkgovCsuId).toBe('3098724838T20110523')
  expect(resolveAlsCsuCorrection(raw, '2025-02-25.0').decision).toBeNull()
  const drift = structuredClone(raw)
  drift.geometry!.coordinates = [114, 22]
  expect(() => resolveAlsCsuCorrection(drift, '2024-07-25.0')).toThrow()
  const feature = await (async () => {
    for await (const { feature } of readAls3dFeatures(
      `${dir}/als_addresses_3d_(public_rental_housing).geojson`,
    )) {
      if (
        feature.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId ===
        '3098724838T20110523'
      )
        return feature
    }
    throw new Error('Missing Luen Yan source')
  })()
  const temporary = await mkdtemp(join(tmpdir(), 'luen-yan-csu-'))
  try {
    await writeFile(
      join(temporary, 'als_addresses_3d_(public_rental_housing).geojson'),
      JSON.stringify({ type: 'FeatureCollection', features: [feature] }, null, 2),
    )
    const result = await prepareAls3dCollections({
      sourceDir: temporary,
      outputFile: join(temporary, 'out'),
      sourceVersion: '2024-07-25.0',
      rows: [oldRow],
    })
    expect(result.collectionCount).toBe(1)
    expect(result.unitCount).toBe(769)
    const records = (await readFile(join(temporary, 'out.address3d.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    expect(records.find(r => r.kind === 'source').rawProperties).toEqual(feature)
    expect(records.find(r => r.kind === 'collection').address2dId).toBe(oldRow.id)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
