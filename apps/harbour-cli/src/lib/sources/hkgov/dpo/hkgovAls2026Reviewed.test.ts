import { applyReviewedAlsIdentityAliases } from './hkgovAlsReviewProgram'

import december from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-december-2025-reviewed-retentions.json'

import juneReviewed from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-june-reviewed-retentions.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
import { expect, test } from 'bun:test'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-2026-reviewed-continuity.json'
import june from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-june-confidence-continuity.json'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { assertUniquePreparedRowIds } from './hkgovAlsEvidence'
import {
  retainReviewedAlsPremises,
  applyReviewedAlsPremiseRetentions,
} from './hkgovAlsReviewedPremiseRetentions'
import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'

for (const oldBailey of fixture.rules)
  test(`${oldBailey.id}: keeps both addresses without redirecting the established identity`, () => {
    const hollywood = june.rules.find(
      r => r.canonicalId === oldBailey.sharedProvisionalId,
    )!
    const rules = [oldBailey, hollywood] as unknown as NonNullable<
      Parameters<typeof retainReviewedAlsPremises>[2]
    >
    const features: HkgovAlsSourceFeature[] = [
      oldBailey.evidence.feature,
      hollywood.subsequentReviews?.find(r => r.sourceVersion === '2026-04-03.0')
        ?.feature ?? hollywood.evidence.feature,
    ].map((feature, i) => ({
      sourceFile: oldBailey.sourceFile,
      featureIndexOneBased: i + 1,
      feature: structuredClone(feature),
    })) as unknown as HkgovAlsSourceFeature[]
    const applications = retainReviewedAlsPremises(features, '2026-04-03.0', rules)
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
    const rows = features.map(f =>
      normaliseHkgovAlsFeature(
        f.feature,
        f.sourceFile,
        f.featureIndexOneBased,
        'test',
        '2026-04-03.0',
        maps,
        true,
        new Map(),
        new Map(),
        new Map(),
      ),
    )
    applyReviewedAlsPremiseRetentions(rows, applications)
    expect(() => assertUniquePreparedRowIds(rows)).not.toThrow()
    expect(rows[0]!.id).toBe(oldBailey.canonicalId)
    expect(rows[0]!.identityAlias).toBeNull()
    expect(rows[0]!.enFormattedAddress).toContain('16 OLD BAILEY STREET')
    expect(rows[1]!.id).toBe(hollywood.canonicalId)
    expect(rows[1]!.enFormattedAddress).toContain('10 HOLLYWOOD ROAD')
  })

test('coordinate evidence for reviewed aliases is bound to the exact release', () => {
  const decision = juneReviewed.identityReconciliations.find(
    r => r.id === 'june-2025-final-alias-10',
  )!
  const guard = decision.targetGuardsBySourceVersion!['2026-04-03.0']!
  const row = {
    ...guard,
    id: decision.canonicalId,
    sources: '{}',
  } as PreparedHkgovAlsRow
  expect(
    applyJuneReviewedIdentityAliases([row], '2026-04-03.0').get(decision.aliasIds[0]!),
  ).toBe(decision.canonicalId)
  expect(
    applyJuneReviewedIdentityAliases([row], '2026-09-22.0').get(decision.aliasIds[0]!),
  ).toBe(decision.canonicalId)
  expect(() => applyJuneReviewedIdentityAliases([row], '2025-06-20.0')).toThrow(
    'target evidence changed',
  )
  expect(() =>
    applyJuneReviewedIdentityAliases(
      [{ ...row, enStreetNumberFrom: '54' }],
      '2026-04-03.0',
    ),
  ).toThrow('target evidence changed')
})

test('Kailey returned address accepts only its reviewed release coordinates', () => {
  const decision = december.identityReconciliations[0]!
  const guard = decision.previousGuards[0]!
  const owner = {
    ...decision.targetGuard,
    id: decision.canonicalId,
    sources: '{}',
  } as PreparedHkgovAlsRow
  const returned = {
    ...guard,
    geometry: JSON.stringify({
      type: 'Point',
      coordinates: guard.coordinatesBySourceVersion['2026-04-03.0'],
    }),
    sources: '{}',
  } as unknown as PreparedHkgovAlsRow
  const rows = [owner, returned]
  expect(
    applyDecember2025ReviewedIdentityAliases(rows, '2026-04-03.0').get(returned.id),
  ).toBe(owner.id)
  expect(rows).toHaveLength(1)
  expect(() =>
    applyDecember2025ReviewedIdentityAliases([owner, returned], '2025-12-16.0'),
  ).toThrow('returned location changed')
  expect(() =>
    applyDecember2025ReviewedIdentityAliases(
      [owner, { ...returned, enFormattedAddress: 'OTHER ADDRESS' }],
      '2026-04-03.0',
    ),
  ).toThrow('returned frontage changed')
})

