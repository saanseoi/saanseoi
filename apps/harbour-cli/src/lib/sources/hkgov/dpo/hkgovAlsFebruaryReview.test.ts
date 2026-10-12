import { applyReviewedAlsFrontages as applyAprilReviewedAlsReconciliationsSpecialised } from './hkgovAlsReviewFrontages'
import { reviewedAlsSectionOwnership as applyFebruaryReviewedSectionOwnership } from './hkgovAlsReviewHierarchy'
import { validateReviewedAlsInventories } from './hkgovAlsReviewInventories'
import { recordReviewedAlsCoalescences as applyDecemberInferredAlsHierarchySpecialised } from './hkgovAlsReviewHierarchy'
import { applyReviewedAlsParents } from './hkgovAlsReviewProgram'
import { validateReviewedAlsSources } from './hkgovAlsReviewProgram'
import march from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-march-deletion-retentions.json'
import april from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-april-deletion-retentions.json'

import februaryGuards from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-february-source-guards.json'
import february from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-february-deletion-retentions.json'

import january from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-january-deletion-retentions.json'

import october from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-october-deletion-retentions.json'

import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-december-deletion-retentions.json'
import november from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-november-deletion-retentions.json'

import { readAls3dFeatures } from './hkgovAls3d'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { consolidateEquivalentHkgovAlsPremises } from './hkgovAlsEvidence'
import {
  applyReviewedAlsPremiseRetentions,
  finishReviewedAlsPremiseRetentions,
  retainReviewedAlsPremises,
} from './hkgovAlsReviewedPremiseRetentions'

import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'

const rules = [
  ...october.rules,
  ...november.rules,
  ...fixture.rules,
  ...january.rules,
  ...february.rules,
  ...march.rules,
  ...april.rules,
] as unknown as NonNullable<Parameters<typeof retainReviewedAlsPremises>[2]>
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
const guards = [
  ...october.sourceGuards,
  ...november.sourceGuards,
  ...fixture.sourceGuards,
  ...january.sourceGuards,
  ...februaryGuards.sourceGuards,
  ...march.sourceGuards,
  ...april.sourceGuards,
]
async function inputs(dir: string) {
  const features: HkgovAlsSourceFeature[] = []
  for (const sourceFile of new Set(guards.map(g => g.sourceFile))) {
    const csus = new Set(
      guards.filter(g => g.sourceFile === sourceFile).map(g => g.csu),
    )
    for await (const f of readAls3dFeatures(
      `data/hkgov/dpo/ALS/${dir}/${sourceFile}`,
    )) {
      if (
        f.featureIndexOneBased === 1 ||
        csus.has(
          f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation
            ?.CsuId ?? '',
        )
      )
        features.push({
          ...f,
          sourceFile,
          feature: {
            ...f.feature,
            geometry: {
              ...f.feature.geometry,
              coordinates: f.feature.geometry.coordinates
                ? [
                    f.feature.geometry.coordinates[0]!,
                    f.feature.geometry.coordinates[1]!,
                  ]
                : undefined,
            },
          },
        })
    }
  }
  return features
}
function prepare(features: HkgovAlsSourceFeature[], version: string) {
  validateOctoberInferredAlsSources(features, version)
  validateNovemberInferredAlsSources(features, version)
  validateDecemberInferredAlsSources(features, version)
  validateJanuaryInferredAlsSources(features, version)
  validateFebruaryInferredAlsSources(features, version)
  validateMarchInferredAlsSources(features, version)
  validateAprilInferredAlsSources(features, version)
  const applications = retainReviewedAlsPremises(features, version, rules)
  const rows = features.map(f =>
    normaliseHkgovAlsFeature(
      f.feature,
      f.sourceFile,
      f.featureIndexOneBased,
      'test',
      version,
      maps,
      true,
      new Map(),
      new Map(),
      new Map(),
    ),
  )
  applyReviewedAlsPremiseRetentions(rows, applications)
  applyOctoberInferredAlsHierarchy(rows, version)
  applyNovemberInferredAlsHierarchy(rows, version)
  applyDecemberInferredAlsHierarchy(rows, version)
  applyJanuaryInferredAlsHierarchy(rows, version)
  applyFebruaryInferredAlsHierarchy(rows, version)
  applyMarchInferredAlsHierarchy(rows, version)
  applyAprilReviewedAlsReconciliations(rows, version)
  const distinct = consolidateEquivalentHkgovAlsPremises(rows).rows
  finishReviewedAlsPremiseRetentions(distinct)
  applyOctoberInferredAlsHierarchy(distinct, version)
  applyNovemberInferredAlsHierarchy(distinct, version)
  applyDecemberInferredAlsHierarchy(distinct, version)
  applyJanuaryInferredAlsHierarchy(distinct, version)
  applyFebruaryInferredAlsHierarchy(distinct, version)
  applyMarchInferredAlsHierarchy(distinct, version)
  return distinct
}

