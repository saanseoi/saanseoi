import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-3d-corrections.json'
import { als3dHash, type Als3dFeature } from './hkgovAls3d'

export function publisherInventoryHash(feature: Als3dFeature) {
  const p = feature.properties.Address.PremisesAddress
  return als3dHash([
    (p.EngPremisesAddress?.Eng3dAddress ?? []).map(row => JSON.stringify(row)).sort(),
    (p.ChiPremisesAddress?.Chi3dAddress ?? []).map(row => JSON.stringify(row)).sort(),
  ])
}

/** Correct a copy; the publisher feature remains the original source evidence. */
export function applyAls3dCorrections(feature: Als3dFeature, sourceVersion: string) {
  const p = feature.properties.Address.PremisesAddress
  const corrections = fixture.corrections.filter(
    c =>
      c.csu === p.BuildingCsuInformation?.CsuId &&
      c.sourceVersions.includes(sourceVersion),
  )
  if (!corrections.length) return { feature, corrections }
  const corrected = structuredClone(feature)
  for (const correction of corrections) {
    const en = corrected.properties.Address.PremisesAddress.EngPremisesAddress
    const zh = corrected.properties.Address.PremisesAddress.ChiPremisesAddress
    if (
      !en ||
      !zh ||
      en.EngEstate?.EstateName !== correction.estate ||
      en.BuildingName !== correction.expectedEnBuildingName ||
      zh.BuildingName !== correction.expectedZhBuildingName ||
      en.Eng3dAddress?.length !== correction.expectedUnitCount ||
      zh.Chi3dAddress?.length !== correction.expectedUnitCount ||
      publisherInventoryHash(corrected) !== correction.expectedInventoryHash
    ) {
      throw new Error(
        `ALS 3D correction ${correction.id}: source changed; review required`,
      )
    }
    for (const { floor, unit } of correction.additions) {
      en.Eng3dAddress.push({
        EngUnit: { UnitDescriptor: 'FLAT', UnitNo: unit },
        EngFloor: { FloorNum: floor, FloorDescription: `${floor}/F` },
      })
      zh.Chi3dAddress.push({
        ChiFloor: { FloorNum: floor, FloorDescription: `${floor}樓` },
        ChiUnit: { UnitNo: unit, UnitDescriptor: '室' },
      })
    }
    if (publisherInventoryHash(corrected) !== correction.correctedInventoryHash)
      throw new Error(
        `ALS 3D correction ${correction.id}: corrected inventory does not match evidence`,
      )
  }
  return { feature: corrected, corrections }
}
