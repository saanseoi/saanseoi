import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  buildAls2dBackfillFeatures,
  labelAls2dBackfillRows,
} from './hkgovAls2dBackfills'
import { readAls3dWithBackfills } from './hkgovAls3dBackfills'
import { publisherInventoryHash } from './hkgovAls3dCorrections'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-3d-backfills.json'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const estate = 'HOI TAT ESTATE'
const wah = '3351321157T20180122'
const shing = '3365021124T20180122'
function sources(version: string) {
  return buildAls2dBackfillFeatures([], version).filter(
    s =>
      s.feature.properties?.Address?.PremisesAddress?.EngPremisesAddress?.EngEstate
        ?.EstateName === estate,
  )
}
function parents(version: string) {
  return sources(version).map(s => {
    const p = s.feature.properties!.Address!.PremisesAddress!
    return {
      enEstateName: estate,
      hkgovCsuId: p.BuildingCsuInformation!.CsuId,
      engPremisesAddressJson: JSON.stringify(p.EngPremisesAddress),
      chiPremisesAddressJson: JSON.stringify(p.ChiPremisesAddress),
      sourceFile: s.sourceFile,
      sourceVersion: version,
    } as PreparedHkgovAlsRow
  })
}

test('Hoi Tat keeps Hoi Wah active and bounds Hoi Shing to the three omissions at current coordinates', () => {
  expect(sources('2025-03-21.0')).toHaveLength(0)
  expect(sources('2025-04-26.0')).toHaveLength(1)
  for (const v of ['2026-04-03.0', '2026-04-22.0', '2026-04-29.0']) {
    const restored = sources(v)
    expect(restored).toHaveLength(2)
    expect(
      restored.find(
        s =>
          s.feature.properties!.Address!.PremisesAddress!.BuildingCsuInformation!
            .CsuId === shing,
      )!.feature.geometry!.coordinates,
    ).toEqual([114.15146, 22.32915])
  }
  expect(sources('2026-07-08.0')).toHaveLength(1)
  const future = parents('2026-09-07.0')
  labelAls2dBackfillRows(future)
  expect(
    JSON.parse(future[0]!.sources).hkgovAlsAddressBackfill.curation.verificationStatus,
  ).toBe('unverified')
  expect(() =>
    buildAls2dBackfillFeatures(sources('2026-09-07.0'), '2026-09-07.0'),
  ).toThrow('named source already present')
})

test('Hoi Tat materialises hash-exact bilingual inventories with provenance and fails closed on source conflicts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'als-hoi-tat-'))
  const file = join(dir, 'input.geojson')
  async function collect(version: string, rows = parents(version)) {
    const result = []
    for await (const r of readAls3dWithBackfills(file, version, rows)) result.push(r)
    return result
  }
  try {
    await writeFile(
      file,
      JSON.stringify({ type: 'FeatureCollection', features: [] }, null, 2),
    )
    const restored = await collect('2026-04-03.0')
    expect(restored).toHaveLength(2)
    for (const r of restored) {
      const p = r.feature.properties.Address.PremisesAddress
      const decision = fixture.backfills.find(
        b => b.csu === p.BuildingCsuInformation!.CsuId,
      )!
      expect(publisherInventoryHash(r.feature)).toBe(decision.expectedInventoryHash)
      const count = decision.csu === wah ? 780 : 1040
      expect(p.EngPremisesAddress!.Eng3dAddress).toHaveLength(count)
      expect(p.ChiPremisesAddress!.Chi3dAddress).toHaveLength(count)
      expect(r.backfill!.curation.verificationStatus).toBe('verified')
    }
    expect(
      (await collect('2026-09-07.0'))[0]!.backfill!.curation.verificationStatus,
    ).toBe('unverified')
    await expect(
      collect('2026-04-03.0', [
        ...parents('2026-04-03.0'),
        parents('2026-04-03.0')[0]!,
      ]),
    ).rejects.toThrow('ambiguous or missing parent')
    const changed = parents('2026-04-03.0')
    changed[0]!.engPremisesAddressJson = '{}'
    await expect(collect('2026-04-03.0', changed)).rejects.toThrow()
    await writeFile(
      file,
      JSON.stringify(
        { type: 'FeatureCollection', features: [restored[0]!.feature] },
        null,
        2,
      ),
    )
    await expect(collect('2026-04-03.0')).rejects.toThrow('source is no longer absent')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
