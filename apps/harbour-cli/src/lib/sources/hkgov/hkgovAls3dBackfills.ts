import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-3d-backfills.json'
import { readAls3dFeatures, type Als3dFeature } from './hkgovAls3d'
import { publisherInventoryHash } from './hkgovAls3dCorrections'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

/** A dated source assertion used by explicit curation, never a fabricated current assertion. */
export async function* readAls3dWithBackfills(
  file: string,
  version: string,
  rows: PreparedHkgovAlsRow[],
) {
  const backfills = fixture.backfills.filter(b => b.sourceVersions.includes(version))
  const seen = new Map<string, Als3dFeature[]>()
  const estates = new Set(rows.map(row => row.enEstateName))
  for await (const record of readAls3dFeatures(file)) {
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
    const feature = structuredClone(backfill.feature) as Als3dFeature
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
    }
  }
}
