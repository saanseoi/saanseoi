import { expect, test } from 'bun:test'
import { requireDefined } from '@repo/core/requireDefined'
import { alsSourcePayload } from '@repo/core/pipeline/services/sources/alsSourcePayload'
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { loadHouseRetentionFixture } from './hkgovAlsHouseRetentionEvidence.ts'
import yungFixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-yung-shing-shared-building.json'

const houseFixture = loadHouseRetentionFixture()
import { retainAlsHouses, labelAlsHouseRetentions } from './hkgovAlsHouseRetentions'
import { applyYungShingSharedBuilding } from './hkgovAlsYungShingSharedBuilding'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { prepareAls3dCollections } from './hkgovAls3dPreparation'
import { als3dHash, readAls3dFeatures, type Als3dFeature } from './hkgovAls3d'
import type { HkgovAlsSourceFeature, DivisionLookupMaps } from './hkgovAlsTypes'
const rules = houseFixture.retentions.filter(
  r => 'backfillBeforeEvidence' in r && r.backfillBeforeEvidence,
)
const maps: DivisionLookupMaps = {
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
}
const normalise = (s: HkgovAlsSourceFeature, v: string) =>
  normaliseHkgovAlsFeature(
    s.feature,
    s.sourceFile,
    s.featureIndexOneBased,
    'test',
    v,
    maps,
    true,
    new Map(),
    new Map(),
    new Map(),
  )
const wrapped = (f: unknown, i = 1): HkgovAlsSourceFeature => ({
  feature: f as HkgovAlsSourceFeature['feature'],
  sourceFile: 'publisher.geojson',
  featureIndexOneBased: i,
})
const anchor = (): HkgovAlsSourceFeature =>
  wrapped({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [113.97, 22.38] },
    properties: {
      Address: {
        PremisesAddress: {
          BuildingCsuInformation: { CsuId: 'test-anchor' },
          GeoAddress: 'test-anchor',
          EngPremisesAddress: {
            BuildingName: 'TEST ANCHOR',
            EngDistrict: 'TUEN MUN DISTRICT',
            Region: 'NT',
          },
          ChiPremisesAddress: {
            BuildingName: '測試',
            ChiDistrict: '屯門區',
            Region: '新界',
          },
        },
      },
    },
  })
