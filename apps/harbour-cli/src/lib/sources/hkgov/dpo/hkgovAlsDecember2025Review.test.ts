import { applyReviewedAlsIdentityAliases } from './hkgovAlsReviewProgram'
import type { AlsMembershipAddress } from './hkgovAlsMembership'
import { expect, test } from 'bun:test'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-december-2025-reviewed-retentions.json'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { normaliseAddressRowForPipeline } from '@repo/core/pipeline/services/addresses/normalisation'
import {
  retainReviewedAlsPremises,
  applyReviewedAlsPremiseRetentions,
} from './hkgovAlsReviewedPremiseRetentions'

import type { HkgovAlsSourceFeature, PreparedHkgovAlsRow } from './hkgovAlsTypes'
const maps = {
  areaByEn: new Map(),
  areaByZh: new Map(),
  ambiguousAreaEn: new Set<string>(),
  ambiguousAreaZh: new Set<string>(),
  countryId: null,
  districtByEn: new Map(),
  districtByZh: new Map(),
  ambiguousDistrictEn: new Set<string>(),
  ambiguousDistrictZh: new Set<string>(),
  snapshotId: 'test',
}
const decisions = fixture.rules as unknown as NonNullable<
  Parameters<typeof retainReviewedAlsPremises>[2]
>
function prepare() {
  const features = fixture.rules.map((r, i) => ({
    feature: structuredClone(r.evidence.feature),
    sourceFile: r.sourceFile,
    featureIndexOneBased: i + 1,
  })) as unknown as HkgovAlsSourceFeature[]
  const applications = retainReviewedAlsPremises(features, '2025-12-16.0', decisions)
  const rows = features.map(f =>
    normaliseHkgovAlsFeature(
      f.feature,
      f.sourceFile,
      f.featureIndexOneBased,
      'test',
      '2025-12-16.0',
      maps,
      true,
      new Map(),
      new Map(),
      new Map(),
    ),
  )
  applyReviewedAlsPremiseRetentions(rows, applications)
  return rows
}
test('December names, streets, estates and explicit classification survive pipeline normalisation', () => {
  const rows = prepare()
  for (const number of [3, 5, 6]) {
    const r = fixture.rules.find(r => r.externalEvidence.entry === number)!
    const row = rows.find(row => row.id === r.canonicalId)!
    expect(row.enBuildingName).toBeNull()
    expect(row.enBlockNumber).toBeNull()
    expect(row.enVillageName).toBeNull()
    expect(row.enEstateName).toBe(number === 3 ? 'ROYAL PALMS' : 'THE GREEN')
    expect(row.enStreetName).toBe(number === 3 ? 'SANTA BARBARA AVENUE' : 'MAPLE DRIVE')
    expect(row.enStreetNumberFrom).toBe(
      number === 3 ? '12' : number === 5 ? '25' : '23',
    )
    expect(normaliseAddressRowForPipeline(row).base.granularity).toBe('unknown')
  }
  for (const [number, name] of [
    [1, 'ORIA'],
    [2, 'KAILEY TOWER'],
    [4, 'LEE FUNG COMMERCIAL BUILDING'],
    [7, 'STONE RISE'],
    [8, 'TSING YI TOWN CLINIC'],
    [10, 'CENTRE FOR FOOD SAFETY'],
  ] as const) {
    const row = rows.find(
      row =>
        row.id ===
        fixture.rules.find(r => r.externalEvidence.entry === number)!.canonicalId,
    )!
    expect(row.enBuildingName).toBe(name)
    expect(normaliseAddressRowForPipeline(row).base.granularity).toBe('building')
  }
  const kailey = rows.find(row => row.enBuildingName === 'KAILEY TOWER')!
  expect([kailey.enStreetNumberFrom, kailey.enStreetNumberTo]).toEqual(['14', '16'])
})
test('Kailey merges only the duplicate Stanley address and guards its location', () => {
  const rows = prepare(),
    d = fixture.identityReconciliations[0]!,
    g = d.previousGuards[0]!
  const duplicate = {
    ...rows.find(r => r.id === d.canonicalId)!,
    id: g.id,
    enFormattedAddress: g.enFormattedAddress,
    zhHantFormattedAddress: g.zhHantFormattedAddress,
    geometry: JSON.stringify({ type: 'Point', coordinates: g.coordinates }),
  }
  const wellington = {
    ...duplicate,
    id: 'ss-eb88380c-396c-5234-a127-2a6e2890e31d',
    enStreetName: 'WELLINGTON STREET',
    enStreetNumberFrom: '23',
  } as PreparedHkgovAlsRow
  rows.push(duplicate, wellington)
  expect(applyDecember2025ReviewedIdentityAliases(rows, '2025-11-04.0').size).toBe(0)
  const changed = structuredClone(rows)
  changed.find(r => r.id === g.id)!.enFormattedAddress = 'Different address'
  expect(() =>
    applyDecember2025ReviewedIdentityAliases(changed, '2025-12-16.0'),
  ).toThrow('returned frontage changed')
  const aliases = applyDecember2025ReviewedIdentityAliases(rows, '2025-12-16.0')
  expect(aliases.get(g.id)).toBe(d.canonicalId)
  expect(rows.some(r => r.id === g.id)).toBe(false)
  expect(rows).toContain(wellington)
})

test('December retirement approves only the exact prior identity, leaving its street address', async () => {
  const { default: approvals } = await import(
    '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-approved-retirements.json'
  )
  const { buildAlsDeletionReport } = await import('./hkgovAlsDeletionPreflight')
  const before = approvals.decisions.find(d => d.id === 'december-2025-reviewed-9')!
    .previousAddresses[0]!
  const membership = (sourceVersion: string, addresses: AlsMembershipAddress[]) => ({
    schemaVersion: 1 as const,
    sourceVersion,
    addresses,
    collections: [],
    sources: addresses.flatMap(a =>
      a.sourceIds.map(id => ({ id, kind: '2d' as const, canonicalIds: [a.id] })),
    ),
    aliases: [],
  })
  const previous = membership('2025-11-04.0', [
    structuredClone(before) as unknown as AlsMembershipAddress,
  ])
  const current = membership('2025-12-16.0', [
    {
      ...before,
      id: 'ss-8047a615-a50a-588f-b5a8-ca48f402571f',
      level: 'unknown',
      en: '37-43 SHA TSUI ROAD, TSUEN WAN DISTRICT, NT',
      zhHant: '3743沙咀道荃灣區新界',
    } as unknown as AlsMembershipAddress,
  ])
  const report = buildAlsDeletionReport(previous, current)
  expect(report.requiresReview).toBe(false)
  expect(report.reviewedRetirements.map(r => r.id)).toEqual([before.id])
  previous.addresses[0]!.en = 'Changed prior premise'
  expect(buildAlsDeletionReport(previous, current).requiresReview).toBe(true)
})

const applyDecember2025ReviewedIdentityAliases = (
  rows: Parameters<typeof applyReviewedAlsIdentityAliases>[0],
  version: string,
) =>
  applyReviewedAlsIdentityAliases(
    rows,
    version,
    'hkgov-dpo-address-december-2025-reviewed-retentions',
  )
