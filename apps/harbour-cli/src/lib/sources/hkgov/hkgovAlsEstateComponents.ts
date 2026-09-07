import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-estate-components.json'
import {
  formatEnPremisesAddress,
  formatZhPremisesAddress,
} from './hkgovAlsNormalisation'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

/** Restore reviewed derived estate fields after source identity and 3D ownership resolution. */
export function restoreAlsEstateComponents(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  let restored = 0
  for (const d of fixture.restorations) {
    if (!d.versions.includes(version)) continue
    for (const row of rows) {
      if (row.hkgovCsuId !== d.csu) continue
      const en = JSON.parse(row.engPremisesAddressJson ?? '{}')
      const zh = JSON.parse(row.chiPremisesAddressJson ?? '{}')
      assert.equal(en.BuildingName, d.enBuilding)
      assert.equal(zh.BuildingName, d.zhBuilding)
      assert.equal(en.EngStreet?.StreetName, d.enStreet)
      assert.equal(zh.ChiStreet?.StreetName, d.zhStreet)
      assert.equal(en.EngStreet?.BuildingNoFrom, d.streetNumber)
      assert.equal(zh.ChiStreet?.BuildingNoFrom, d.streetNumber)
      assert(!en.EngEstate && !zh.ChiEstate, 'Reviewed estate gap source changed')
      assert.equal(row.enEstateName, null)
      assert.equal(row.zhHantEstateName, null)
      row.enEstateName = d.enEstate
      row.zhHantEstateName = d.zhEstate
      row.enFormattedAddress = formatEnPremisesAddress({
        ...en,
        EngEstate: { EstateName: d.enEstate },
      })
      row.zhHantFormattedAddress = formatZhPremisesAddress({
        ...zh,
        ChiEstate: { EstateName: d.zhEstate },
      })
      row.sources = JSON.stringify({
        ...JSON.parse(row.sources),
        hkgovAlsEstateComponentRestoration: {
          ...d,
          targetSourceVersion: version,
          originalEstate: { en: null, 'zh-hant': null },
        },
      })
      restored++
    }
  }
  return { restored }
}
