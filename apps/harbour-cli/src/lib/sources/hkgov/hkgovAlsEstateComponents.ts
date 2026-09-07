import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-estate-components.json'
import {
  curationProvenance,
  resolveHkgovAlsCurationVerification,
  type HkgovAlsCurationApplication,
} from './hkgovAlsCurationLifecycle'
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
  const applications: Array<{
    fixture: 'hkgov-dpo-address-estate-components.json'
    id: string
    verification: 'unverified' | 'verified'
  }> = []
  for (const d of fixture.restorations) {
    const application = fixture.application as HkgovAlsCurationApplication
    const verification = resolveHkgovAlsCurationVerification(
      version,
      d.versions,
      application,
    )
    if (!verification) continue
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
      if (
        en.EngEstate?.EstateName === d.enEstate &&
        zh.ChiEstate?.EstateName === d.zhEstate
      ) {
        continue
      }
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
          curation: curationProvenance({
            application,
            id: d.id,
            sourceVersion: version,
            verification,
          }),
          originalEstate: { en: null, 'zh-hant': null },
        },
      })
      restored++
      applications.push({
        fixture: 'hkgov-dpo-address-estate-components.json',
        id: d.id,
        verification,
      })
    }
  }

  for (const d of fixture.streetRestorations ?? []) {
    const application = (d.application ??
      fixture.application) as HkgovAlsCurationApplication
    const verification = resolveHkgovAlsCurationVerification(
      version,
      d.versions,
      application,
    )
    if (!verification) continue
    for (const row of rows) {
      if (row.hkgovCsuId !== d.csu) continue
      const en = JSON.parse(row.engPremisesAddressJson ?? '{}')
      const zh = JSON.parse(row.chiPremisesAddressJson ?? '{}')
      if (en.BuildingName !== d.enBuilding || zh.BuildingName !== d.zhBuilding) continue

      const sourceStreetMatches =
        en.EngStreet?.StreetName === d.enStreet.StreetName &&
        en.EngStreet?.BuildingNoFrom === d.enStreet.BuildingNoFrom &&
        en.EngStreet?.BuildingNoTo === d.enStreet.BuildingNoTo &&
        zh.ChiStreet?.StreetName === d.zhStreet.StreetName &&
        zh.ChiStreet?.BuildingNoFrom === d.zhStreet.BuildingNoFrom &&
        zh.ChiStreet?.BuildingNoTo === d.zhStreet.BuildingNoTo
      if (sourceStreetMatches) continue

      assert(
        !en.EngStreet?.StreetName &&
          !en.EngStreet?.BuildingNoFrom &&
          !en.EngStreet?.BuildingNoTo &&
          !zh.ChiStreet?.StreetName &&
          !zh.ChiStreet?.BuildingNoFrom &&
          !zh.ChiStreet?.BuildingNoTo,
        'Reviewed street component omission changed; review required',
      )
      assert.equal(row.enStreetName, null)
      assert.equal(row.enStreetNumberFrom, null)
      assert.equal(row.enStreetNumberTo, null)
      assert.equal(row.zhHantStreetName, null)
      assert.equal(row.zhHantStreetNumberFrom, null)
      assert.equal(row.zhHantStreetNumberTo, null)

      row.enStreetName = d.enStreet.StreetName
      row.enStreetNumberFrom = d.enStreet.BuildingNoFrom
      row.enStreetNumberTo = d.enStreet.BuildingNoTo
      row.zhHantStreetName = d.zhStreet.StreetName
      row.zhHantStreetNumberFrom = d.zhStreet.BuildingNoFrom
      row.zhHantStreetNumberTo = d.zhStreet.BuildingNoTo
      row.enFormattedAddress = formatEnPremisesAddress({
        ...en,
        EngStreet: d.enStreet,
      })
      row.zhHantFormattedAddress = formatZhPremisesAddress({
        ...zh,
        ChiStreet: d.zhStreet,
      })
      row.sources = JSON.stringify({
        ...JSON.parse(row.sources),
        hkgovAlsStreetComponentRestoration: {
          ...d,
          curation: curationProvenance({
            application,
            id: d.id,
            sourceVersion: version,
            verification,
          }),
          originalStreet: { en: null, 'zh-hant': null },
        },
      })
      restored++
      applications.push({
        fixture: 'hkgov-dpo-address-estate-components.json',
        id: d.id,
        verification,
      })
    }
  }
  return { applications, restored }
}
