import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-csu-corrections.json'
import type { Als3dLocale } from './hkgovAls3d'

type Feature = {
  geometry?: { type: string; coordinates: number[] }
  properties?: {
    Address?: {
      PremisesAddress?: {
        GeoAddress?: string
        BuildingCsuInformation?: { CsuId?: string }
        EngPremisesAddress?: Als3dLocale
        ChiPremisesAddress?: Als3dLocale
      }
    }
  }
}
/** Resolve a reviewed identifier without modifying the publisher feature. */
export function resolveAlsCsuCorrection(feature: Feature, version: string) {
  const p = feature.properties?.Address?.PremisesAddress
  const rawCsu = p?.BuildingCsuInformation?.CsuId ?? null
  const decision = fixture.corrections.find(
    c =>
      c.from === rawCsu &&
      version >= c.sourceVersionFrom &&
      version <= c.sourceVersionTo,
  )
  if (!decision) return { csu: rawCsu, decision: null }
  const en = p?.EngPremisesAddress
  const zh = p?.ChiPremisesAddress
  assert.deepEqual(
    [
      en?.BuildingName,
      zh?.BuildingName,
      en?.EngEstate?.EstateName,
      zh?.ChiEstate?.EstateName,
      en?.EngStreet?.StreetName,
      zh?.ChiStreet?.StreetName,
      en?.EngStreet?.BuildingNoFrom,
      zh?.ChiStreet?.BuildingNoFrom,
      en?.EngBlock?.BlockNo,
      zh?.ChiBlock?.BlockNo,
      en?.EngBlock?.BlockDescriptor,
      zh?.ChiBlock?.BlockDescriptor,
      en?.EngDistrict,
      zh?.ChiDistrict,
    ],
    [
      decision.enBuildingName,
      decision.zhBuildingName,
      decision.enEstateName,
      decision.zhEstateName,
      decision.enStreetName,
      decision.zhStreetName,
      decision.streetNumber,
      decision.streetNumber,
      decision.blockNumber,
      decision.blockNumber,
      'BLK',
      '座',
      'KWAI TSING DISTRICT',
      '葵青區',
    ],
    `CSU correction ${decision.id}: publisher components changed`,
  )
  if (p?.GeoAddress !== undefined) assert.equal(p.GeoAddress, decision.geoAddress)
  assert.equal(feature.geometry?.type, 'Point')
  assert.deepEqual(feature.geometry?.coordinates, decision.coordinates)
  return { csu: decision.to, decision }
}
