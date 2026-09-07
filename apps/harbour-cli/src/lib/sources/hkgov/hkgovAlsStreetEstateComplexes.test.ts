import { requireDefined } from '@repo/core/requireDefined'
import { expect, test } from 'bun:test'
import { readdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-street-estate-complexes.json'
import {
  applyReviewedStreetEstateComplexes,
  assertStreetEstateAliasInventoryEmpty,
} from './hkgovAlsStreetEstateComplexes'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { readAls3dFeatures, type Als3dFeature } from './hkgovAls3d'
import { prepareAls3dCollections } from './hkgovAls3dPreparation'
import type { HkgovAlsFeature } from './hkgovAlsTypes'
const normalise = (f: HkgovAlsFeature, v: string, i = 1) =>
  normaliseHkgovAlsFeature(
    f,
    'publisher.geojson',
    i,
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
const latest = () =>
  fixture.rules.map(
    r =>
      structuredClone(
        requireDefined(r.evidence.at(-1)).feature,
      ) as unknown as HkgovAlsFeature,
  )
test('estate IDs and marker are independent of publisher house identifiers', () => {
  const rows = latest().map(f => normalise(f, '2026-08-19.0'))
  expect(applyReviewedStreetEstateComplexes(rows, '2026-08-19.0').complexCount).toBe(2)
  for (const row of rows) {
    expect(row.id).toMatch(/^ss-/)
    expect(row.geoAddress).toBeNull()
    expect(row.hkgovCsuId).toBeNull()
    expect(row.easting).toBeNull()
    expect(row.northing).toBeNull()
    expect(row.identifiers).toBeNull()
    expect(row.curatedGranularity).toBe('complex')
    expect(
      JSON.parse(row.sources).hkgovAlsStreetEstateComplex.originalAliases,
    ).toHaveLength(1)
  }
  const tai = requireDefined(rows.find(r => r.enEstateName === 'TAI YUEN ESTATE'))
  expect(JSON.parse(requireDefined(tai.geometry)).coordinates).toEqual([
    114.1667207, 22.4555134,
  ])
  expect(tai.enStreetName).toBe('TING KOK ROAD')
  expect(tai.enStreetNumberFrom).toBe('10')
  const tin = requireDefined(rows.find(r => r.enEstateName === 'TIN WAN ESTATE'))
  expect(tin.enStreetName).toBe('TIN WAN STREET')
  expect(tin.enStreetNumberFrom).toBe('26')
})
test('future Tin Wan retention accepts reviewed omission and rejects changed aliases or inventory', () => {
  const f = requireDefined(latest()[1]),
    rows = [normalise(f, '2030-01-01.0')]
  applyReviewedStreetEstateComplexes(rows, '2030-01-01.0')
  expect(
    JSON.parse(requireDefined(rows[0]).sources).hkgovAlsStreetEstateComplex.curation
      .verificationStatus,
  ).toBe('unverified')
  const changed = normalise(f, '2030-01-01.0')
  changed.geometry = JSON.stringify({ type: 'Point', coordinates: [0, 0] })
  expect(() => applyReviewedStreetEstateComplexes([changed], '2030-01-01.0')).toThrow(
    'publisher alias changed',
  )
  const named = normalise(f, '2030-01-01.0')
  named.enBuildingName = 'TEST HOUSE'
  named.engPremisesAddressJson = JSON.stringify({
    ...JSON.parse(requireDefined(named.engPremisesAddressJson)),
    BuildingName: 'TEST HOUSE',
  })
  const noAlias = [named]
  applyReviewedStreetEstateComplexes(noAlias, '2030-01-01.0')
  expect(noAlias).toHaveLength(2)
  expect(noAlias[0]).toBe(named)
  expect(requireDefined(noAlias[1]).geoAddress).toBeNull()
  const three = f as Als3dFeature
  requireDefined(
    three.properties.Address.PremisesAddress.EngPremisesAddress,
  ).Eng3dAddress = [{}]
  expect(() => assertStreetEstateAliasInventoryEmpty(three, '2030-01-01.0')).toThrow(
    'inventory requires review',
  )
})
test.skipIf(!process.env.ALS_RETAINED_RELEASE_TEST)(
  'all30 releases keep named house inventories independent of the two street-bearing estates',
  async () => {
    const root = 'data/hkgov/dpo/ALS',
      releases = (await readdir(root))
        .filter(r => /^\d{8}-.*ALS-GeoJSON$/.test(r))
        .sort(),
      dir = await mkdtemp(join(tmpdir(), 'als-street-estates-')),
      ids = new Map<string, string>()
    try {
      for (const release of releases) {
        const v = `${release.slice(0, 4)}-${release.slice(4, 6)}-${release.slice(6, 8)}.0`,
          rows = []
        for (const rule of fixture.rules) {
          const fs = (
            await Bun.file(
              `${root}/${release}/als_addresses_(${rule.district}_district).geojson`,
            ).json()
          ).features
          for (const [i, f] of fs.entries())
            if (
              f.properties.Address.PremisesAddress.EngPremisesAddress?.EngEstate
                ?.EstateName === rule.estate
            )
              rows.push(normalise(f, v, i + 1))
        }
        const named = rows.filter(r => r.enBuildingName),
          before = structuredClone(named)
        expect(applyReviewedStreetEstateComplexes(rows, v).complexCount).toBe(2)
        expect(named).toEqual(before)
        const complexes = rows.filter(r => r.curatedGranularity === 'complex')
        expect(complexes).toHaveLength(2)
        for (const r of complexes) {
          expect(r.geoAddress).toBeNull()
          expect(r.hkgovCsuId).toBeNull()
          expect(r.enStreetNumberFrom).not.toBeNull()
          if (ids.has(requireDefined(r.enEstateName)))
            expect(r.id).toBe(requireDefined(ids.get(requireDefined(r.enEstateName))))
          else ids.set(requireDefined(r.enEstateName), requireDefined(r.id))
        }
        const features = []
        let expectedUnits = 0
        for await (const { feature } of readAls3dFeatures(
          `${root}/${release}/als_addresses_3d_(public_rental_housing).geojson`,
        )) {
          const p = feature.properties.Address.PremisesAddress
          if (
            fixture.rules.some(
              r => r.estate === p.EngPremisesAddress?.EngEstate?.EstateName,
            )
          ) {
            features.push(feature)
            expectedUnits += p.EngPremisesAddress?.Eng3dAddress?.length ?? 0
          }
        }
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
        expect(rows.filter(r => r.curatedGranularity === 'complex')).toHaveLength(2)
        const records = (await Bun.file(`${outputFile}.address3d.jsonl`).text())
            .trim()
            .split('\n')
            .map(l => JSON.parse(l)),
          collections = records.filter(r => r.kind === 'collection')
        expect(collections.reduce((n, r) => n + r.unitCount, 0)).toBe(expectedUnits)
        expect(collections.some(c => complexes.some(r => r.id === c.address2dId))).toBe(
          false,
        )
        for (const collection of collections)
          expect(named.some(r => r.id === collection.address2dId)).toBe(true)
        console.log(
          v,
          '2 street-bearing complexes; named inventories unchanged:',
          expectedUnits,
        )
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
  600000,
)
