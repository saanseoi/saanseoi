import { alsSourcePayload } from '@repo/core/pipeline/services/sources/alsSourcePayload'
import { requireDefined } from '@repo/core/requireDefined'
import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { suppressKoYeeDuplicate } from './hkgovAlsKoYeeDuplicate'
import {
  suppressHungHomPhase2Aliases,
  applyKoYeeEstateOwnership,
} from './hkgovAlsReviewedEstateOwnership'
import { prepareAls3dCollections } from './hkgovAls3dPreparation'
import type { HkgovAlsFeature, DivisionLookupMaps } from './hkgovAlsTypes'

const root = 'data/hkgov/dpo/ALS'
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
const selected = (feature: HkgovAlsFeature) =>
  ['HUNG HOM ESTATE', 'HUNG HOM ESTATE PHASE 2', 'KO YEE ESTATE'].includes(
    feature.properties?.Address?.PremisesAddress?.EngPremisesAddress?.EngEstate
      ?.EstateName ?? '',
  )

test.skipIf(!existsSync(root))(
  'reviewed Hung Hom houses and Ko Yee estate retain distinct ownership and all raw inventory evidence',
  async () => {
    const releases =
      process.env.ALS_VERIFY_ALL === '1'
        ? (await readdir(root)).filter(r => /^\d{8}-.*ALS-GeoJSON$/.test(r)).sort()
        : [
            '20240725-1048-ALS-GeoJSON',
            '20260403-1056-ALS-GeoJSON',
            '20260819-1047-ALS-GeoJSON',
          ]
    const dir = await mkdtemp(join(tmpdir(), 'als-reviewed-ownership-'))
    try {
      for (const release of releases) {
        const version = `${release.slice(0, 4)}-${release.slice(4, 6)}-${release.slice(6, 8)}.0`
        const raw2d: HkgovAlsFeature[] = []
        for (const district of ['kowloon_city_district', 'kwun_tong_district']) {
          const data = await Bun.file(
            `${root}/${release}/als_addresses_(${district}).geojson`,
          ).json()
          raw2d.push(...data.features.filter(selected))
        }
        const original = JSON.stringify(raw2d)
        const rows = raw2d.map((f, i) =>
          normaliseHkgovAlsFeature(
            f,
            'raw.geojson',
            i + 1,
            'test',
            version,
            maps,
            true,
            new Map(),
            new Map(),
            new Map(),
          ),
        )
        const changed = structuredClone(rows)
        requireDefined(
          changed.find(row => row.enEstateName === 'HUNG HOM ESTATE PHASE 2'),
        ).enStreetNumberFrom = '99'
        expect(() => suppressHungHomPhase2Aliases(changed, version)).toThrow()
        const wrongEstate = structuredClone(rows)
        requireDefined(
          wrongEstate.find(row => row.geoAddress === '4290617573T20050430'),
        ).geoAddress = 'wrong'
        expect(() => applyKoYeeEstateOwnership(wrongEstate, version)).toThrow()
        const raw3d = (
          await Bun.file(
            `${root}/${release}/als_addresses_3d_(public_rental_housing).geojson`,
          ).json()
        ).features.filter(selected)
        await writeFile(
          join(dir, 'als_addresses_3d_test.geojson'),
          JSON.stringify({ type: 'FeatureCollection', features: raw3d }, null, 2),
        )
        const outputFile = join(dir, 'output')
        const result = await prepareAls3dCollections({
          sourceDir: dir,
          outputFile,
          sourceVersion: version,
          rows,
        })
        expect(suppressHungHomPhase2Aliases(rows, version)).toBe(
          version < '2026-04-03.0' ? 2 : 1,
        )
        suppressKoYeeDuplicate(rows, version)
        expect(result.collectionCount).toBe(9)
        const records = (await readFile(`${outputFile}.address3d.jsonl`, 'utf8'))
          .trim()
          .split('\n')
          .map(line => JSON.parse(line))
        expect(
          records.filter(r => r.kind === 'source').map(r => r.rawProperties),
        ).toEqual(
          raw3d.map(
            (feature: Parameters<typeof alsSourcePayload>[0]) =>
              alsSourcePayload(feature).rawProperties,
          ),
        )
        expect(JSON.stringify(raw2d)).toBe(original)
        const collections = records.filter(r => r.kind === 'collection')
        for (const [name, count] of [
          ['HUNG YAT HOUSE', 456],
          ['HUNG YAN HOUSE', 702],
          ['HUNG YIU HOUSE', 780],
        ] as const) {
          const houses = rows.filter(
            r =>
              r.enBuildingName === name ||
              r.enBuildingName?.startsWith(`${name} (BLK `),
          )
          expect(houses).toHaveLength(1)
          expect(requireDefined(houses[0]).enStreetNumberFrom).toBe('28')
          expect(requireDefined(houses[0]).enStreetName).toBe('TAI WAN ROAD')
          const inventory = collections.filter(
            r => r.address2dId === requireDefined(houses[0]).id,
          )
          expect(inventory).toHaveLength(1)
          expect(inventory[0].unitCount).toBe(count)
        }
        expect(
          rows.filter(r => r.enEstateName === 'HUNG HOM ESTATE PHASE 2'),
        ).toHaveLength(0)
        const yat = requireDefined(
          rows.find(r => r.enBuildingName?.startsWith('HUNG YAT HOUSE')),
        )
        expect(JSON.parse(yat.sources).hkgovAlsHungHomPhase2.aliasCsu).toBe(
          '3752018776T20110715',
        )
        const koYee = rows.filter(r => r.enEstateName === 'KO YEE ESTATE')
        expect(koYee).toHaveLength(5)
        const estate = requireDefined(
          koYee.find(r => r.geoAddress === '4290617573T20050430'),
        )
        expect(estate.curatedGranularity).toBe('complex')
        expect(estate.enStreetNumberFrom).toBe('28')
        expect(collections.filter(r => r.address2dId === estate.id)).toHaveLength(0)
        for (const house of koYee.filter(r => r !== estate)) {
          expect(house.parentAddressId).toBe(estate.id)
          expect(house.curatedGranularity).toBe('building')
        }
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
  60_000,
)
