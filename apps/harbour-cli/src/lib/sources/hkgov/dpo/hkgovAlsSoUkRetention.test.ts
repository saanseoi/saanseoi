import { requireDefined } from '@repo/core/requireDefined'
import { expect, test } from 'bun:test'
import { mkdtemp, writeFile, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { retainAlsHouses, labelAlsHouseRetentions } from './hkgovAlsHouseRetentions'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { readAls3dFeatures } from './hkgovAls3d'
import { prepareAls3dCollections } from './hkgovAls3dPreparation'
import { backfillAlsCoordinates } from './hkgovAlsCoordinateBackfills'
import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'
const root = 'data/hkgov/dpo/ALS'
const version = (r: string) => `${r.slice(0, 4)}-${r.slice(4, 6)}-${r.slice(6, 8)}.0`
const estates = ['SO UK ESTATE', 'SUN CHUI ESTATE']
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
test.skipIf(!process.env.ALS_RETAINED_RELEASE_TEST)(
  'Camellia keeps 374 flats under one stable owner and Sun Fong uses its current point across all retained releases',
  async () => {
    const releases = (await readdir(root))
      .filter(r => /^\d{8}-.*ALS-GeoJSON$/.test(r))
      .sort()
    const dir = await mkdtemp(join(tmpdir(), 'als-so-uk-retention-'))
    let stableId: string | undefined
    try {
      for (const [index, release] of [
        ...releases,
        requireDefined(releases.at(-1)),
      ].entries()) {
        const v = index === releases.length ? '2030-01-01.0' : version(release)
        const source: HkgovAlsSourceFeature[] = []
        for (const district of ['sham_shui_po', 'sha_tin']) {
          const sourceFile = `als_addresses_(${district}_district).geojson`
          const fs = (await Bun.file(`${root}/${release}/${sourceFile}`).json())
            .features
          for (const [i, feature] of fs.entries())
            if (
              estates.includes(
                feature.properties.Address.PremisesAddress.EngPremisesAddress?.EngEstate
                  ?.EstateName,
              )
            )
              source.push({ feature, sourceFile, featureIndexOneBased: i + 1 })
        }
        const unchanged = structuredClone(
          source.filter(
            s =>
              s.feature.properties?.Address?.PremisesAddress?.EngPremisesAddress
                ?.BuildingName === 'SUN YEE HSE',
          ),
        )
        if (v === '2030-01-01.0') {
          const changed = structuredClone(source)
          requireDefined(
            requireDefined(
              changed.find(
                s =>
                  s.feature.properties?.Address?.PremisesAddress?.EngPremisesAddress
                    ?.BuildingName === 'CAMELLIA HOUSE',
              ),
            ).feature.geometry,
          ).coordinates = [0, 0]
          expect(() => retainAlsHouses(changed, v)).toThrow(
            'publisher assertions changed',
          )
        }
        const provenance = retainAlsHouses(source, v)
        expect(
          source.filter(
            s =>
              s.feature.properties?.Address?.PremisesAddress?.EngPremisesAddress
                ?.BuildingName === 'SUN YEE HSE',
          ),
        ).toEqual(unchanged)
        const rows = source.map(s => normalise(s, v))
        labelAlsHouseRetentions(rows, provenance)
        backfillAlsCoordinates(rows, v, true)
        const camellias = rows.filter(
          r =>
            r.hkgovCsuId === '3434922429T20150302' ||
            r.hkgovCsuId === '3430722387T20150302',
        )
        expect(camellias).toHaveLength(1)
        const owner = requireDefined(camellias[0])
        if (stableId) expect(owner.id).toBe(stableId)
        else stableId = owner.id
        expect(
          JSON.parse(
            requireDefined(
              requireDefined(rows.find(r => r.hkgovCsuId === '3678525828T20050430'))
                .geometry,
            ),
          ).coordinates,
        ).toEqual([114.18189, 22.37163])
        const features = []
        for await (const { feature } of readAls3dFeatures(
          `${root}/${release}/als_addresses_3d_(public_rental_housing).geojson`,
        ))
          if (
            estates.includes(
              feature.properties.Address.PremisesAddress.EngPremisesAddress?.EngEstate
                ?.EstateName ?? '',
            )
          )
            features.push(feature)
        await writeFile(
          join(dir, 'als_addresses_3d_test.geojson'),
          JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
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
          .map(l => JSON.parse(l))
        const collections = records.filter(
          r => r.kind === 'collection' && r.address2dId === owner.id,
        )
        expect(collections).toHaveLength(1)
        expect(collections[0].unitCount).toBe(374)
        expect(collections[0].units).toHaveLength(374)
        const curation = JSON.parse(owner.sources).hkgovAlsHouseRetention.curation
        expect(curation.verificationStatus).toBe(
          v === '2030-01-01.0' ? 'unverified' : 'verified',
        )
        console.log(
          v,
          'Camellia: 1 owner, 374 flats; Sun Fong: current point; Sun Yee unchanged',
        )
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
  600000,
)
