import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-3d-backfills.json'
import type { Als3dFeature } from './hkgovAls3d'
import { readAls3dWithHouseRetentions } from './hkgovAlsHouseRetentions'
import { publisherInventoryHash } from './hkgovAls3dCorrections'
import {
  curationProvenance,
  resolveHkgovAlsCurationVerification,
  type HkgovAlsCurationApplication,
} from './hkgovAlsCurationLifecycle'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

type InventoryTemplate = {
  floors: { from: number; to: number }
  units: { from: number; to: number }
}

type Backfill = (typeof fixture.backfills)[number] & {
  application?: HkgovAlsCurationApplication
  inventoryTemplate?: InventoryTemplate
}

function backfillsForVersion(version: string) {
  return (fixture.backfills as Backfill[]).flatMap(decision => {
    const verification = resolveHkgovAlsCurationVerification(
      version,
      decision.sourceVersions,
      decision.application,
    )
    return verification
      ? [
          {
            ...decision,
            curation: curationProvenance({
              application: decision.application,
              id: decision.id,
              sourceVersion: version,
              verification,
            }),
          },
        ]
      : []
  })
}

function materialiseBackfillFeature(backfill: Backfill): Als3dFeature {
  const feature = structuredClone(backfill.feature) as Als3dFeature
  const template = backfill.inventoryTemplate
  if (!template) return feature
  const units = Array.from(
    {
      length:
        (template.floors.to - template.floors.from + 1) *
        (template.units.to - template.units.from + 1),
    },
    (_, index) => {
      const floor =
        template.floors.from +
        Math.floor(index / (template.units.to - template.units.from + 1))
      const unit = String(
        floor * 100 +
          template.units.from +
          (index % (template.units.to - template.units.from + 1)),
      )
      return { floor, unit }
    },
  )
  const premises = feature.properties.Address.PremisesAddress
  assert(premises.EngPremisesAddress && premises.ChiPremisesAddress)
  premises.EngPremisesAddress.Eng3dAddress = units.map(({ floor, unit }) => ({
    EngUnit: { UnitDescriptor: 'FLAT', UnitNo: unit },
    EngFloor: { FloorNum: floor, FloorDescription: `${floor}/F` },
  }))
  premises.ChiPremisesAddress.Chi3dAddress = units.map(({ floor, unit }) => ({
    ChiFloor: { FloorNum: floor, FloorDescription: `${floor}樓` },
    ChiUnit: { UnitNo: unit, UnitDescriptor: '室' },
  }))
  return feature
}

/** A dated source assertion used by explicit curation, never a fabricated current assertion. */
export async function* readAls3dWithBackfills(
  file: string,
  version: string,
  rows: PreparedHkgovAlsRow[],
) {
  const backfills = backfillsForVersion(version)
  const seen = new Map<string, Als3dFeature[]>()
  const estates = new Set(rows.map(row => row.enEstateName))
  for await (const record of readAls3dWithHouseRetentions(file, version, rows)) {
    const csu =
      record.feature.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId
    if (csu) seen.set(csu, [...(seen.get(csu) ?? []), record.feature])
    estates.add(
      record.feature.properties.Address.PremisesAddress.EngPremisesAddress?.EngEstate
        ?.EstateName ?? null,
    )
    yield { ...record, backfill: undefined }
  }
  for (const backfill of backfills) {
    // District/estate-scoped preparations do not reconstruct unrelated estates.
    if (!estates.has(backfill.estate)) continue
    assert(
      !seen.has(backfill.csu) ||
        ('allowReviewedEmptyPremise' in backfill &&
          backfill.allowReviewedEmptyPremise &&
          seen.get(backfill.csu)!.every(feature => {
            const p = feature.properties.Address.PremisesAddress
            return (
              !p.EngPremisesAddress?.BuildingName &&
              !p.ChiPremisesAddress?.BuildingName &&
              !p.EngPremisesAddress?.Eng3dAddress?.length &&
              !p.ChiPremisesAddress?.Chi3dAddress?.length &&
              p.EngPremisesAddress?.EngEstate?.EstateName === backfill.estate &&
              p.ChiPremisesAddress?.ChiEstate?.EstateName === '菁田邨'
            )
          })),
      `Backfill ${backfill.id}: source is no longer absent`,
    )
    const parents = rows.filter(
      row =>
        row.hkgovCsuId === backfill.csu &&
        (JSON.parse(row.engPremisesAddressJson ?? '{}').BuildingName ||
          JSON.parse(row.chiPremisesAddressJson ?? '{}').BuildingName),
    )
    assert.equal(
      parents.length,
      1,
      `Backfill ${backfill.id}: ambiguous or missing parent`,
    )
    const parent = parents[0]!
    const feature = materialiseBackfillFeature(backfill)
    const p = feature.properties.Address.PremisesAddress
    const en = { ...p.EngPremisesAddress },
      zh = { ...p.ChiPremisesAddress }
    delete en.Eng3dAddress
    delete zh.Chi3dAddress
    assert.deepEqual(JSON.parse(parent.engPremisesAddressJson ?? '{}'), en)
    assert.deepEqual(JSON.parse(parent.chiPremisesAddressJson ?? '{}'), zh)
    assert.equal(publisherInventoryHash(feature), backfill.expectedInventoryHash)
    assert.equal(p.EngPremisesAddress?.Eng3dAddress?.length, backfill.expectedUnitCount)
    assert.equal(p.ChiPremisesAddress?.Chi3dAddress?.length, backfill.expectedUnitCount)
    const { feature: _evidence, ...provenance } = backfill
    yield {
      feature,
      featureIndexOneBased: backfill.featureIndexOneBased,
      backfill: provenance,
      houseRetention: undefined,
    }
  }
}
