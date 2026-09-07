import { expect, test } from 'bun:test'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-aliased-premise-coalescences.json'
import { coalesceAlsAliasedPremises } from './hkgovAlsAliasedPremiseCoalescences'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

function row(input: {
  csu: string
  id: string
  buildingName: string | null
  zhBuildingName: string | null
  blockRef?: string
}) {
  const isOwner = input.buildingName !== null
  const blockRef = input.blockRef ?? '1'
  return {
    id: input.id,
    canonicalId: input.id,
    identityKey: input.id,
    hkgovCsuId: input.csu,
    enEstateName: 'GRANDEUR TERRACE',
    zhHantEstateName: '俊宏軒',
    enBlockDescriptor: 'BLK',
    enBlockNumber: blockRef,
    zhHantBlockDescriptor: isOwner ? null : '座',
    zhHantBlockNumber: isOwner ? null : blockRef,
    enStreetName: 'TIN SHUI ROAD',
    zhHantStreetName: '天瑞路',
    enStreetNumberFrom: '88',
    zhHantStreetNumberFrom: '88',
    geometry: JSON.stringify({ type: 'Point', coordinates: [114.00049, 22.46884] }),
    sources: '{}',
    engPremisesAddressJson: JSON.stringify({
      BuildingName: input.buildingName,
      EngEstate: { EstateName: 'GRANDEUR TERRACE' },
      EngBlock: isOwner ? undefined : { BlockDescriptor: 'BLK', BlockNo: blockRef },
    }),
    chiPremisesAddressJson: JSON.stringify({
      BuildingName: input.zhBuildingName,
      ChiEstate: { EstateName: '俊宏軒' },
      ChiBlock: isOwner ? undefined : { BlockDescriptor: '座', BlockNo: blockRef },
    }),
  } as PreparedHkgovAlsRow
}

test('coalesces the reviewed named and structured aliases without losing provenance', () => {
  const rows = fixture.coalescences.flatMap(decision => [
    row({
      csu: decision.owner.csu,
      id: `named-${decision.blockRef}`,
      buildingName: decision.owner.enBuildingName,
      zhBuildingName: decision.owner.zhHantBuildingName,
      blockRef: decision.blockRef,
    }),
    row({
      csu: decision.aliasCsu,
      id: `structured-${decision.blockRef}`,
      buildingName: null,
      zhBuildingName: null,
      blockRef: decision.blockRef,
    }),
  ])
  const skipMappings = coalesceAlsAliasedPremises(
    structuredClone(rows),
    '2026-08-19.0',
    true,
  )
  const mappings = coalesceAlsAliasedPremises(rows, '2026-08-19.0')
  expect(skipMappings).toEqual(mappings)
  expect(mappings.get('structured-1')).toBe('named-1')
  const owner = rows[0]
  if (!owner) throw new Error('Missing first reviewed owner')
  expect(JSON.parse(owner.sources).hkgovAlsAliasedPremiseCoalescence).toMatchObject({
    id: 'grandeur-terrace-block-1',
    suppressedAddress: { addressId: 'structured-1' },
  })
})

test('requires the paired publisher points to remain identical', () => {
  const owner = row({
    csu: '1812336595T20120105',
    id: 'named',
    buildingName: 'GRANDEUR TERRACE BLOCK 1',
    zhBuildingName: '俊宏軒第一座',
  })
  const alias = row({
    csu: '1812336606P20120105',
    id: 'structured',
    buildingName: null,
    zhBuildingName: null,
  })
  alias.geometry = JSON.stringify({ type: 'Point', coordinates: [114, 22] })
  expect(() => coalesceAlsAliasedPremises([owner, alias], '2026-08-19.0')).toThrow(
    'point changed',
  )
  const original = structuredClone([owner, alias])
  expect(coalesceAlsAliasedPremises([owner, alias], '2026-08-19.0', true).size).toBe(0)
  expect([owner, alias]).toEqual(original)
})

test('rejects changed named owners and structured alias identities', () => {
  for (const change of [
    (owner: PreparedHkgovAlsRow, _alias: PreparedHkgovAlsRow) => {
      owner.chiPremisesAddressJson = JSON.stringify({ BuildingName: '俊宏軒第二座' })
    },
    (_owner: PreparedHkgovAlsRow, alias: PreparedHkgovAlsRow) => {
      alias.zhHantBlockDescriptor = null
    },
    (_owner: PreparedHkgovAlsRow, alias: PreparedHkgovAlsRow) => {
      const raw = JSON.parse(alias.chiPremisesAddressJson!)
      raw.ChiBlock.BlockNo = '2'
      alias.chiPremisesAddressJson = JSON.stringify(raw)
    },
  ]) {
    const decision = fixture.coalescences[0]!
    const owner = row({
      csu: decision.owner.csu,
      id: 'named',
      buildingName: decision.owner.enBuildingName,
      zhBuildingName: decision.owner.zhHantBuildingName,
    })
    const alias = row({
      csu: decision.aliasCsu,
      id: 'structured',
      buildingName: null,
      zhBuildingName: null,
    })
    change(owner, alias)
    expect(() => coalesceAlsAliasedPremises([owner, alias], '2024-07-25.0')).toThrow()
    expect(owner.sources).toBe('{}')
    const original = structuredClone([owner, alias])
    expect(coalesceAlsAliasedPremises([owner, alias], '2024-07-25.0', true).size).toBe(
      0,
    )
    expect([owner, alias]).toEqual(original)
  }
})
