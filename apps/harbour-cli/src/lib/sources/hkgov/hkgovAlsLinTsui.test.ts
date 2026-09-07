import { expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { resolveLinTsui, suppressLinTsuiVariants } from './hkgovAlsLinTsui'
import { prepareAls3dCollections } from './hkgovAls3dPreparation'
import type { DivisionLookupMaps, HkgovAlsFeature } from './hkgovAlsTypes'

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
test('Lin Tsui materialises one enduring 288-unit owner and retains both raw assertions', async () => {
  let identity: string | undefined
  for (const [release, version] of [
    ['20240725-1048-ALS-GeoJSON', '2024-07-25.0'],
    ['20260403-1056-ALS-GeoJSON', '2026-04-03.0'],
    ['20260819-1047-ALS-GeoJSON', '2026-08-19.0'],
  ]) {
    const base = `data/hkgov/dpo/ALS/${release}`
    const data = await Bun.file(
      `${base}/als_addresses_(eastern_district).geojson`,
    ).json()
    const features = (data.features as HkgovAlsFeature[]).filter(f =>
      ['4238313558T20180523', '4238313561P20180516'].includes(
        f.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ?? '',
      ),
    )
    const original = JSON.stringify(features)
    const rows = features.map((f, i) =>
      normaliseHkgovAlsFeature(
        f,
        '2d.geojson',
        i + 1,
        'test',
        version!,
        maps,
        true,
        new Map(),
        new Map(),
        new Map(),
      ),
    )
    expect(suppressLinTsuiVariants(rows)).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.hkgovCsuId).toBe('4238313558T20180523')
    expect(JSON.parse(rows[0]!.geometry!).coordinates).toEqual([114.2362, 22.26082])
    expect(JSON.parse(rows[0]!.sources).hkgovAlsLinTsuiSuppressed).toHaveLength(1)
    identity ??= rows[0]!.id
    expect(rows[0]!.id).toBe(identity)
    expect(JSON.stringify(features)).toBe(original)
    const raw3d = await Bun.file(
      `${base}/als_addresses_3d_(public_rental_housing).geojson`,
    ).json()
    const inventory = raw3d.features.filter((f: HkgovAlsFeature) =>
      ['4238313558T20180523', '4238313561P20180516'].includes(
        f.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ?? '',
      ),
    )
    const temporary = await mkdtemp(join(tmpdir(), 'lin-tsui-test-'))
    try {
      await writeFile(
        join(temporary, 'als_addresses_3d_(public_rental_housing).geojson'),
        JSON.stringify({ type: 'FeatureCollection', features: inventory }, null, 2),
      )
      const result = await prepareAls3dCollections({
        sourceDir: temporary,
        outputFile: join(temporary, 'out'),
        sourceVersion: version!,
        rows,
      })
      expect(result.collectionCount).toBe(1)
      expect(result.unitCount).toBe(288)
      const records = (await readFile(join(temporary, 'out.address3d.jsonl'), 'utf8'))
        .trim()
        .split('\n')
        .map(line => JSON.parse(line))
      expect(
        records.filter(r => r.kind === 'source').map(r => r.rawProperties),
      ).toEqual(inventory)
    } finally {
      await rm(temporary, { recursive: true, force: true })
    }
    const drift = structuredClone(features[0]!)
    drift.geometry!.coordinates = [114, 22]
    expect(() => resolveLinTsui(drift, version!)).toThrow()
  }
})
