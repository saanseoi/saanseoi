import { requireDefined } from '@repo/core/requireDefined'
import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadHouseRetentionFixture } from './hkgovAlsHouseRetentionEvidence'
import {
  labelAlsHouseRetentions,
  readAls3dWithHouseRetentions,
  retainAlsHouses,
} from './hkgovAlsHouseRetentions'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'
import policy from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-house-retentions.json'

const rules = loadHouseRetentionFixture().retentions.filter(r =>
  [
    'fu-tip-estate-ban-tip-house',
    'kai-chuen-court-kai-wang-house',
    'kai-chuen-court-kai-chun-house',
  ].includes(r.id),
)
const wrap = (feature: HkgovAlsSourceFeature['feature']): HkgovAlsSourceFeature => ({
  feature: structuredClone(feature),
  sourceFile: 'publisher.geojson',
  featureIndexOneBased: 1,
})
const anchor = (estate: string) =>
  wrap({
    geometry: { type: 'Point', coordinates: [114, 22] },
    properties: {
      Address: {
        PremisesAddress: {
          EngPremisesAddress: {
            EngEstate: { EstateName: estate },
            BuildingName: 'UNRELATED HOUSE',
          },
        },
      },
    },
  })
const normalise = (s: HkgovAlsSourceFeature, version: string) =>
  normaliseHkgovAlsFeature(
    s.feature,
    s.sourceFile,
    s.featureIndexOneBased,
    'test',
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
const evidenceFor = (r: (typeof rules)[number], version: string, kind: '2d' | '3d') =>
  r[`evidence${kind}`]
    .filter(e => e.sourceVersions.includes(version))
    .map(e => e.feature)

test('all 30 retained releases skip the fallback for the three present houses', () => {
  expect(rules).toHaveLength(3)
  expect(requireDefined(rules[0]).sourceVersions).toHaveLength(30)
  for (const version of requireDefined(rules[0]).sourceVersions) {
    const source = rules.flatMap(r => evidenceFor(r, version, '2d').map(wrap))
    const original = structuredClone(source)
    expect(retainAlsHouses(source, version).size).toBe(0)
    expect(source).toEqual(original)
  }
})

test('revocation disables future omission fallbacks', () => {
  const selected = policy.retentions.filter(r =>
    [
      'fu-tip-estate-ban-tip-house',
      'kai-chuen-court-kai-wang-house',
      'kai-chuen-court-kai-chun-house',
    ].includes(r.id),
  )
  const states = selected.map(r => requireDefined(r.application).state)
  try {
    for (const r of selected) requireDefined(r.application).state = 'revoked'
    const source = [anchor('FU TIP ESTATE'), anchor('KAI CHUEN COURT')]
    expect(retainAlsHouses(source, '2030-01-01.0').size).toBe(0)
    expect(source).toHaveLength(2)
  } finally {
    selected.forEach((r, i) => {
      requireDefined(r.application).state = requireDefined(states[i])
    })
  }
})

test('forward-fills omissions with dated evidence, then skips returned publisher houses', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'als-omitted-houses-'))
  try {
    for (const version of ['2024-07-31.0', '2030-01-01.0']) {
      const source = [anchor('FU TIP ESTATE'), anchor('KAI CHUEN COURT')]
      const provenance = retainAlsHouses(source, version)
      expect(provenance.size).toBe(3)
      const rows = source
        .filter(s => s.sourceFile !== 'publisher.geojson')
        .map(s => normalise(s, version))
      labelAlsHouseRetentions(rows, provenance)
      expect(rows).toHaveLength(3)
      for (const row of rows) {
        const p = JSON.parse(row.sources).hkgovAlsHouseRetention
        expect(p.originalAssertions).toEqual([])
        expect(p.evidenceSourceVersion <= version).toBe(true)
        expect(p.curation.verificationStatus).toBe(
          version.startsWith('2030') ? 'unverified' : 'verified',
        )
      }
      const file = join(dir, 'source.geojson')
      const unrelated = anchor('OTHER ESTATE').feature
      await Bun.write(
        file,
        JSON.stringify({ type: 'FeatureCollection', features: [unrelated] }, null, 2),
      )
      const retained = []
      for await (const r of readAls3dWithHouseRetentions(file, version, rows))
        retained.push(r)
      const patched = retained.filter(r => r.houseRetention)
      expect(patched).toHaveLength(3)
      expect(
        patched
          .map(
            r =>
              requireDefined(
                requireDefined(
                  r.feature.properties.Address.PremisesAddress.EngPremisesAddress,
                ).Eng3dAddress,
              ).length,
          )
          .sort(),
      ).toEqual([468, 550, 655])

      const returnedVersion = version.startsWith('2030') ? '2026-08-19.0' : version
      const returned = rules.flatMap(r =>
        evidenceFor(r, returnedVersion, '2d').map(wrap),
      )
      // An actual publisher update must bypass this fallback, not fail its old hash guard.
      requireDefined(requireDefined(returned[0]).feature.geometry).coordinates = [
        114.2, 22.4,
      ]
      const original = structuredClone(returned)
      expect(retainAlsHouses(returned, version).size).toBe(0)
      expect(returned).toEqual(original)
      const presentRows = returned.map(s => normalise(s, version))
      const published3d = rules.flatMap(r => evidenceFor(r, returnedVersion, '3d'))
      await Bun.write(
        file,
        JSON.stringify({ type: 'FeatureCollection', features: published3d }, null, 2),
      )
      for (const selectedRows of [rows, presentRows]) {
        const actual = []
        for await (const r of readAls3dWithHouseRetentions(
          file,
          version,
          selectedRows,
        )) {
          expect(r.houseRetention).toBeUndefined()
          actual.push(r.feature)
        }
        expect(actual).toEqual(published3d)
      }
      // A present 2D house must not acquire a fallback inventory just because 3D is absent.
      await Bun.write(
        file,
        JSON.stringify({ type: 'FeatureCollection', features: [unrelated] }, null, 2),
      )
      const actual = []
      for await (const r of readAls3dWithHouseRetentions(file, version, presentRows))
        actual.push(r)
      expect(actual).toHaveLength(1)
      expect(requireDefined(actual[0]).houseRetention).toBeUndefined()
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
