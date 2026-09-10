import { requireDefined } from '@repo/core/requireDefined'
import { alsSourcePayload } from '@repo/core/pipeline/services/alsSourcePayload'
import { expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fixture from '../../../../../../../fixtures/meta/curations/hkgov-dpo-address-3d-backfills.json'
import { normaliseHkgovAlsFeature } from './hkgovAlsNormalisation'
import { prepareAls3dCollections } from './hkgovAls3dPreparation'
import { applyLongShinHierarchy } from './hkgovAlsLongShin'
import type { HkgovAlsFeature } from './hkgovAlsTypes'
import type { Als3dFeature } from './hkgovAls3d'

const evidence = requireDefined(
  fixture.backfills.find(b => b.id === 'long-shin-shin-leung-april-omission'),
)
const specs = [
  ['2272633682T20151209', 'SHIN LEUNG HOUSE', '善良樓', '11'],
  ['2271133599T20151209', 'SHIN OI HOUSE', '善愛樓', '11'],
  ['2262033581T20151210', 'SHIN YUNG HOUSE', '善勇樓', '12'],
]
function features(ranges = false): Als3dFeature[] {
  return specs.flatMap(([csu, en, zh, number]) => {
    const f = structuredClone(evidence.feature) as unknown as Als3dFeature
    const p = f.properties.Address.PremisesAddress
    if (
      !p.BuildingCsuInformation ||
      !p.EngPremisesAddress?.EngStreet ||
      !p.ChiPremisesAddress?.ChiStreet
    )
      throw new Error('Test fixture is missing the Long Shin premise components.')
    p.BuildingCsuInformation.CsuId = csu
    p.EngPremisesAddress.BuildingName = en
    p.ChiPremisesAddress.BuildingName = zh
    p.EngPremisesAddress.EngStreet.BuildingNoFrom = number
    p.ChiPremisesAddress.ChiStreet.BuildingNoFrom = number
    if (!ranges) return [f]
    const alias = structuredClone(f),
      a = alias.properties.Address.PremisesAddress
    if (!a.EngPremisesAddress?.EngStreet || !a.ChiPremisesAddress?.ChiStreet)
      throw new Error('Test fixture is missing the Long Shin range components.')
    Object.assign(a.EngPremisesAddress.EngStreet, {
      BuildingNoFrom: '11',
      BuildingNoTo: '12',
    })
    Object.assign(a.ChiPremisesAddress.ChiStreet, {
      BuildingNoFrom: '11',
      BuildingNoTo: '12',
    })
    return [f, alias]
  })
}
function rows(fs: Als3dFeature[], version: string) {
  return fs.map((f, i) => {
    f = structuredClone(f)
    const p = f.properties.Address.PremisesAddress
    if (p.EngPremisesAddress) delete p.EngPremisesAddress.Eng3dAddress
    if (p.ChiPremisesAddress) delete p.ChiPremisesAddress.Chi3dAddress
    return normaliseHkgovAlsFeature(
      f as unknown as HkgovAlsFeature,
      'test.geojson',
      i + 1,
      'test',
      version,
      {
        areaByEn: new Map(),
        areaByZh: new Map(),
        ambiguousAreaEn: new Set(),
        ambiguousAreaZh: new Set(),
        countryId: null,
        districtByEn: new Map(),
        districtByZh: new Map(),
        ambiguousDistrictEn: new Set(),
        ambiguousDistrictZh: new Set(),
        snapshotId: 'test',
      },
      true,
      new Map(),
      new Map(),
      new Map(),
    )
  })
}
test('Long Shin estate range does not duplicate house collections; every raw source is retained', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'als-long-shin-'))
  try {
    for (const version of [
      '2024-07-25.0',
      '2026-04-03.0',
      '2026-04-22.0',
      '2026-04-25.0',
    ]) {
      const fs = features(version.startsWith('2024'))
      const parents = rows(fs, version)
      const source = version.startsWith('2024') ? fs : fs.slice(1)
      await writeFile(
        join(dir, 'als_addresses_3d_test.geojson'),
        JSON.stringify({ type: 'FeatureCollection', features: source }, null, 2),
      )
      const output = join(dir, 'out')
      const result = await prepareAls3dCollections({
        sourceDir: dir,
        sourceVersion: version,
        outputFile: output,
        rows: parents,
      })
      expect(result.collectionCount).toBe(3)
      expect(result.unitCount).toBe(939)
      expect(result.sourceCount).toBe(source.length)
      expect(parents).toHaveLength(4)
      const complex = requireDefined(
        parents.find(r => r.curatedGranularity === 'complex'),
      )
      expect(complex.id).toMatch(/^ss-[0-9a-f-]{36}$/)
      expect(complex.canonicalId).toBe(complex.id)
      expect([
        complex.enStreetNumberFrom,
        complex.enStreetNumberTo,
        complex.enBuildingName,
      ]).toEqual(['11', '12', null])
      const records = (await Bun.file(`${output}.address3d.jsonl`).text())
        .trim()
        .split('\n')
        .map(s => JSON.parse(s))
      expect(
        records.filter(r => r.kind === 'source').map(r => r.rawProperties),
      ).toEqual(source.map(feature => alsSourcePayload(feature).rawProperties))
      for (const c of records.filter(r => r.kind === 'collection')) {
        expect(c.address2dId).not.toBe(complex.id)
        expect(c.unresolvedSectionIds).toEqual([])
        expect(parents.find(r => r.id === c.address2dId)?.parentAddressId).toBe(
          complex.id,
        )
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
test('Long Shin rejects changed range labels and does not extrapolate beyond reviewed releases', () => {
  const changed = rows(features(true), '2024-07-25.0')
  requireDefined(changed[1]).enStreetNumberTo = '13'
  expect(() => applyLongShinHierarchy(changed, '2024-07-25.0')).toThrow()
  expect(
    applyLongShinHierarchy(rows(features(), '2026-09-01.0'), '2026-09-01.0').size,
  ).toBe(0)
})
