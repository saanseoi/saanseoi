import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-localities.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

/** Derived locality and display only: raw components and resolved identities stay intact. */
export function applyAlsLocalities(rows: PreparedHkgovAlsRow[], version: string) {
  let backfilled = 0
  for (const d of fixture.decisions) {
    if (version < d.sourceVersionFrom || version > d.sourceVersionTo) continue
    for (const row of rows) {
      const b = d.buildings.find(b => b.csu === row.hkgovCsuId)
      if (!b) continue
      const en = JSON.parse(row.engPremisesAddressJson ?? '{}')
      const zh = JSON.parse(row.chiPremisesAddressJson ?? '{}')
      assert.equal(en.BuildingName, b.enName)
      assert.equal(zh.BuildingName, b.zhName)
      assert.equal(en.EngEstate?.EstateName, d.enEstate)
      assert.equal(zh.ChiEstate?.EstateName, d.zhEstate)
      assert.equal(en.EngStreet?.StreetName, d.enStreet)
      assert.equal(zh.ChiStreet?.StreetName, d.zhStreet)
      assert.equal(en.EngStreet?.BuildingNoFrom, d.number)
      assert.equal(zh.ChiStreet?.BuildingNoFrom, d.number)
      const isBackfill = version < d.evidenceSourceVersion
      assert.equal(en.EngStreet.LocationName ?? null, isBackfill ? null : d.enLocality)
      assert.equal(zh.ChiStreet.LocationName ?? null, isBackfill ? null : d.zhLocality)
      const enRoute = `${d.number} ${d.enStreet}`
      const zhRoute = `${d.number}${d.zhStreet}`
      assert(row.enFormattedAddress?.includes(enRoute))
      assert(row.zhHantFormattedAddress?.includes(zhRoute))
      row.enFormattedAddress = row.enFormattedAddress.replace(
        enRoute,
        `${enRoute}, ${d.enLocality}`,
      )
      row.zhHantFormattedAddress = row.zhHantFormattedAddress.replace(
        zhRoute,
        `${d.zhLocality}${zhRoute}`,
      )
      row.sources = JSON.stringify({
        ...JSON.parse(row.sources),
        hkgovAlsReviewedLocality: {
          ...d,
          targetSourceVersion: version,
          backfilled: isBackfill,
          originalLocality: {
            en: en.EngStreet.LocationName ?? null,
            'zh-hant': zh.ChiStreet.LocationName ?? null,
          },
          derivedLocality: { en: d.enLocality, 'zh-hant': d.zhLocality },
        },
      })
      if (isBackfill) backfilled++
    }
  }
  return { backfilled }
}
