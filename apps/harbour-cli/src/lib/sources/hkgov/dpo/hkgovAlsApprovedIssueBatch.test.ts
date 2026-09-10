import { requireDefined } from '@repo/core/requireDefined'
import { test, expect } from 'bun:test'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-approved-issue-batch.json'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import {
  applyApprovedIssueBatch,
  approvedIssue3dSuppression,
} from './hkgovAlsApprovedIssueBatch'
import type { Als3dFeature } from './hkgovAls3d'
import type { HkgovAlsFeature } from './hkgovAlsTypes'

const maps = {
  areaByEn: new Map(),
  areaByZh: new Map(),
  ambiguousAreaEn: new Set<string>(),
  ambiguousAreaZh: new Set<string>(),
  districtByEn: new Map(),
  districtByZh: new Map(),
  ambiguousDistrictEn: new Set<string>(),
  ambiguousDistrictZh: new Set<string>(),
  countryId: null,
  snapshotId: 'test',
}
function rowsFor(version: string) {
  const features = fixture.decisions.flatMap(d =>
    d.assertions
      .filter(a => a.kind !== '3d' && a.versions.includes(version))
      .map(a => a.evidence),
  )
  const distinct = [...new Map(features.map(f => [JSON.stringify(f), f])).values()]
  return distinct.map((f, i) =>
    normaliseHkgovAlsFeature(
      {
        geometry: f.geometry as HkgovAlsFeature['geometry'],
        properties: { Address: { PremisesAddress: f.premises } },
      },
      'test',
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
}
test('all reviewed releases suppress only approved variants and retain corrected addresses and raw assertions', () => {
  const identities = new Map<string, string>()
  for (const { version } of requireDefined(fixture.decisions[0]).releases) {
    const rows = rowsFor(version)
    applyApprovedIssueBatch(rows, version)
    for (const rule of fixture.decisions) {
      if (rule.action === 'suppress') {
        expect(
          rows.some(
            r =>
              rule.csus.includes(r.hkgovCsuId ?? '') &&
              new RegExp(rule.pattern).test(
                JSON.parse(requireDefined(r.engPremisesAddressJson)).BuildingName ?? '',
              ),
          ),
        ).toBe(false)
        continue
      }
      const matches = rows.filter(r => rule.csus.includes(r.hkgovCsuId ?? ''))
      expect(matches).toHaveLength(1)
      const row = requireDefined(matches[0])
      if (rule.action === 'number') {
        expect(row.enStreetNumberFrom).toBe('6H')
        expect(row.zhHantStreetNumberFrom).toBe('6H')
        expect(row.identityNumberFrom).toBe('6H')
        expect(row.identitySummary.numberFrom).toBe('6H')
        expect(row.enFormattedAddress).toContain('6H')
        expect(row.zhHantFormattedAddress).toContain('6H')
      }
      if (rule.action === 'label') {
        expect(row.enBuildingName).toBe(requireDefined(rule.enName))
        expect(row.zhHantBuildingName).toBe(requireDefined(rule.zhName))
        expect(row.identitySummary.buildingName).toBe(requireDefined(rule.enName))
        expect(row.enFormattedAddress).toContain('EXTENSION')
        expect(row.zhHantFormattedAddress).toContain('擴建部分')
      }
      if (rule.action === 'street') {
        expect(row.enStreetName).toBe('SAU MAU PING ROAD')
        expect(row.zhHantStreetName).toBe('秀茂坪道')
        expect(row.enStreetNumberFrom).toBe('101')
        expect(row.identitySummary.routeName).toBe('SAU MAU PING ROAD')
        expect(JSON.parse(row.identityRouteNames)).toEqual([
          'SAU MAU PING ROAD',
          '秀茂坪道',
        ])
        expect(row.enFormattedAddress).toContain('SAU MAU PING ROAD')
        expect(row.zhHantFormattedAddress).toContain('秀茂坪道')
        expect(
          JSON.parse(requireDefined(row.engPremisesAddressJson)).EngStreet.StreetName,
        ).toBe('SAU MING ROAD')
      } else {
        identities.set(rule.id, identities.get(rule.id) ?? row.id)
        expect(row.id).toBe(requireDefined(identities.get(rule.id)))
      }
      expect(
        JSON.parse(row.sources).hkgovAlsApprovedIssues.at(-1).sourceEvidence.length,
      ).toBeGreaterThan(0)
    }
  }
})
test('separate Sheung Tak owners retain independent identities and Tai Hang Tung retains the raw range', () => {
  for (const { version } of requireDefined(fixture.decisions[0]).releases) {
    const rows = rowsFor(version)
    const ownerCsus = [
      '4443719049T20050430',
      '4456219135T20050430',
      '3575321200T20050430',
    ]
    const before = new Map(
      rows
        .filter(r => ownerCsus.includes(r.hkgovCsuId ?? ''))
        .map(r => [r.hkgovCsuId, structuredClone(r)]),
    )
    applyApprovedIssueBatch(rows, version)
    for (const csu of ownerCsus) {
      const owners = rows.filter(r => r.hkgovCsuId === csu)
      expect(owners).toHaveLength(1)
      expect(requireDefined(owners[0]).id).toBe(requireDefined(before.get(csu)).id)
      expect(requireDefined(owners[0]).engPremisesAddressJson).toBe(
        requireDefined(before.get(csu)).engPremisesAddressJson,
      )
    }
    const wong = requireDefined(rows.find(r => r.hkgovCsuId === '3575321200T20050430'))
    const decision = JSON.parse(wong.sources).hkgovAlsApprovedIssues?.find(
      (d: { id?: string }) => d.id === 'tai-hang-tung-wong-empty',
    )
    if (decision) {
      expect(wong.enStreetNumberFrom).toBe('83')
      expect(
        JSON.parse(decision.sourceEvidence[0].engPremisesAddressJson).EngStreet,
      ).toMatchObject({ BuildingNoFrom: '83', BuildingNoTo: '88' })
    }
  }
})
test('changed source evidence, missing owner and incomplete hall assertions fail closed', () => {
  const version = '2025-06-20.0'
  for (const mutate of [
    (rows: ReturnType<typeof rowsFor>) => {
      requireDefined(rows.find(r => r.hkgovCsuId === '3807526262T20050430')).geometry =
        '{"type":"Point","coordinates":[0,0]}'
    },
    (rows: ReturnType<typeof rowsFor>) => {
      rows.splice(
        rows.findIndex(r => r.enBuildingName?.startsWith('TAK YAM')),
        1,
      )
    },
    (rows: ReturnType<typeof rowsFor>) => {
      rows.splice(
        rows.findIndex(r => r.hkgovCsuId === '3807526262T20050430'),
        1,
      )
    },
  ]) {
    const rows = rowsFor(version)
    mutate(rows)
    expect(() => applyApprovedIssueBatch(rows, version)).toThrow()
  }
  const rows = rowsFor(version),
    before = JSON.stringify(rows)
  applyApprovedIssueBatch(rows, '2026-08-20.0')
  expect(JSON.stringify(rows)).toBe(before)
})
test('skip mode retains unresolved owner evidence and still applies matching decisions', () => {
  const version = '2025-06-20.0'
  const rows = rowsFor(version)
  const rule = requireDefined(
    fixture.decisions.find(rule => rule.id === 'on-yam-combined'),
  )
  const owner = requireDefined(
    rows.find(row => row.enBuildingName?.startsWith('TAK YAM')),
  )
  owner.geometry = '{"type":"Point","coordinates":[0,0]}'
  const before = structuredClone(rows.filter(row => row.enEstateName === rule.estate))
  expect(() => applyApprovedIssueBatch(structuredClone(rows), version)).toThrow(
    'owner evidence changed',
  )
  applyApprovedIssueBatch(rows, version, true)
  expect(rows.filter(row => row.enEstateName === rule.estate)).toEqual(before)
  expect(
    rows.some(row => JSON.parse(row.sources).hkgovAlsApprovedIssues?.length > 0),
  ).toBe(true)

  const strict = rowsFor(version),
    permissive = structuredClone(strict)
  applyApprovedIssueBatch(strict, version)
  applyApprovedIssueBatch(permissive, version, true)
  expect(permissive).toEqual(strict)
})

test('empty 3D suppression is signature-guarded and rejects a newly populated inventory', () => {
  for (const rule of fixture.decisions.filter(d => d.pattern === '^$')) {
    for (const a of rule.assertions.filter(a => a.kind === '3d')) {
      const feature: Als3dFeature = {
        geometry: a.evidence.geometry as Als3dFeature['geometry'],
        properties: {
          Address: { PremisesAddress: structuredClone(a.evidence.premises) },
        },
      }
      expect(
        approvedIssue3dSuppression(feature, requireDefined(a.versions[0]))?.id,
      ).toBe(rule.id)
      feature.properties.Address.PremisesAddress.EngPremisesAddress = {
        ...feature.properties.Address.PremisesAddress.EngPremisesAddress,
        Eng3dAddress: [{ EngFloor: { FloorNum: '1' } }],
      }
      expect(() =>
        approvedIssue3dSuppression(feature, requireDefined(a.versions[0])),
      ).toThrow('source evidence changed')
    }
  }
})
