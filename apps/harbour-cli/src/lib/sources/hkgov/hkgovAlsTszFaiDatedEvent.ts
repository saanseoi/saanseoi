import { strict as assert } from 'node:assert'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-tsz-fai-dated-event.json'
import type { Als3dFeature } from './hkgovAls3d'

/** The accepted merger and new flat are dated changes, never omission backfills. */
export function assertTszFaiDatedEvent(feature: Als3dFeature, version: string) {
  const p = feature.properties.Address.PremisesAddress
  if (p.BuildingCsuInformation?.CsuId !== fixture.csu) return
  const evidence = fixture.assertions.find(a => a.version === version)
  if (!evidence) return
  const en = p.EngPremisesAddress,
    zh = p.ChiPremisesAddress
  assert.equal(
    en?.BuildingName,
    fixture.enBuildingName,
    'Tsz Fai dated event: English identity changed',
  )
  assert.equal(
    zh?.BuildingName,
    fixture.zhBuildingName,
    'Tsz Fai dated event: Chinese identity changed',
  )
  assert.equal(
    en?.EngEstate?.EstateName,
    fixture.estate,
    'Tsz Fai dated event: estate changed',
  )
  const labels = new Set(['418', '418A', '418B', '418C', '419'])
  assert.deepEqual(
    en?.Eng3dAddress?.filter(u => labels.has(String(u.EngUnit?.UnitNo ?? ''))),
    evidence.en,
    'Tsz Fai dated event: merger or new-flat date changed',
  )
  assert.deepEqual(
    zh?.Chi3dAddress?.filter(u => labels.has(String(u.ChiUnit?.UnitNo ?? ''))),
    evidence.zh,
    'Tsz Fai dated event: merger or new-flat date changed',
  )
}
