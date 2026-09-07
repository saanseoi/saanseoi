import { expect, test } from 'bun:test'
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-house-retentions.json'
import { retainAlsHouses, labelAlsHouseRetentions } from './hkgovAlsHouseRetentions'
import { readAls3dFeatures } from './hkgovAls3d'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { prepareAls3dCollections } from './hkgovAls3dPreparation'
import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'

const version = (r: string) => `${r.slice(0, 4)}-${r.slice(4, 6)}-${r.slice(6, 8)}.0`
const rules = fixture.retentions
const csus = new Set(rules.flatMap(r => r.csus))
const scopedCsus = new Set([...csus, '3234825793T20050430', '3238925757T20050430'])
const normalise = (s: HkgovAlsSourceFeature, v: string) =>
  normaliseHkgovAlsFeature(
    s.feature,
    s.sourceFile,
    s.featureIndexOneBased,
    'test',
    v,
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

test('guards complete publisher evidence and preserves unrelated source data', () => {
  const r = rules.find(r => r.id === 'shek-yam-lai-shek-house')!
  const f = structuredClone(
    r.evidence2d[0]!.feature,
  ) as unknown as HkgovAlsSourceFeature['feature']
  const source = [{ feature: f, sourceFile: 'test.geojson', featureIndexOneBased: 1 }]
  expect(() => retainAlsHouses(source, '2024-07-25.0')).toThrow(
    'publisher assertions changed',
  )
  expect(retainAlsHouses([], '2030-01-01.0').size).toBe(0)
})

const root = 'data/hkgov/dpo/ALS'
test.skipIf(!process.env.ALS_RETAINED_RELEASE_TEST)(
  'materialises nine houses from every retained release with stable identities and complete inventories',
  async () => {
    const releases = (await readdir(root))
      .filter(r => /^\d{8}-.*ALS-GeoJSON$/.test(r))
      .sort()
    const dir = await mkdtemp(join(tmpdir(), 'als-house-retentions-'))
    const ids = new Map<string, string>()
    try {
      for (const release of releases) {
        const v = version(release)
        const source: HkgovAlsSourceFeature[] = []
        for (const district of ['north', 'kwai_tsing']) {
          const sourceFile = `als_addresses_(${district}_district).geojson`
          const payload = JSON.parse(
            await Bun.file(`${root}/${release}/${sourceFile}`).text(),
          )
          for (const [i, feature] of payload.features.entries())
            if (
              scopedCsus.has(
                feature.properties.Address.PremisesAddress.BuildingCsuInformation
                  ?.CsuId,
              )
            )
              source.push({ feature, sourceFile, featureIndexOneBased: i + 1 })
        }
        const provenance = retainAlsHouses(source, v)
        const rows = source.map(s => normalise(s, v))
        labelAlsHouseRetentions(rows, provenance)
        expect(rows.filter(r => csus.has(r.hkgovCsuId!))).toHaveLength(9)
        for (const r of rows) {
          if (ids.has(r.hkgovCsuId!)) expect(r.id).toBe(ids.get(r.hkgovCsuId!))
          else ids.set(r.hkgovCsuId!, r.id!)
        }
        const three = []
        for await (const { feature } of readAls3dFeatures(
          `${root}/${release}/als_addresses_3d_(public_rental_housing).geojson`,
        ))
          if (
            scopedCsus.has(
              feature.properties.Address.PremisesAddress.BuildingCsuInformation
                ?.CsuId ?? '',
            )
          )
            three.push(feature)
        await writeFile(
          join(dir, 'als_addresses_3d_test.geojson'),
          JSON.stringify({ type: 'FeatureCollection', features: three }, null, 2),
        )
        const outputFile = join(dir, 'prepared')
        await prepareAls3dCollections({
          sourceDir: dir,
          sourceVersion: v,
          outputFile,
          rows,
        })
        const records = (await Bun.file(`${outputFile}.address3d.jsonl`).text())
          .trim()
          .split('\n')
          .map(line => JSON.parse(line))
        const targetIds = new Set(
          rows.filter(r => csus.has(r.hkgovCsuId!)).map(r => r.id),
        )
        const collections = records.filter(
          r => r.kind === 'collection' && targetIds.has(r.address2dId),
        )
        expect(collections).toHaveLength(9)
        expect(collections.reduce((n, r) => n + r.unitCount, 0)).toBe(10018)
        for (const row of rows.filter(r => targetIds.has(r.id))) {
          const collection = collections.find(c => c.address2dId === row.id)
          expect(collection).toBeDefined()
          expect(collection.sourceRecordIds.length).toBeGreaterThan(0)
          if (row.hkgovCsuId === '3247025674T20050805')
            expect(collection.unitCount).toBe(340)
          if (row.hkgovCsuId === '3244025863T20050430')
            expect(collection.unitCount).toBe(813)
        }
        console.log(
          v,
          JSON.stringify(
            collections.map(r => ({ id: r.address2dId, units: r.unitCount })),
          ),
        )
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
  600000,
)