test('early and future Yip Wong identities retain distinct evidence dates; Hin Fat boundary excludes2024', () => {
  for (const version of ['2024-07-25.0', '2025-01-23.0', '2030-01-01.0']) {
    const source = [anchor()]
    // Latest verified Yip Wo remains present in future; the other three stay omitted.
    if (version.startsWith('2030')) {
      const wo = requireDefined(rules.find(r => r.name === 'YIP WO HOUSE'))
      source.push(wrapped(requireDefined(wo.evidence2d.at(-1)).feature))
    }
    const provenance = retainAlsHouses(source, version),
      rows = source.map(s => normalise(s, version))
    labelAlsHouseRetentions(rows, provenance)
    expect(rows.filter(r => r.enEstateName === 'YIP WONG ESTATE')).toHaveLength(4)
    expect(rows.filter(r => r.enEstateName === 'HIN FAT ESTATE')).toHaveLength(
      version.startsWith('2025') ? 1 : 0,
    )
    expect(
      new Set(rows.filter(r => r.enEstateName === 'YIP WONG ESTATE').map(r => r.id))
        .size,
    ).toBe(4)
    const sin = requireDefined(rows.find(r => r.enBuildingName === 'YIP SIN HOUSE'))
    expect(JSON.parse(sin.sources).hkgovAlsHouseRetention.evidenceSourceVersion).toBe(
      version.startsWith('2030') ? '2026-02-04.0' : '2025-06-20.0',
    )
  }
})
test('Yung Shing retains both valid addresses and one inventory owner without inventing sections', () => {
  const version = '2024-07-25.0',
    rows = yungFixture.evidence2d
      .filter(e => e.sourceVersions.includes(version))
      .map((e, i) => normalise(wrapped(e.feature, i + 1), version))
  const originals = rows.map(r => [
    r.id,
    r.enStreetName,
    r.enStreetNumberFrom,
    r.engPremisesAddressJson,
  ])
  const ownership = applyYungShingSharedBuilding(rows, version)
  expect(rows).toHaveLength(2)
  expect(new Set([...ownership.values()].map(x => x.ownerId)).size).toBe(1)
  expect(
    rows.map(r => [
      r.id,
      r.enStreetName,
      r.enStreetNumberFrom,
      r.engPremisesAddressJson,
    ]),
  ).toEqual(originals)
  expect(
    rows.every(r => r.curatedGranularity === 'building' && !r.parentAddressId),
  ).toBe(true)
  rows[0] = {
    ...requireDefined(rows[0]),
    geometry: '{"type":"Point","coordinates":[0,0]}',
  }
  expect(() => applyYungShingSharedBuilding(rows, version)).toThrow(
    'source addresses changed',
  )
})
test('future Yip Wong retains four collections until revoked with unverified provenance', async () => {
  const dir = await mkdtemp('/tmp/yip-wong-future-')
  try {
    const wo = requireDefined(rules.find(r => r.name === 'YIP WO HOUSE'))
    const source = [anchor(), wrapped(requireDefined(wo.evidence2d.at(-1)).feature)]
    const provenance = retainAlsHouses(source, '2030-01-01.0'),
      rows = source.map(s => normalise(s, '2030-01-01.0'))
    labelAlsHouseRetentions(rows, provenance)
    expect(
      JSON.parse(
        requireDefined(rows.find(r => r.enBuildingName === 'YIP SIN HOUSE')).sources,
      ).hkgovAlsHouseRetention.curation.verificationStatus,
    ).toBe('unverified')
    await writeFile(
      join(dir, 'als_addresses_3d_(public_rental_housing).geojson'),
      JSON.stringify(
        {
          type: 'FeatureCollection',
          features: [requireDefined(wo.evidence3d.at(-1)).feature],
        },
        null,
        2,
      ),
    )
    const result = await prepareAls3dCollections({
      sourceDir: dir,
      sourceVersion: '2030-01-01.0',
      outputFile: join(dir, 'prepared.parquet'),
      rows,
    })
    expect(result.collectionCount).toBe(4)
    expect(result.unitCount).toBe(3288)
    const retained = (
      await Bun.file(join(dir, 'prepared.parquet.address3d.jsonl')).text()
    )
      .trim()
      .split('\n')
      .map(line => JSON.parse(line))
    const publisherRows = retained.filter(row => row.kind === 'source')
    expect(publisherRows).toHaveLength(1)
    expect(publisherRows[0].rawProperties).toEqual(
      alsSourcePayload(requireDefined(wo.evidence3d.at(-1)).feature).rawProperties,
    )
    expect(publisherRows[0].sources).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ originalAssertions: expect.anything() }),
      ]),
    )
    const reconstructed = retained.filter(
      row => row.kind === 'collection' && row.sourceRecordIds.length === 0,
    )
    expect(reconstructed).toHaveLength(3)
    expect(
      reconstructed.every(row =>
        row.processingSources.some(
          (source: { dataset: string }) =>
            source.dataset === 'saanseoi-address-house-retention',
        ),
      ),
    ).toBe(true)
    const changed = structuredClone(source)
    requireDefined(
      changed.find(
        s =>
          s.feature.properties?.Address?.PremisesAddress?.EngPremisesAddress
            ?.BuildingName === 'YIP WO HOUSE',
      ),
    ).feature.geometry = { type: 'Point', coordinates: [0, 0] }
    expect(() => retainAlsHouses(changed, '2030-01-01.0')).toThrow(
      'publisher assertions changed',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
test.skipIf(!process.env.ALS_RETAINED_RELEASE_TEST)(
  'materialises all30 releases: shared138 inventory, Hin Fat872 and Yip Wong3288',
  async () => {
    const dir = await mkdtemp('/tmp/hin-yip-yung-'),
      ids = new Map<string, string>()
    try {
      for (const release of (await readdir('data/hkgov/dpo/ALS'))
        .filter(r => /^\d{8}-.*ALS-GeoJSON$/.test(r))
        .sort()) {
        const version = `${release.slice(0, 4)}-${release.slice(4, 6)}-${release.slice(6, 8)}.0`
        const source = [
          anchor(),
          ...yungFixture.evidence2d
            .filter(e => e.sourceVersions.includes(version))
            .map((e, i) => wrapped(e.feature, i + 2)),
        ]
        const three: Als3dFeature[] = []
        for (const rule of rules) {
          if (!rule.sourceVersions.includes(version)) continue
          for (const e of rule.evidence2d.filter(e =>
            e.sourceVersions.includes(version),
          ))
            source.push(wrapped(e.feature, source.length + 1))
          const originals = rule.evidence3d
            .filter(e => e.sourceVersions.includes(version))
            .map(e => e.feature as unknown as Als3dFeature)
          expect(originals.map(als3dHash).sort()).toEqual(
            requireDefined(
              rule.assertions3d.find(e => e.sourceVersions.includes(version)),
            ).hashes,
          )
          three.push(...originals)
        }
        for await (const { feature } of readAls3dFeatures(
          `data/hkgov/dpo/ALS/${release}/als_addresses_3d_(public_rental_housing).geojson`,
        )) {
          if (
            feature.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId ===
            yungFixture.csu
          )
            three.push(feature)
          if (
            three.filter(
              f =>
                f.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId ===
                yungFixture.csu,
            ).length === 2
          )
            break
        }
        const provenance = retainAlsHouses(source, version),
          rows = source.map(s => normalise(s, version))
        labelAlsHouseRetentions(rows, provenance)
        for (const row of rows.filter(
          r => r.sourceFile === 'hkgov-dpo-address-house-retentions.json',
        )) {
          const name = requireDefined(row.enBuildingName)
          if (ids.has(name)) expect(row.id).toBe(requireDefined(ids.get(name)))
          else ids.set(name, row.id)
        }
        await writeFile(
          join(dir, 'als_addresses_3d_(public_rental_housing).geojson'),
          JSON.stringify({ type: 'FeatureCollection', features: three }, null, 2),
        )
        const result = await prepareAls3dCollections({
          sourceDir: dir,
          sourceVersion: version,
          outputFile: join(dir, 'prepared.parquet'),
          rows,
          writeOutput: false,
        })
        expect(result.collectionCount).toBe(version >= '2025-01-01.0' ? 6 : 5)
        expect(result.unitCount).toBe(
          138 + 3288 + (version >= '2025-01-01.0' ? 872 : 0),
        )
        console.error(
          `Verified ${version}: ${result.collectionCount} collections, ${result.unitCount} units`,
        )
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
  600000,
)