for (const decision of december.rules.filter(r =>
  ['december-2025-reviewed-1', 'december-2025-reviewed-7'].includes(r.id),
))
  test(`${decision.id}: returned publisher name does not insert a duplicate retained record`, () => {
    for (const review of decision.subsequentReviews!) {
      const features = [
        {
          sourceFile: decision.sourceFile,
          featureIndexOneBased: 1,
          feature: structuredClone(review.feature),
        },
      ] as unknown as HkgovAlsSourceFeature[]
      const applications = retainReviewedAlsPremises(features, review.sourceVersion, [
        decision,
      ] as unknown as NonNullable<Parameters<typeof retainReviewedAlsPremises>[2]>)
      expect(features).toHaveLength(1)
      expect(applications.size).toBe(1)
      expect([...applications.values()][0]!.rule.canonicalId).toBe(decision.canonicalId)
      expect([...applications.values()][0]!.retained).toBe(false)
    }
  })

test('reviewed names and complex identities match returned 2026 publisher records without duplication', async () => {
  for (const file of [
    'hkgov-dpo-address-august-2025-reviewed-retentions.json',
    'hkgov-dpo-address-september-2025-reviewed-retentions.json',
    'hkgov-dpo-address-november-2025-reviewed-retentions.json',
  ]) {
    const data = await Bun.file(
      new URL(`../../../../../../../fixtures/meta/curations/${file}`, import.meta.url),
    ).json()
    for (const rule of data.rules.filter(
      (r: { subsequentReviews?: unknown[] }) => r.subsequentReviews,
    )) {
      for (const review of rule.subsequentReviews) {
        const features = [
          {
            sourceFile: rule.sourceFile,
            featureIndexOneBased: 1,
            feature: structuredClone(review.feature),
          },
        ] as HkgovAlsSourceFeature[]
        const result = retainReviewedAlsPremises(features, review.sourceVersion, [rule])
        expect(features).toHaveLength(1)
        expect(result.size).toBe(1)
        expect([...result.values()][0]!.retained).toBe(false)
        expect([...result.values()][0]!.rule.canonicalId).toBe(rule.canonicalId)
      }
    }
  }
})

test('missing reviewed inventories are evidenced in 2026; changed canonical unit IDs still fail', async () => {
  const { validateReviewedAlsInventories } = await import('./hkgovAlsReviewInventories')
  const validateDecemberCoalescedInventory = (
    membership: Parameters<typeof validateReviewedAlsInventories>[0],
    version: string,
  ) =>
    validateReviewedAlsInventories(
      membership,
      version,
      'hkgov-dpo-address-december-deletion-retentions',
    )
  const { collectAlsReviewIssues } = await import('./hkgovAlsReviewIssue')
  const data = (
    await import(
      '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-december-deletion-retentions.json'
    )
  ).default
  const decision = data.coalescences[0]!
  const membership = {
    addresses: [{ id: decision.canonicalId }],
    collections: [],
  } as unknown as Parameters<typeof validateDecemberCoalescedInventory>[0]
  expect(() => validateDecemberCoalescedInventory(membership, '2025-12-16.0')).toThrow(
    'canonical inventory is missing',
  )
  collectAlsReviewIssues(issues => {
    validateDecemberCoalescedInventory(membership, '2026-07-08.0')
    expect(issues).toEqual([
      expect.objectContaining({
        code: 'reviewed-inventory-omission',
        decisionId: decision.id,
        decision: expect.objectContaining({ unitAliasPairs: decision.unitAliasPairs }),
      }),
    ])
  })
  membership.collections = [
    {
      ownerId: decision.canonicalId,
      units: decision.unitAliasPairs.map((_, i) => [
        `changed-${i}`,
        '1',
        '1',
        'Unit',
        '單位',
      ]),
    },
  ] as unknown as typeof membership.collections
  expect(() => validateDecemberCoalescedInventory(membership, '2026-07-08.0')).toThrow(
    'canonical unit IDs changed',
  )
})

test('West Kowloon complex survives publisher omission with both distinct reviewed towers', async () => {
  const data = (
    await import(
      '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-june-final-retentions.json'
    )
  ).default
  const rules = data.rules.filter(
    r =>
      r.id === 'june-2025-final-220' ||
      ('parentRule' in r && r.parentRule === 'june-2025-final-220'),
  )
  for (const version of ['2026-07-22.0', '2026-08-19.0']) {
    const features = [
      {
        sourceFile: rules[0]!.sourceFile,
        featureIndexOneBased: 1,
        feature: {
          geometry: { type: 'Point', coordinates: [114, 22] },
          properties: {},
        },
      },
    ] as HkgovAlsSourceFeature[]
    const applications = retainReviewedAlsPremises(
      features,
      version,
      rules as unknown as NonNullable<Parameters<typeof retainReviewedAlsPremises>[2]>,
    )
    expect(applications.size).toBe(3)
    expect(new Set([...applications.values()].map(a => a.rule.canonicalId)).size).toBe(
      3,
    )
    expect(
      [...applications.values()].find(a => a.rule.role === 'complex')?.retained,
    ).toBe(true)
  }
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
const applyJuneReviewedIdentityAliases = (
  rows: Parameters<typeof applyReviewedAlsIdentityAliases>[0],
  version: string,
) =>
  applyReviewedAlsIdentityAliases(
    rows,
    version,
    'hkgov-dpo-address-june-reviewed-retentions',
  )
