import { expect, test } from 'bun:test'
import { resolveAlsAddressAliases, suppressAlsAddressAliases } from './hkgovAlsAliases'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

function rows() {
  return [null, '6'].map(
    (block, index) =>
      ({
        id: `source-${index}`,
        canonicalId: `source-${index}`,
        hkgovCsuId: '3252139344T20050430',
        enEstateName: 'CHEUNG WAH ESTATE',
        enBuildingName: block ? 'CHEUNG LAI HSE (BLK 6)' : 'CHEUNG LAI HSE',
        zhHantBuildingName: block ? '祥禮樓(6座)' : '祥禮樓',
        enBlockNumber: block,
        zhHantBlockNumber: block,
        geometry: 'same-point',
        sources: '{"hkgovAls":{"sourceFile":"publisher.geojson"}}',
        engPremisesAddressJson: JSON.stringify({
          BuildingName: 'CHEUNG LAI HSE',
          ...(block ? { EngBlock: { BlockNo: block, BlockDescriptor: 'BLK' } } : {}),
        }),
        chiPremisesAddressJson: JSON.stringify({
          BuildingName: '祥禮樓',
          ...(block ? { ChiBlock: { BlockNo: block, BlockDescriptor: '座' } } : {}),
        }),
      }) as PreparedHkgovAlsRow,
  )
}

test('suppresses only the reviewed duplicate and preserves raw alias evidence on its owner', () => {
  const input = rows()
  const aliases = resolveAlsAddressAliases(input, '2024-07-25.0')
  expect(input).toHaveLength(2)
  expect(aliases.get('source-1')?.owner.id).toBe('source-0')
  suppressAlsAddressAliases(input, aliases)
  expect(input).toHaveLength(1)
  expect(input[0]?.id).toBe('source-0')
  expect(input[0]?.enBlockNumber).toBeNull()
  expect(JSON.parse(input[0]?.sources ?? '{}').hkgovAls.sourceFile).toBe(
    'publisher.geojson',
  )
  expect(
    JSON.parse(input[0]?.sources ?? '{}').hkgovAlsAddressAliases[0].sourceEvidence
      .engPremisesAddress.EngBlock.BlockNo,
  ).toBe('6')
})

test('rejects missing, changed or ambiguous aliases and preserves out-of-bounds rows', () => {
  expect(() => resolveAlsAddressAliases(rows().slice(0, 1), '2024-07-25.0')).toThrow(
    'review required',
  )
  const changed = rows()
  if (!changed[1]) throw new Error('Missing fixture')
  changed[1].geometry = 'another-point'
  expect(() => resolveAlsAddressAliases(changed, '2024-07-25.0')).toThrow(
    'review required',
  )
  const street = rows()
  if (!street[1]) throw new Error('Missing fixture')
  street[1].engPremisesAddressJson = JSON.stringify({
    BuildingName: 'CHEUNG LAI HSE',
    EngBlock: { BlockNo: '6' },
    EngStreet: { BuildingNoFrom: '40' },
  })
  expect(() => resolveAlsAddressAliases(street, '2024-07-25.0')).toThrow(
    'review required',
  )
  expect(resolveAlsAddressAliases(rows(), '2026-09-01.0').size).toBe(0)
})

test('accepts the exact embedded block-name variant but not arbitrary changed building names', () => {
  const input = rows()
  const duplicate = input[1]
  if (!duplicate) throw new Error('Missing fixture')
  duplicate.engPremisesAddressJson = JSON.stringify({
    BuildingName: 'CHEUNG LAI HSE (BLK 6)',
    EngBlock: { BlockNo: '6', BlockDescriptor: 'BLK' },
  })
  duplicate.chiPremisesAddressJson = JSON.stringify({
    BuildingName: '祥禮樓(6座)',
    ChiBlock: { BlockNo: '6', BlockDescriptor: '座' },
  })
  expect(resolveAlsAddressAliases(input, '2026-08-19.0').size).toBe(1)
  duplicate.engPremisesAddressJson = JSON.stringify({
    BuildingName: 'ANOTHER BUILDING',
    EngBlock: { BlockNo: '6' },
  })
  expect(() => resolveAlsAddressAliases(input, '2026-08-19.0')).toThrow(
    'review required',
  )
})
