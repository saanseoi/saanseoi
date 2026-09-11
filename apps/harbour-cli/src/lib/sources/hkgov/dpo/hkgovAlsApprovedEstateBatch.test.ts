import { alsSourcePayload } from '@repo/core/pipeline/services/sources/alsSourcePayload'
import { requireDefined } from '@repo/core/requireDefined'
import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import {
  buildAls2dBackfillFeatures,
  labelAls2dBackfillRows,
} from './hkgovAls2dBackfills'
import { prepareAls3dCollections } from './hkgovAls3dPreparation'
import {
  suppressApprovedEstateDuplicates,
  resolveApprovedEstateCsu,
  assertApprovedEmptyInventory,
} from './hkgovAlsApprovedEstateBatch'
import { backfillAlsCoordinates } from './hkgovAlsCoordinateBackfills'
import type { HkgovAlsFeature, DivisionLookupMaps } from './hkgovAlsTypes'

const root = 'data/hkgov/dpo/ALS'
const estates = [
  'LOWER NGAU TAU KOK ESTATE',
  'LUNG HANG ESTATE',
  'MA HANG ESTATE',
  'MODEL HOUSING ESTATE',
  'ON TAI ESTATE',
  'ON TAT ESTATE',
]
const selected = (f: HkgovAlsFeature) =>
  estates.includes(
    f.properties?.Address?.PremisesAddress?.EngPremisesAddress?.EngEstate?.EstateName ??
      '',
  )
const maps: DivisionLookupMaps = {
  areaByEn: new Map(),
  areaByZh: new Map(),
  districtByEn: new Map(),
  districtByZh: new Map(),
  ambiguousAreaEn: new Set(),
  ambiguousAreaZh: new Set(),
  ambiguousDistrictEn: new Set(),
  ambiguousDistrictZh: new Set(),
  countryId: null,
  snapshotId: 'test',
}

