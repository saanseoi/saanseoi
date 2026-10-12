import { duplicateInventoryUnitAliases } from './hkgovAlsDuplicateInventoryAliases'
import { expect, test } from 'bun:test'
import { buildAlsDeletionReport } from './hkgovAlsDeletionPreflight'
import type { AlsMembership } from './hkgovAlsMembership'

function memberships() {
  const a = {
    id: 'a',
    level: 'building',
    parentId: null,
    en: 'Block 7',
    zhHant: null,
    coordinates: null,
    sourceIds: [],
    curations: [],
  }
  const b = { ...a, id: 'b', en: 'Hin Tip House' }
  const before: AlsMembership = {
    schemaVersion: 1,
    sourceVersion: '2024-11-13.0',
    addresses: [a, b],
    aliases: [],
    sources: [],
    collections: [
      {
        id: 'inventory-a',
        ownerId: 'a',
        sourceIds: [],
        units: [
          ['a-1', '1', '101', 'FLAT 101', '101室'],
          ['a-2', '1', '102', 'FLAT 102', '102室'],
        ],
      },
      {
        id: 'inventory-b',
        ownerId: 'b',
        sourceIds: [],
        units: [
          ['b-1', '1', '101', 'FLAT 101', '101室'],
          ['b-2', '1', '102', 'FLAT 102', '102室'],
        ],
      },
    ],
  }
  const after: AlsMembership = {
    ...structuredClone(before),
    sourceVersion: '2024-12-12.0',
    addresses: [b],
    aliases: [['a', 'b']],
    collections: [structuredClone(before.collections[1]!)],
  }
  return { before, after }
}

test('a curated owner alias consolidates a complete duplicate while preserving existing canonical unit IDs', () => {
  const { before, after } = memberships()
  const report = buildAlsDeletionReport(before, after)
  expect(report.requiresReview).toBe(false)
  expect(report.wholeInventoryLosses).toEqual([])
  expect(report.unitAliasReplacements).toEqual([
    {
      from: 'a-1',
      to: 'b-1',
      previousCollectionId: 'inventory-a',
      collectionId: 'inventory-b',
    },
    {
      from: 'a-2',
      to: 'b-2',
      previousCollectionId: 'inventory-a',
      collectionId: 'inventory-b',
    },
  ])
})

test.each([
  'no owner alias',
  'no prior canonical inventory',
  'regenerated canonical IDs',
  'partial inventory',
  'different labels',
  'duplicate tokens',
])('%s cannot conceal a withdrawn inventory', failure => {
  const { before, after } = memberships()
  if (failure === 'no owner alias') after.aliases = []
  if (failure === 'no prior canonical inventory') before.collections.splice(1, 1)
  if (failure === 'regenerated canonical IDs')
    after.collections[0]!.units[0]![0] = 'new-unit-id'
  if (failure === 'partial inventory') after.collections[0]!.units.pop()
  if (failure === 'different labels')
    after.collections[0]!.units[0]![4] = 'DIFFERENT UNIT'
  if (failure === 'duplicate tokens')
    after.collections[0]!.units[1]!.splice(
      1,
      4,
      ...after.collections[0]!.units[0]!.slice(1),
    )
  const report = buildAlsDeletionReport(before, after)
  expect(report.requiresReview).toBe(true)
  expect(report.wholeInventoryLosses.map(c => c.collectionId)).toContain('inventory-a')
  expect(report.unitAliasReplacements).toBeUndefined()
})

test('reviewed duplicate inventories preserve separate owner addresses and reject changed owner evidence', async () => {
  const fixture = (
    await import(
      '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-duplicate-inventory-owners.json'
    )
  ).default
  for (const d of fixture.decisions) {
    const { before, after } = memberships()
    before.addresses = structuredClone([
      d.duplicateOwner,
      d.previousCanonicalOwner,
    ]) as typeof before.addresses
    after.addresses = structuredClone([
      d.currentDuplicateOwner,
      d.canonicalOwner,
    ]) as typeof after.addresses
    before.collections[0]!.ownerId = d.duplicateOwner.id
    before.collections[1]!.ownerId = d.canonicalOwner.id
    after.collections[0]!.ownerId = d.canonicalOwner.id
    after.sourceVersion = '2025-08-13.0'
    after.aliases = []
    expect(duplicateInventoryUnitAliases(before, after, id => id)).toHaveLength(2)
    expect(after.addresses.map(a => a.id)).toContain(d.duplicateOwner.id)
    after.addresses[0]!.en += ' changed'
    expect(duplicateInventoryUnitAliases(before, after, id => id)).toEqual([])
  }
})
