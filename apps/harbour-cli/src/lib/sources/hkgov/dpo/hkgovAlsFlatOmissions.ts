import type { Als3dFeature } from './hkgovAls3d'

/** Only exact bilingual additions qualify; replacements and mergers remain dated. */
export function alsFlatOmissionAdditions(before: Als3dFeature, after: Als3dFeature) {
  const a = before.properties.Address.PremisesAddress
  const b = after.properties.Address.PremisesAddress
  if (
    !a.BuildingCsuInformation?.CsuId ||
    a.BuildingCsuInformation.CsuId !== b.BuildingCsuInformation?.CsuId ||
    !a.EngPremisesAddress?.EngEstate?.EstateName ||
    a.EngPremisesAddress.EngEstate.EstateName !==
      b.EngPremisesAddress?.EngEstate?.EstateName ||
    (!a.EngPremisesAddress.BuildingName && !a.EngPremisesAddress.EngBlock?.BlockNo) ||
    a.EngPremisesAddress.BuildingName !== b.EngPremisesAddress?.BuildingName ||
    a.ChiPremisesAddress?.BuildingName !== b.ChiPremisesAddress?.BuildingName
  )
    return null
  if (
    a.ChiPremisesAddress?.ChiEstate?.EstateName !==
    b.ChiPremisesAddress?.ChiEstate?.EstateName
  )
    return null
  if (!a.EngPremisesAddress.BuildingName) {
    const en = a.EngPremisesAddress.EngBlock
    const zh = a.ChiPremisesAddress?.ChiBlock
    if (
      !en ||
      !zh ||
      en.BlockNo !== zh.BlockNo ||
      !['BLK', 'BLOCK', 'TOWER'].includes(en.BlockDescriptor ?? '') ||
      zh.BlockDescriptor !== '座' ||
      JSON.stringify(en) !== JSON.stringify(b.EngPremisesAddress?.EngBlock) ||
      JSON.stringify(zh) !== JSON.stringify(b.ChiPremisesAddress?.ChiBlock)
    )
      return null
  }
  function addedRows(oldRows: unknown[] | undefined, newRows: unknown[] | undefined) {
    if (!oldRows?.length || !newRows || newRows.length <= oldRows.length) return null
    const old = new Set(oldRows.map(row => JSON.stringify(row)))
    const next = new Set(newRows.map(row => JSON.stringify(row)))
    if (
      old.size !== oldRows.length ||
      next.size !== newRows.length ||
      [...old].some(row => !next.has(row))
    )
      return null
    return newRows.filter(row => !old.has(JSON.stringify(row)))
  }
  const en = addedRows(
    a.EngPremisesAddress.Eng3dAddress,
    b.EngPremisesAddress?.Eng3dAddress,
  )
  const zh = addedRows(
    a.ChiPremisesAddress?.Chi3dAddress,
    b.ChiPremisesAddress?.Chi3dAddress,
  )
  if (!en || !zh || en.length !== zh.length) return null
  const additions: { floor: number; unit: string }[] = []
  for (const value of en) {
    const row = value as {
      EngFloor?: { FloorNum?: number }
      EngUnit?: { UnitNo?: string }
    }
    const floor = row.EngFloor?.FloorNum
    const unit = row.EngUnit?.UnitNo
    if (typeof floor !== 'number' || !unit) return null
    const enTemplate = {
      EngUnit: { UnitDescriptor: 'FLAT', UnitNo: unit },
      EngFloor: { FloorNum: floor, FloorDescription: `${floor}/F` },
    }
    const zhTemplate = {
      ChiFloor: { FloorNum: floor, FloorDescription: `${floor}樓` },
      ChiUnit: { UnitNo: unit, UnitDescriptor: '室' },
    }
    if (
      JSON.stringify(value) !== JSON.stringify(enTemplate) ||
      !zh.some(value => JSON.stringify(value) === JSON.stringify(zhTemplate))
    )
      return null
    additions.push({ floor, unit })
  }
  return additions
}
