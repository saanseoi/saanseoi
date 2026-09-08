import { requireDefined } from '@repo/core/requireDefined'
import { expect, test } from 'bun:test'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-aliased-premise-coalescences.json'
import { coalesceAlsAliasedPremises } from './hkgovAlsAliasedPremiseCoalescences'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
import { AlsCurationReviewError } from './hkgovAlsReviewIssue'

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
  const rows = fixture.coalescences
    .filter(decision => !('sharedBuilding' in decision))
    .flatMap(decision => [
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
  rows[0]!.geometry = JSON.stringify({
    type: 'Point',
    coordinates: [114.00057, 22.46877],
  })
  rows[1]!.geometry = JSON.stringify({
    type: 'Point',
    coordinates: [114.00057, 22.46887],
  })
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

test('selects B with exact source guards and preserves original points', () => {
  const pair = () => {
    const owner = row({
      csu: '1812336595T20120105',
      id: 'owner',
      buildingName: 'GRANDEUR TERRACE BLOCK 1',
      zhBuildingName: '俊宏軒第一座',
    })
    const alias = row({
      csu: '1812336606P20120105',
      id: 'alias',
      buildingName: null,
      zhBuildingName: null,
    })
    owner.geometry = JSON.stringify({
      type: 'Point',
      coordinates: [114.00057, 22.46877],
    })
    alias.geometry = JSON.stringify({
      type: 'Point',
      coordinates: [114.00057, 22.46887],
    })
    return [owner, alias] as const
  }
  for (const version of [
    '2026-04-25.0',
    '2026-07-08.0',
    '2026-07-10.0',
    '2026-07-22.0',
    '2026-08-19.0',
  ]) {
    const [owner, alias] = pair()
    const original = structuredClone([owner, alias])
    expect(coalesceAlsAliasedPremises([owner, alias], version).get('alias')).toBe(
      'owner',
    )
    expect(owner.geometry).toBe(alias.geometry)
    expect(alias).toEqual(original[1])
    expect(
      JSON.parse(owner.sources).hkgovAlsAliasedPremiseCoalescence.coordinateReview,
    ).toEqual({
      publisherOwnerGeometry: JSON.parse(original[0]!.geometry!),
      publisherAliasGeometry: JSON.parse(alias.geometry!),
      derivedGeometry: JSON.parse(alias.geometry!),
    })
  }
  const [owner, alias] = pair()
  expect(() => coalesceAlsAliasedPremises([owner, alias], '2026-04-22.0')).toThrow(
    'point changed',
  )
  alias.geometry = owner.geometry
  expect(coalesceAlsAliasedPremises([owner, alias], '2026-04-22.0').size).toBe(1)
  expect(owner.geometry).toContain('22.46877')
  for (const role of [0, 1]) {
    const rows = [...pair()]
    rows[role]!.geometry = JSON.stringify({ type: 'Point', coordinates: [114, 22] })
    const original = structuredClone(rows)
    expect(() => coalesceAlsAliasedPremises(rows, '2026-04-25.0')).toThrow(
      'point changed',
    )
    expect(coalesceAlsAliasedPremises(rows, '2026-04-25.0', true).size).toBe(0)
    expect(rows).toEqual(original)
  }
  const future = [...pair()]
  const original = structuredClone(future)
  expect(coalesceAlsAliasedPremises(future, '2026-08-20.0').size).toBe(0)
  expect(future).toEqual(original)
})

function sharedBuildingRow(id: string, withStreet: boolean) {
  return {
    id,
    canonicalId: id,
    identityKey: id,
    hkgovCsuId: '3104715804T20050430',
    enEstateName: 'SAI WAN ESTATE',
    zhHantEstateName: '西環邨',
    enStreetName: withStreet ? 'CADOGAN STREET' : null,
    zhHantStreetName: withStreet ? '加多近街' : null,
    enStreetNumberFrom: withStreet ? '52' : null,
    enStreetNumberTo: withStreet ? '60' : null,
    zhHantStreetNumberFrom: withStreet ? '52' : null,
    zhHantStreetNumberTo: withStreet ? '60' : null,
    geometry: JSON.stringify({ type: 'Point', coordinates: [114.12621, 22.28124] }),
    sources: '{}',
    engPremisesAddressJson: JSON.stringify({
      BuildingName: 'EAST TERRACE',
      EngEstate: { EstateName: 'SAI WAN ESTATE' },
      ...(withStreet
        ? {
            EngStreet: {
              StreetName: 'CADOGAN STREET',
              BuildingNoFrom: '52',
              BuildingNoTo: '60',
            },
          }
        : {}),
    }),
    chiPremisesAddressJson: JSON.stringify({
      BuildingName: '東苑臺',
      ChiEstate: { EstateName: '西環邨' },
      ...(withStreet
        ? {
            ChiStreet: {
              StreetName: '加多近街',
              BuildingNoFrom: '52',
              BuildingNoTo: '60',
            },
          }
        : {}),
    }),
  } as PreparedHkgovAlsRow
}

test('coalesces equivalent same-CSU shared-building assertions', () => {
  const rows = [sharedBuildingRow('owner', true), sharedBuildingRow('alias', false)]
  const mappings = coalesceAlsAliasedPremises(rows, '2026-08-19.0')
  expect(mappings.get('alias')).toBe('owner')
  expect(JSON.parse(rows[0]?.sources ?? '{}')).toMatchObject({
    hkgovAlsAliasedPremiseCoalescence: {
      id: 'sai-wan-estate-east-terrace-shared-building',
      suppressedAddress: { addressId: 'alias' },
    },
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
  try {
    coalesceAlsAliasedPremises([owner, alias], '2026-04-22.0')
    throw new Error('Expected a review error')
  } catch (error) {
    expect(error).toBeInstanceOf(AlsCurationReviewError)
    const review = error as AlsCurationReviewError
    expect(review.issue).toMatchObject({
      status: 'unresolved',
      sourceVersion: '2026-04-22.0',
      decisionId: 'grandeur-terrace-block-1',
      assertion: { actual: owner.geometry, expected: alias.geometry },
      records: [
        { role: 'owner', row: owner },
        { role: 'alias', row: alias },
      ],
    })
  }
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
      const raw = JSON.parse(requireDefined(alias.chiPremisesAddressJson))
      raw.ChiBlock.BlockNo = '2'
      alias.chiPremisesAddressJson = JSON.stringify(raw)
    },
  ]) {
    const decision = requireDefined(fixture.coalescences[0])
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
