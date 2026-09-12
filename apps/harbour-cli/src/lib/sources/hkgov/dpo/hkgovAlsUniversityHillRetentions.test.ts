import { expect, test } from 'bun:test'
import { readdir } from 'node:fs/promises'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-university-hill-retentions.json'
import {
  retainReviewedAlsPremises,
  applyReviewedAlsPremiseRetentions,
} from './hkgovAlsReviewedPremiseRetentions'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import type { HkgovAlsSourceFeature } from './hkgovAlsTypes'
const decisions = fixture.rules as unknown as NonNullable<
  Parameters<typeof retainReviewedAlsPremises>[2]
>
const maps = {
  areaByEn: new Map(),
  areaByZh: new Map(),
  ambiguousAreaEn: new Set<string>(),
  ambiguousAreaZh: new Set<string>(),
  countryId: null,
  districtByEn: new Map(),
  districtByZh: new Map(),
  ambiguousDistrictEn: new Set<string>(),
  ambiguousDistrictZh: new Set<string>(),
  snapshotId: 'test',
}

test('University Hill all30: omission-only replay, returning tower forms and shared CSUs remain distinct', async () => {
  let releases = 0,
    omittedReleases = 0
  for (const dir of (await readdir('data/hkgov/dpo/ALS'))
    .filter(d => d.endsWith('ALS-GeoJSON'))
    .sort()) {
    const version = `${dir.slice(0, 4)}-${dir.slice(4, 6)}-${dir.slice(6, 8)}.0`,
      sourceFile = 'als_addresses_(tai_po_district).geojson'
    const data = await Bun.file(`data/hkgov/dpo/ALS/${dir}/${sourceFile}`).json()
    const features: HkgovAlsSourceFeature[] = data.features.map(
      (feature: any, i: number) => ({
        feature,
        sourceFile,
        featureIndexOneBased: i + 1,
      }),
    )
    const before = JSON.stringify(features),
      publisherCount = features.length
    const applications = retainReviewedAlsPremises(features, version, decisions)
    expect(JSON.stringify(features.slice(0, publisherCount))).toBe(before)
    if (version < '2024-07-31.0') {
      expect(applications.size).toBe(0)
      releases++
      continue
    }
    expect(applications.size).toBe(10)
    const selected = features.filter(f =>
      applications.has(`${f.sourceFile}:${f.featureIndexOneBased}`),
    )
    const rows = selected.map(f =>
      normaliseHkgovAlsFeature(
        f.feature,
        f.sourceFile,
        f.featureIndexOneBased,
        'test',
        version,
        maps,
        true,
        new Map(),
        new Map(),
        new Map(),
      ),
    )
    const raw = rows.map(r => [
      r.engPremisesAddressJson,
      r.chiPremisesAddressJson,
      r.geometry,
      r.enFormattedAddress,
    ])
    applyReviewedAlsPremiseRetentions(rows, applications)
    expect(
      rows.map(r => [
        r.engPremisesAddressJson,
        r.chiPremisesAddressJson,
        r.geometry,
        r.enFormattedAddress,
      ]),
    ).toEqual(raw)
    expect(new Set(rows.map(r => r.id)).size).toBe(10)
    expect(rows.map(r => r.id).sort()).toEqual(
      fixture.rules.map(r => r.canonicalId).sort(),
    )
    if (features.length > publisherCount) {
      expect(features.length - publisherCount).toBe(10)
      omittedReleases++
    } else expect([...applications.values()].every(a => !a.retained)).toBeTrue()
    releases++
  }
  expect(releases).toBe(30)
  expect(omittedReleases).toBe(14)
})

test('revocation disables new replay and unknown publisher evidence requires review', () => {
  const r = fixture.rules[0]!,
    f = {
      sourceFile: r.sourceFile,
      featureIndexOneBased: 1,
      feature: structuredClone(r.evidence.feature),
    } as unknown as HkgovAlsSourceFeature
  f.feature.geometry!.coordinates = [114, 22]
  expect(() => retainReviewedAlsPremises([f], '2026-09-30.0', decisions)).toThrow(
    'source evidence changed',
  )
  const revoked = structuredClone(fixture.rules)
  revoked.forEach(r => {
    r.application.state = 'revoked'
  })
  expect(
    retainReviewedAlsPremises(
      [f],
      '2026-09-30.0',
      revoked as unknown as typeof decisions,
    ).size,
  ).toBe(0)
})