test.skipIf(!existsSync(root))(
  'approved estate batch preserves source evidence, stable CSU ownership, coordinates and parent inventories',
  async () => {
    const releases =
      process.env.ALS_VERIFY_ALL === '1'
        ? (await readdir(root)).filter(r => /^\d{8}-.*ALS-GeoJSON$/.test(r)).sort()
        : [
            '20240725-1048-ALS-GeoJSON',
            '20250225-1050-ALS-GeoJSON',
            '20260425-1038-ALS-GeoJSON',
            '20260819-1047-ALS-GeoJSON',
          ]
    const dir = await mkdtemp(join(tmpdir(), 'als-estate-batch-'))
    const ids = new Map<string, string>()
    try {
      for (const release of releases) {
        const version = `${release.slice(0, 4)}-${release.slice(4, 6)}-${release.slice(6, 8)}.0`
        const input: HkgovAlsFeature[] = []
        for (const district of [
          'kwun_tong_district',
          'sha_tin_district',
          'southern_district',
          'eastern_district',
        ])
          input.push(
            ...(
              await Bun.file(
                `${root}/${release}/als_addresses_(${district}).geojson`,
              ).json()
            ).features.filter(selected),
          )
        const rawOriginal = JSON.stringify(input)
        const source = input.map((feature, i) => ({
          feature,
          sourceFile: 'raw.geojson',
          featureIndexOneBased: i + 1,
        }))
        source.push(
          ...buildAls2dBackfillFeatures(source, version).filter(s =>
            selected(s.feature),
          ),
        )
        const rows = source.map(s =>
          normaliseHkgovAlsFeature(
            s.feature,
            s.sourceFile,
            s.featureIndexOneBased,
            'test',
            version,
            maps,
            true,
            new Map(),
            new Map(),
            new Map(),
          ),
        )
        labelAls2dBackfillRows(rows)
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
        await prepareAls3dCollections({
          sourceDir: dir,
          sourceVersion: version,
          outputFile,
          rows,
        })
        suppressApprovedEstateDuplicates(rows, version)
        backfillAlsCoordinates(rows, version, true)
        const records = (await readFile(`${outputFile}.address3d.jsonl`, 'utf8'))
          .trim()
          .split('\n')
          .map(line => JSON.parse(line))
        expect(records.filter(r => r.kind === 'source').map(r => r.properties)).toEqual(
          raw3d.map(
            (feature: Parameters<typeof alsSourcePayload>[0]) =>
              alsSourcePayload(feature).properties,
          ),
        )
        expect(JSON.stringify(input)).toBe(rawOriginal)
        const collections = records.filter(r => r.kind === 'collection')
        for (const [name, csu] of [
          ['LOWER NGAU TAU KOK ESTATE PLAZA', '4027420245P20120920'],
          ['POK OI HOSPITAL CHAN KAI MEMORIAL COLLEGE', '3639525221T20050430'],
          ['KOON MA HSE', '3934509146T20050430'],
        ] as const) {
          const owners = rows.filter(r => r.enBuildingName === name)
          expect(owners).toHaveLength(1)
          expect(requireDefined(owners[0]).hkgovCsuId).toBe(csu)
          if (!ids.has(name)) ids.set(name, requireDefined(owners[0]).id)
          expect(requireDefined(owners[0]).id).toBe(requireDefined(ids.get(name)))
        }
        const koon = requireDefined(rows.find(r => r.enBuildingName === 'KOON MA HSE'))
        expect(
          collections.filter(c => c.address2dId === koon.id).map(c => c.unitCount),
        ).toEqual([132])
        const hin = rows.filter(r => r.enBuildingName === 'KWAI HIN HOUSE')
        expect(hin).toHaveLength(1)
        expect(
          JSON.parse(requireDefined(requireDefined(hin[0]).geometry)).coordinates,
        ).toEqual([114.21565, 22.32173])
        expect(
          collections.filter(c => c.address2dId === requireDefined(hin[0]).id),
        ).toHaveLength(0)
        for (const [name, point] of [
          ['LOK SAM HSE', [114.177, 22.36708]],
          ['ON TAI SHOPPING CENTRE', [114.22913, 22.327]],
        ] as const)
          expect(
            JSON.parse(
              requireDefined(
                requireDefined(rows.find(r => r.enBuildingName === name)).geometry,
              ),
            ).coordinates,
          ).toEqual(point)
        for (const [prefix, count, sections] of [
          ['MAN HONG HSE', 422, 6],
          ['MAN KING HSE', 25, 3],
        ] as const) {
          const house = rows.filter(
            r =>
              r.enBuildingName?.startsWith(prefix) &&
              r.curatedGranularity === 'building',
          )
          expect(house).toHaveLength(1)
          expect(
            collections
              .filter(c => c.address2dId === requireDefined(house[0]).id)
              .map(c => c.unitCount),
          ).toEqual([count])
          const children = rows.filter(
            r => r.parentAddressId === requireDefined(house[0]).id,
          )
          expect(children).toHaveLength(sections)
          expect(children.every(c => c.curatedGranularity === 'section')).toBe(true)
          expect(
            collections.some(c => children.some(s => s.id === c.address2dId)),
          ).toBe(false)
        }
        for (const csu of ['4176420671T20160506', '4224520257T20150630'])
          expect(
            rows.filter(r => r.hkgovCsuId === csu && !r.enBuildingName),
          ).toHaveLength(0)
        const school = rows.filter(r => r.hkgovCsuId === '3639525221T20050430')
        expect(school).toHaveLength(1)
        const mutated = structuredClone(
          requireDefined(
            input.find(
              f =>
                f.properties?.Address?.PremisesAddress?.EngPremisesAddress
                  ?.BuildingName === 'KOON MA HSE',
            ),
          ),
        )
        requireDefined(mutated.geometry).coordinates = [0, 0]
        expect(() => resolveApprovedEstateCsu(mutated, version)).toThrow(
          'source evidence changed',
        )
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
  90_000,
)

test('Kwai Hin remains retained beyond verified history without invented flats; empty aliases reject inventory', () => {
  const result = buildAls2dBackfillFeatures([], '2030-01-01.0').filter(
    s =>
      s.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
      '4026420303T20120921',
  )
  expect(result).toHaveLength(1)
  const p = requireDefined(
    requireDefined(requireDefined(requireDefined(result[0]).feature.properties).Address)
      .PremisesAddress,
  )
  expect('Eng3dAddress' in requireDefined(p.EngPremisesAddress)).toBe(false)
  expect(() =>
    assertApprovedEmptyInventory(
      {
        geometry: { type: 'Point', coordinates: [114.23022, 22.32505] },
        properties: {
          Address: {
            PremisesAddress: {
              BuildingCsuInformation: { CsuId: '4176420671T20160506' },
              EngPremisesAddress: {
                EngEstate: { EstateName: 'ON TAI ESTATE' },
                Eng3dAddress: [{ EngUnit: { UnitNo: '1' } }],
              },
            },
          },
        },
      },
      '2024-07-25.0',
    ),
  ).toThrow('no longer empty')
})
