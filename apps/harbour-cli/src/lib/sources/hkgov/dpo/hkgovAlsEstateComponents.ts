import { permitsAlsReviewIssue } from './hkgovAlsReviewPolicy'
import { strict as assert } from 'node:assert'
import { reportAlsReviewIssue } from './hkgovAlsReviewIssue'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-estate-components.json'
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
      assert(row.enEstateName === null || row.enEstateName === d.enEstate)
      assert(row.zhHantEstateName === null || row.zhHantEstateName === d.zhEstate)
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
        (en.EngStreet?.BuildingNoTo ?? null) === (d.enStreet.BuildingNoTo ?? null) &&
        zh.ChiStreet?.StreetName === d.zhStreet.StreetName &&
        zh.ChiStreet?.BuildingNoFrom === d.zhStreet.BuildingNoFrom &&
        (zh.ChiStreet?.BuildingNoTo ?? null) === (d.zhStreet.BuildingNoTo ?? null)
      if (sourceStreetMatches) continue

      const conflicts = [
        [en.EngStreet?.StreetName, d.enStreet.StreetName],
        [en.EngStreet?.BuildingNoFrom, d.enStreet.BuildingNoFrom],
        [en.EngStreet?.BuildingNoTo, d.enStreet.BuildingNoTo],
        [zh.ChiStreet?.StreetName, d.zhStreet.StreetName],
        [zh.ChiStreet?.BuildingNoFrom, d.zhStreet.BuildingNoFrom],
        [zh.ChiStreet?.BuildingNoTo, d.zhStreet.BuildingNoTo],
        [row.enStreetName, d.enStreet.StreetName],
        [row.enStreetNumberFrom, d.enStreet.BuildingNoFrom],
        [row.enStreetNumberTo, d.enStreet.BuildingNoTo],
        [row.zhHantStreetName, d.zhStreet.StreetName],
        [row.zhHantStreetNumberFrom, d.zhStreet.BuildingNoFrom],
        [row.zhHantStreetNumberTo, d.zhStreet.BuildingNoTo],
      ].filter(
        ([actual, expected]) => actual != null && actual !== '' && actual !== expected,
      )
      if (
        conflicts.length &&
        permitsAlsReviewIssue('street-component-conflict', version)
      ) {
        reportAlsReviewIssue({
          code: 'street-component-conflict',
          sourceVersion: version,
          decisionId: d.id,
          curationFile: 'hkgov-dpo-address-estate-components.json',
          decision: d,
          record: structuredClone(row),
          conflicts: conflicts.map(([actual, expected]) => ({ actual, expected })),
        })
        continue
      }
      assert(
        !conflicts.length,
        `Reviewed street component omission changed; review required: ${d.id}`,
      )

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
          originalStreet: { en: en.EngStreet ?? null, 'zh-hant': zh.ChiStreet ?? null },
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
