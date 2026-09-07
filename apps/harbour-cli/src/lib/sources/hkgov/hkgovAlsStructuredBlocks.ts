import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

/** Publisher estate and bilingual address components must identify one existing parent. */
export function linkAlsStructuredBlocks(rows: PreparedHkgovAlsRow[]) {
  const key = (row: PreparedHkgovAlsRow) =>
    JSON.stringify([
      row.enEstateName,
      row.zhHantEstateName,
      row.enRegion,
      row.zhHantRegion,
      row.enDistrict,
      row.zhHantDistrict,
      row.enStreetName,
      row.zhHantStreetName,
      row.enStreetNumberFrom,
      row.zhHantStreetNumberFrom,
      row.enStreetNumberTo,
      row.zhHantStreetNumberTo,
      row.enVillageName,
      row.zhHantVillageName,
      row.enVillageNumberFrom,
      row.zhHantVillageNumberFrom,
      row.enVillageNumberTo,
      row.zhHantVillageNumberTo,
      row.enPhaseName,
      row.zhHantPhaseName,
      row.enPhaseRef,
      row.zhHantPhaseRef,
    ])
  const parents = new Map<string, PreparedHkgovAlsRow[]>()
  for (const row of rows) {
    if (
      !row.enEstateName ||
      !row.zhHantEstateName ||
      row.enBuildingName ||
      row.zhHantBuildingName ||
      row.enBlockNumber ||
      row.zhHantBlockNumber ||
      row.enBlockDescriptor ||
      row.zhHantBlockDescriptor ||
      row.parentAddressId
    )
      continue
    parents.set(key(row), [...(parents.get(key(row)) ?? []), row])
  }
  for (const row of rows) {
    if (
      row.parentAddressId ||
      row.enBuildingName ||
      row.zhHantBuildingName ||
      !row.enBlockNumber ||
      row.enBlockNumber !== row.zhHantBlockNumber ||
      !['TOWER', 'BLOCK', 'BLK'].includes(row.enBlockDescriptor ?? '') ||
      row.zhHantBlockDescriptor !== '座'
    )
      continue
    const candidates = parents.get(key(row)) ?? []
    if (candidates.length !== 1) continue
    row.parentAddressId = candidates[0]!.id
  }
}
