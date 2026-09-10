import { requireDefined } from '@repo/core/requireDefined'
import { strict as assert } from 'node:assert'
import { buildDeterministicUuidV5 } from '@repo/db'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-named-premise-retentions.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const NAMESPACE = '6e7c2e9f-dd17-5d55-ae29-0e6f18e1662b'
const canonical = (value: unknown): string =>
  value && typeof value === 'object'
    ? Array.isArray(value)
      ? `[${value.map(canonical).join(',')}]`
      : `{${Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
          .join(',')}}`
    : (JSON.stringify(value) ?? 'null')

/** Retain only a reviewed named premise; never infer equivalence from CSU alone. */
export function retainNamedPremises(rows: PreparedHkgovAlsRow[], version: string) {
  let suppressed = 0
  for (const d of fixture.retentions) {
    if (version < d.sourceVersionFrom || version > d.sourceVersionTo) continue
    const named = rows.filter(row => row.hkgovCsuId === d.namedCsu)
    assert.equal(
      named.length,
      1,
      `Named premise ${d.id}: source changed; review required`,
    )
    const owner = requireDefined(named[0])
    const en = JSON.parse(owner.engPremisesAddressJson ?? 'null')
    const zh = JSON.parse(owner.chiPremisesAddressJson ?? 'null')
    const representation = d.namedRepresentations.find(
      candidate =>
        canonical(candidate.en) === canonical(en) &&
        canonical(candidate.zh) === canonical(zh) &&
        canonical(candidate.coordinates) ===
          canonical(JSON.parse(owner.geometry ?? 'null')?.coordinates),
    )
    assert(representation, `Named premise ${d.id}: components changed; review required`)
    const duplicates = rows.filter(row => row.hkgovCsuId === d.duplicateCsu)
    const expectsDuplicate = version >= d.duplicateFrom
    assert.equal(
      duplicates.length,
      expectsDuplicate ? 1 : 0,
      `Named premise ${d.id}: duplicate occurrence changed; review required`,
    )
    const duplicate = duplicates[0]
    let duplicateEn: unknown = null
    let duplicateZh: unknown = null
    if (duplicate) {
      duplicateEn = JSON.parse(duplicate.engPremisesAddressJson ?? 'null')
      duplicateZh = JSON.parse(duplicate.chiPremisesAddressJson ?? 'null')
      assert.equal(canonical(duplicateEn), canonical(d.duplicate.en))
      assert.equal(canonical(duplicateZh), canonical(d.duplicate.zh))
      assert.equal(duplicate.geoAddress, d.duplicate.geoAddress)
      assert(
        d.duplicate.coordinates.some(
          point =>
            canonical(point) ===
            canonical(JSON.parse(duplicate.geometry ?? 'null')?.coordinates),
        ),
        `Named premise ${d.id}: duplicate point changed; review required`,
      )
    }
    const originalId = owner.id
    const id = `ss-${buildDeterministicUuidV5(NAMESPACE, d.id)}`
    owner.identityAlias = originalId
    owner.id = owner.canonicalId = owner.identityBuildingId = id
    owner.identityKey = owner.identityContinuityKey = `reviewed-named-premise:${d.id}`
    owner.identityMatchMethod = 'reviewed-named-premise-retention'
    owner.curatedGranularity = 'building'
    owner.sources = JSON.stringify({
      ...JSON.parse(owner.sources ?? '{}'),
      hkgovAlsNamedPremiseRetention: {
        ...d,
        sourceVersion: version,
        suppressedAddress: duplicate && {
          addressId: duplicate.id,
          canonicalId: duplicate.canonicalId,
          sources: JSON.parse(duplicate.sources ?? '{}'),
          engPremisesAddress: duplicateEn,
          chiPremisesAddress: duplicateZh,
        },
      },
    })
    if (duplicate) {
      rows.splice(rows.indexOf(duplicate), 1)
      suppressed++
    }
  }
  return { suppressed }
}
