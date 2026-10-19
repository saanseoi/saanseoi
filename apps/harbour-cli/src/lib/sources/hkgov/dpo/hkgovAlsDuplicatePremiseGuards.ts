import { coordinates, sourceEpochs } from './hkgovAlsReviewValidation'
import { strict as assert } from 'node:assert'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-duplicate-premise-guards.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'
import type { Als3dFeature } from './hkgovAls3d'

for (const rule of fixture.rules) {
  assert.equal(
    rule.code,
    'suppress-empty-premise-duplicate',
    'Unknown duplicate premise operation',
  )
  sourceEpochs(rule)
  for (const epoch of rule.epochs) coordinates(epoch.coordinates)
}
const active = (rule: (typeof fixture.rules)[number], version: string) =>
  version >= rule.sourceVersionFrom && version <= rule.sourceVersionTo

export function assertReviewedDuplicateEmptyInventories(
  feature: Als3dFeature,
  version: string,
) {
  const p = feature.properties.Address.PremisesAddress
  for (const rule of fixture.rules) {
    if (!active(rule, version) || p.BuildingCsuInformation?.CsuId !== rule.duplicateCsu)
      continue
    assert.equal(
      p.EngPremisesAddress?.Eng3dAddress?.length ?? 0,
      0,
      `${rule.id}: English inventory is no longer empty`,
    )
    assert.equal(
      p.ChiPremisesAddress?.Chi3dAddress?.length ?? 0,
      0,
      `${rule.id}: Chinese inventory is no longer empty`,
    )
  }
}

/** Only the reviewed duplicate is removed; other unnamed addresses remain independent. */
export function suppressReviewedDuplicatePremises(
  rows: PreparedHkgovAlsRow[],
  version: string,
) {
  let removed = 0
  for (const rule of fixture.rules) {
    if (!active(rule, version)) continue
    const estateRows = rows.filter(row => row.enEstateName === rule.premisesName)
    if (!estateRows.length) continue
    const owners = estateRows.filter(row =>
      Object.entries(rule.ownerGuard).every(
        ([key, value]) => row[key as keyof PreparedHkgovAlsRow] === value,
      ),
    )
    const aliases = estateRows.filter(row => row.hkgovCsuId === rule.duplicateCsu)
    assert.equal(owners.length, 1, `${rule.id}: named owner changed`)
    assert.equal(aliases.length, 1, `${rule.id}: unnamed alias changed`)
    const retained = owners[0]!,
      duplicate = aliases[0]!
    for (const [row, guard] of [
      [retained, rule.ownerExpected],
      [duplicate, rule.duplicateExpected],
      [retained, rule.sharedGuard],
      [duplicate, rule.sharedGuard],
    ] as const)
      for (const [key, value] of Object.entries(guard))
        assert.equal(
          row[key as keyof PreparedHkgovAlsRow],
          value,
          `${rule.id}: ${key} changed`,
        )
    const epoch = rule.epochs.filter(e => e.sourceVersionFrom <= version).at(-1)
    assert(epoch, `${rule.id}: missing reviewed source epoch`)
    for (const row of [retained, duplicate])
      assert.deepEqual(JSON.parse(row.geometry!), {
        type: 'Point',
        coordinates: epoch.coordinates,
      })
    retained.sources = JSON.stringify({
      ...JSON.parse(retained.sources),
      [rule.provenanceKey]: {
        authority: rule.authority,
        targetSourceVersion: version,
        evidenceSourceVersion: rule.evidenceSourceVersion,
        suppressedAddress: { ...duplicate },
      },
    })
    rows.splice(rows.indexOf(duplicate), 1)
    removed++
  }
  return removed
}