test('February retains exact successors, independent parents and recorded frontages across inspected deliveries', async () => {
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`
    if (version < '2025-02-25.0') continue
    const rows = prepare(await inputs(dir), version)
    expect(new Set(rows.map(r => r.id)).size).toBe(rows.length)
    for (const rule of february.rules)
      expect(
        rows.filter(r => r.id === rule.canonicalId),
        `${version}: ${rule.id}`,
      ).toHaveLength(1)
    for (const group of february.groups)
      for (const child of group.childIds) {
        const c = rows.find(r => r.id === child)
        if (version === '2025-02-25.0') expect(c, child).toBeDefined()
        if (!c) continue
        expect(c.id).not.toBe(group.parentId)
        expect(c.parentAddressId).toBe(group.parentId)
        expect(c.curatedGranularity).toBe(
          'childGranularity' in group && group.childGranularity === 'section'
            ? 'section'
            : 'building',
        )
      }
    if (version >= '2025-03-21.0') {
      for (const rule of march.rules)
        expect(
          rows.filter(r => r.id === rule.canonicalId),
          rule.id,
        ).toHaveLength(1)
      for (const group of march.groups)
        for (const id of group.childIds)
          expect(rows.find(r => r.id === id)?.parentAddressId).toBe(group.parentId)
    }
    if (version >= '2025-04-26.0') {
      for (const rule of april.rules)
        expect(
          rows.filter(row => row.id === rule.canonicalId),
          `${version}: ${rule.id}`,
        ).toHaveLength(1)
      expect(
        rows.find(row => row.id === 'ss-30129dc6-9cdc-5e17-96d8-f6b50fe2cd5d')
          ?.parentAddressId,
      ).toBe('ss-7982bd13-1cdd-59aa-a415-714ea751c638')
      expect(
        rows.find(row => row.id === 'ss-33a9b591-02ea-5987-9112-43af4f32cd65')
          ?.parentAddressId,
      ).toBe('ss-1a9b28b0-89d5-5971-8600-a4803fba0e49')
      expect(
        rows.find(row => row.id === 'ss-fe0d8e96-5d5e-50fe-a08e-b5702cb3811e')
          ?.enBuildingName,
      ).toBe('AMBER PLACE')
      expect(
        rows.find(row => row.id === 'ss-e4e7ec33-f240-53df-aa9c-aa597be0383a')
          ?.enBuildingName,
      ).toBe('FPS STORAGE FACILITY')
    }
    const sectionOwnership = applyFebruaryReviewedSectionOwnership(rows, version)
    for (const mapping of sectionOwnership.values())
      expect(mapping.physicalBuildingId).toBe(mapping.ownerId)
    expect(sectionOwnership.size).toBe(2)
    const frontage = [6, 199, 213, 217].map(
      n => rows.find(r => r.id === february.triage[n - 1]!.previousId)!,
    )
    expect(new Set(frontage.map(r => r.id)).size).toBe(4)
    expect(frontage.map(r => r.enStreetNumberFrom).sort()).toEqual([
      '51',
      '53',
      '55',
      '57',
    ])
    const hin = rows.find(r => r.id === february.inventories[0]!.ownerId)!
    expect(hin.enBuildingName).toBe('HIN FAT HOUSE')
    expect(hin.enEstateName).toBe('HIN FAT ESTATE')
  }
}, 240_000)

test('February records every human decision and fails closed on new evidence', async () => {
  expect(february.triage.filter(t => t.handling === 'investigate').length).toBe(0)
  expect(
    february.triage.filter(t => t.handling === 'approve-retirement').map(t => t.entry),
  ).toEqual([41, 42, 48, 86, 88, 115, 152, 157, 160, 171, 177, 203, 222])
  const dir = (await readdir('data/hkgov/dpo/ALS')).find(
    d => d.startsWith('20250225-') && d.endsWith('ALS-GeoJSON'),
  )!
  const features = await inputs(dir)
  const guard = februaryGuards.sourceGuards.find(
    g => g.assertions.find(a => a.version === '2025-02-25.0')!.hashes.length,
  )!
  const changed = features.find(
    f =>
      f.sourceFile === guard.sourceFile &&
      f.feature.properties?.Address?.PremisesAddress?.BuildingCsuInformation?.CsuId ===
        guard.csu,
  )!
  changed.feature.geometry!.coordinates![0]! += 0.01
  expect(() => validateFebruaryInferredAlsSources(features, '2025-02-25.0')).toThrow(
    'source evidence changed',
  )
  expect(() => validateFebruaryInferredAlsSources(features, '2026-09-01.0')).toThrow(
    'unreviewed source release',
  )
})

test('Hin Fat requires every reviewed unit identity even when the count is unchanged', () => {
  const decision = february.inventories[0]!
  const membership = {
    collections: [
      {
        ownerId: decision.ownerId,
        units: decision.unitIds.map(id => [id, '1', 'A', '1/F, FLAT A', '1樓A室']),
      },
    ],
  } as unknown as Parameters<typeof validateFebruaryRetainedInventory>[0]
  expect(() =>
    validateFebruaryRetainedInventory(membership, '2025-02-25.0'),
  ).not.toThrow()
  membership.collections[0]!.units[0]![0] = 'regenerated-unit'
  expect(() => validateFebruaryRetainedInventory(membership, '2025-02-25.0')).toThrow(
    'canonical unit IDs changed',
  )
})

test('February decisions and source guards retain complete bounded provenance partitions', async () => {
  const { retainCurationReference } = await import('@repo/core/provenance')
  for (const [document, arrayKey] of [
    [february, 'rules'],
    [februaryGuards, 'sourceGuards'],
  ] as const) {
    const objects = new Map<string, ArrayBuffer>()
    const entries = (document as unknown as Record<string, unknown[]>)[arrayKey]!
    await retainCurationReference(
      {
        async get(key) {
          const bytes = objects.get(key)
          return bytes ? { arrayBuffer: async () => bytes } : null
        },
        async put(key, value) {
          objects.set(key, value)
        },
      },
      entries.at(-1),
      [document],
    )
    expect([...objects.values()].every(bytes => bytes.byteLength <= 1024 * 1024)).toBe(
      true,
    )
    const retained = [...objects.values()].map(bytes =>
      JSON.parse(new TextDecoder().decode(bytes)),
    )
    expect(retained.flatMap(part => part[arrayKey])).toEqual(entries)
    expect(
      retained.every(part => part.reviewReportDigest === february.reviewReportDigest),
    ).toBe(true)
  }
})

test('March preserves human decisions and original automatic confidence', () => {
  expect(
    march.triage.filter(t => t.handling === 'approve-retirement').map(t => t.entry),
  ).toEqual([6, 12])
  expect(march.triage.every(t => t.confidence === 'human-reviewed')).toBe(true)
  expect(march.triage.filter(t => t.automaticConfidence === 'high')).toHaveLength(15)
  for (const entry of [10, 15]) {
    const triage = march.triage.find(t => t.entry === entry)!
    expect(march.rules.some(rule => rule.canonicalId === triage.previousId)).toBe(true)
  }
  const rename = march.rules.find(rule => rule.id === 'march-2025-reviewed-15')!
  expect(rename.patch).toMatchObject({ enName: 'EPOCH HOTEL', granularity: 'building' })
})

test('April records reviewed reconciliations and protects automatic confidence and Fai Ming IDs', () => {
  expect(
    april.triage.filter(t => t.handling === 'retain-reconcile').map(t => t.entry),
  ).toEqual([1, 2, 3, 5, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19])
  expect(
    april.triage.filter(t => t.automaticConfidence === 'high').map(t => t.entry),
  ).toEqual([3, 9, 12, 18, 19])
  expect(april.inventories.map(i => i.unitIds.length).sort((a, b) => a - b)).toEqual([
    133, 819,
  ])
  expect(april.rules.map(r => r.canonicalId).sort()).toEqual(
    expect.arrayContaining([
      'ss-2923bb41-412c-5d81-93dd-2f1bf59f6b88',
      'ss-643d002d-317a-54cc-8845-9cbf7e33097f',
      'ss-a7e2d623-aea6-52fd-b28e-13b453d00512',
    ]),
  )
})

test('June Hin Fat publisher building keeps its reviewed owner and omitted 872-unit inventory', async () => {
  const { readAls3dWithHouseRetentions } = await import('./hkgovAlsHouseRetentions')
  const { normaliseAls3dInventory } = await import('./hkgovAls3d')
  const decision = february.inventories[0]!
  for (const prefix of ['20250620', '20250813']) {
    const dir = (await readdir('data/hkgov/dpo/ALS')).find(
      d => d.startsWith(prefix) && d.endsWith('ALS-GeoJSON'),
    )!
    const version = `${prefix.slice(0, 4)}-${prefix.slice(4, 6)}-${prefix.slice(6, 8)}.0`
    const rows = prepare(await inputs(dir), version).filter(
      r => r.hkgovCsuId === '1607627728T20240812',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(decision.ownerId)
    expect(rows[0]!.sourceFile).toBe('als_addresses_(tuen_mun_district).geojson')
    const inventories = []
    for await (const record of readAls3dWithHouseRetentions(
      `data/hkgov/dpo/ALS/${dir}/als_addresses_3d_(public_rental_housing).geojson`,
      version,
      rows,
    )) {
      if (
        record.feature.properties.Address.PremisesAddress.BuildingCsuInformation
          ?.CsuId !== '1607627728T20240812'
      )
        continue
      inventories.push(record)
    }
    expect(inventories).toHaveLength(1)
    expect(Boolean(inventories[0]!.houseRetention)).toBe(prefix === '20250620')
    const inventory = normaliseAls3dInventory(inventories[0]!.feature, decision.ownerId)
    expect(inventory.units.map(u => u.id).sort()).toEqual(decision.unitIds)
  }
}, 120000)

const validateAprilInferredAlsSources = (
  rows: Parameters<typeof validateReviewedAlsSources>[0],
  version: string,
) =>
  validateReviewedAlsSources(
    rows,
    version,
    'hkgov-dpo-address-april-deletion-retentions',
  )
const validateMarchInferredAlsSources = (
  rows: Parameters<typeof validateReviewedAlsSources>[0],
  version: string,
) =>
  validateReviewedAlsSources(
    rows,
    version,
    'hkgov-dpo-address-march-deletion-retentions',
  )
const validateFebruaryInferredAlsSources = (
  rows: Parameters<typeof validateReviewedAlsSources>[0],
  version: string,
) =>
  validateReviewedAlsSources(rows, version, 'hkgov-dpo-address-february-source-guards')
const validateJanuaryInferredAlsSources = (
  rows: Parameters<typeof validateReviewedAlsSources>[0],
  version: string,
) =>
  validateReviewedAlsSources(
    rows,
    version,
    'hkgov-dpo-address-january-deletion-retentions',
  )
const validateOctoberInferredAlsSources = (
  rows: Parameters<typeof validateReviewedAlsSources>[0],
  version: string,
) =>
  validateReviewedAlsSources(
    rows,
    version,
    'hkgov-dpo-address-october-deletion-retentions',
  )
const validateNovemberInferredAlsSources = (
  rows: Parameters<typeof validateReviewedAlsSources>[0],
  version: string,
) =>
  validateReviewedAlsSources(
    rows,
    version,
    'hkgov-dpo-address-november-deletion-retentions',
  )
const validateDecemberInferredAlsSources = (
  rows: Parameters<typeof validateReviewedAlsSources>[0],
  version: string,
) =>
  validateReviewedAlsSources(
    rows,
    version,
    'hkgov-dpo-address-december-deletion-retentions',
  )

const applyDecemberInferredAlsHierarchy = (
  rows: Parameters<typeof applyReviewedAlsParents>[0],
  version: string,
) => {
  applyDecemberInferredAlsHierarchySpecialised(rows, version)
  applyReviewedAlsParents(
    rows,
    version,
    'hierarchy',
    'hkgov-dpo-address-december-deletion-retentions',
  )
}

const applyAprilReviewedAlsReconciliations = (
  rows: Parameters<typeof applyReviewedAlsParents>[0],
  version: string,
) => {
  applyReviewedAlsParents(
    rows,
    version,
    'initial-hierarchy',
    'hkgov-dpo-address-april-deletion-retentions',
  )
  applyAprilReviewedAlsReconciliationsSpecialised(rows, version)
}

const applyMarchInferredAlsHierarchy = (
  rows: Parameters<typeof applyReviewedAlsParents>[0],
  version: string,
) =>
  applyReviewedAlsParents(
    rows,
    version,
    'hierarchy',
    'hkgov-dpo-address-march-deletion-retentions',
  )

const applyFebruaryInferredAlsHierarchy = (
  rows: Parameters<typeof applyReviewedAlsParents>[0],
  version: string,
) =>
  applyReviewedAlsParents(
    rows,
    version,
    'hierarchy',
    'hkgov-dpo-address-february-deletion-retentions',
  )

const applyJanuaryInferredAlsHierarchy = (
  rows: Parameters<typeof applyReviewedAlsParents>[0],
  version: string,
) =>
  applyReviewedAlsParents(
    rows,
    version,
    'hierarchy',
    'hkgov-dpo-address-january-deletion-retentions',
  )

const applyOctoberInferredAlsHierarchy = (
  rows: Parameters<typeof applyReviewedAlsParents>[0],
  version: string,
) =>
  applyReviewedAlsParents(
    rows,
    version,
    'hierarchy',
    'hkgov-dpo-address-october-deletion-retentions',
  )

const applyNovemberInferredAlsHierarchy = (
  rows: Parameters<typeof applyReviewedAlsParents>[0],
  version: string,
) =>
  applyReviewedAlsParents(
    rows,
    version,
    'hierarchy',
    'hkgov-dpo-address-november-deletion-retentions',
  )

const validateFebruaryRetainedInventory = (
  rows: Parameters<typeof validateReviewedAlsInventories>[0],
  version: string,
) =>
  validateReviewedAlsInventories(
    rows,
    version,
    'hkgov-dpo-address-february-deletion-retentions',
  )
