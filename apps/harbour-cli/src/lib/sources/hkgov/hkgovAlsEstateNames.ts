import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-estate-names.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

/** Display/component preference applied after identity and 3D ownership resolution. */
export function applyAlsEstateNames(rows: PreparedHkgovAlsRow[], version: string) {
  for (const d of fixture.decisions) {
    if (version < d.sourceVersionFrom || version > d.sourceVersionTo) continue
    for (const row of rows) {
      const en = JSON.parse(row.engPremisesAddressJson ?? '{}')
      const zh = JSON.parse(row.chiPremisesAddressJson ?? '{}')
      if (en.EngEstate?.EstateName !== d.sourceEnName) continue
      assert.equal(
        zh.ChiEstate?.EstateName,
        d.sourceZhName,
        `Estate name ${d.id}: bilingual source changed`,
      )
      assert.equal(row.enEstateName, d.sourceEnName)
      assert.equal(row.zhHantEstateName, d.sourceZhName)
      assert(row.enFormattedAddress)
      assert(row.zhHantFormattedAddress)
      assert(row.enFormattedAddress.includes(d.sourceEnName))
      assert(row.zhHantFormattedAddress.includes(d.sourceZhName))
      row.enFormattedAddress = row.enFormattedAddress.replace(
        d.sourceEnName,
        d.preferredEnName,
      )
      row.zhHantFormattedAddress = row.zhHantFormattedAddress.replace(
        d.sourceZhName,
        d.preferredZhName,
      )
      row.enEstateName = d.preferredEnName
      row.zhHantEstateName = d.preferredZhName
      row.sources = JSON.stringify({ ...JSON.parse(row.sources), hkgovHaEstateName: d })
    }
  }
}
