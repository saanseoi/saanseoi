import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-lin-tsui.json'
import { als3dHash, type Als3dFeature } from './hkgovAls3d'
import type { HkgovAlsFeature, PreparedHkgovAlsRow } from './hkgovAlsTypes'

/** Guard each reviewed assertion; CSU alone does not establish equivalence. */
export function resolveLinTsui(
  feature: HkgovAlsFeature | Als3dFeature,
  version: string,
) {
  const p = feature.properties?.Address?.PremisesAddress
  const csu = p?.BuildingCsuInformation?.CsuId
  if (![fixture.from, fixture.to].includes(csu ?? '')) return null
  assert(
    version >= fixture.sourceVersionFrom && version <= fixture.sourceVersionTo,
    'Lin Tsui: unreviewed release requires review',
  )
  const en = p?.EngPremisesAddress
  const zh = p?.ChiPremisesAddress
  const named = en?.BuildingName === 'LIN TSUI HOUSE'
  const earlier = version < fixture.transitionVersion
  for (const [address, language] of [
    [en, 'Eng'],
    [zh, 'Chi'],
  ] as const) {
    const keys = Object.keys(address ?? {})
      .filter(key => key !== `${language}3dAddress`)
      .sort()
    assert.deepEqual(
      keys,
      [
        'Region',
        `${language}District`,
        `${language}Street`,
        ...(named || earlier ? [`${language}Estate`] : []),
        ...(named ? ['BuildingName'] : []),
      ].sort(),
      'Lin Tsui: publisher address structure changed',
    )
    assert.equal(
      (address as { Region?: string })?.Region,
      language === 'Eng' ? 'HK' : '香港',
    )
  }
  assert.equal(en?.BuildingName ?? null, named ? 'LIN TSUI HOUSE' : null)
  assert.equal(zh?.BuildingName ?? null, named ? '連翠樓' : null)
  assert.equal(
    csu,
    named ? (earlier ? fixture.from : fixture.to) : earlier ? fixture.to : fixture.from,
  )
  assert.deepEqual(
    [en?.EngDistrict, zh?.ChiDistrict, en?.EngStreet, zh?.ChiStreet],
    [
      'EASTERN DISTRICT',
      '東區',
      { BuildingNoFrom: '36', StreetName: 'LIN SHING ROAD' },
      { StreetName: '連城道', BuildingNoFrom: '36' },
    ],
  )
  assert.equal(
    en?.EngEstate?.EstateName ?? null,
    named || earlier ? 'LIN TSUI ESTATE' : null,
  )
  assert.equal(zh?.ChiEstate?.EstateName ?? null, named || earlier ? '連翠邨' : null)
  assert.equal(en?.EngBlock ?? null, null)
  assert.equal(zh?.ChiBlock ?? null, null)
  assert.equal(
    (p as { GeoAddress?: string }).GeoAddress,
    named || earlier ? fixture.to : fixture.from,
  )
  assert.deepEqual(feature.geometry, {
    type: 'Point',
    coordinates: earlier
      ? fixture.previousCoordinates
      : named
        ? fixture.coordinates
        : fixture.residualCoordinates,
  })
  const enUnits = (en as { Eng3dAddress?: unknown[] })?.Eng3dAddress
  const zhUnits = (zh as { Chi3dAddress?: unknown[] })?.Chi3dAddress
  if (enUnits?.length || zhUnits?.length) {
    assert(named, 'Lin Tsui: unnamed inventory is no longer empty')
    assert.equal(enUnits?.length, fixture.unitCount)
    assert.equal(zhUnits?.length, fixture.unitCount)
    assert.equal(als3dHash([enUnits, zhUnits]), fixture.inventoryHash)
  }
  return { ...fixture, named }
}

export function suppressLinTsuiVariants(rows: PreparedHkgovAlsRow[]) {
  const candidates = rows.filter(row => JSON.parse(row.sources).hkgovAlsLinTsui)
  if (!candidates.length) return 0
  const owners = candidates.filter(row => row.enBuildingName === 'LIN TSUI HOUSE')
  assert.equal(owners.length, 1, 'Lin Tsui: exactly one named owner required')
  const owner = owners[0]!
  const duplicates = candidates.filter(row => row !== owner)
  assert.equal(
    duplicates.length,
    1,
    'Lin Tsui: reviewed alternate assertion missing or duplicated',
  )
  owner.sources = JSON.stringify({
    ...JSON.parse(owner.sources),
    hkgovAlsLinTsuiSuppressed: duplicates,
  })
  for (const row of duplicates) rows.splice(rows.indexOf(row), 1)
  return duplicates.length
}
