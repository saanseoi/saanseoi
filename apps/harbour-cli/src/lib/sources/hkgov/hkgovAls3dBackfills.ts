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
  const seen = new Set<string>()
  for await (const record of readAls3dFeatures(file)) {
    const csu =
      record.feature.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId
    if (csu) seen.add(csu)
    yield { ...record, backfill: undefined }
  }
  for (const backfill of backfills) {
    assert(
      !seen.has(backfill.csu),
      `Backfill ${backfill.id}: source is no longer absent`,
    )
    const parents = rows.filter(row => row.hkgovCsuId === backfill.csu)
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
