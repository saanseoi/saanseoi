import { alsSourcePayload } from '@repo/core/pipeline/services/sources/alsSourcePayload'
import { requireDefined } from '@repo/core/requireDefined'
import { expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { als3dSuppression } from './hkgovAls3dSuppressions'
import { prepareAls3dCollections } from './hkgovAls3dPreparation'
import type { Als3dFeature } from './hkgovAls3d'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const changed: Als3dFeature = {
  geometry: { type: 'Point', coordinates: [114.18909, 22.30801] },
  properties: {
    Address: {
      PremisesAddress: {
        BuildingCsuInformation: { CsuId: '3752018776T20110715' },
        EngPremisesAddress: { BuildingName: 'NEW BUILDING' },
      },
    },
  },
}

test('reviewed suppression rejects changed identity and is bounded by version', () => {
  expect(() => als3dSuppression(changed, '2026-08-19.0')).toThrow(
    'source evidence changed',
  )
  expect(als3dSuppression(changed, '2026-08-19.0', true)).toBeUndefined()
  expect(als3dSuppression(changed, '2026-08-20.0', true)).toBeUndefined()
  expect(als3dSuppression(changed, '2026-08-20.0')).toBeUndefined()
  expect(als3dSuppression(changed, '2024-07-24.0')).toBeUndefined()
})

const rawPath = resolve(
  import.meta.dir,
  '../../../../../../../data/hkgov/dpo/ALS/20240725-1048-ALS-GeoJSON/als_addresses_3d_(public_rental_housing).geojson',
)
test.skipIf(!existsSync(rawPath))(
  'Tsz Lok drops only the redundant 633 inventory and preserves named inventories',
  async () => {
    const input = JSON.parse(await readFile(rawPath, 'utf8'))
    const features: Als3dFeature[] = input.features.filter((f: Als3dFeature) =>
      ['TSZ LOK ESTATE', 'TSZ LOK ESTATE PHASE 3'].includes(
        f.properties.Address.PremisesAddress.EngPremisesAddress?.EngEstate
          ?.EstateName ?? '',
      ),
    )
    const before = structuredClone(features)
    const unnamed = requireDefined(
      features.find(
        f =>
          f.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId ===
          '3864823026T20050430',
      ),
    )
    const named = features.filter(
      f => f.properties.Address.PremisesAddress.EngPremisesAddress?.BuildingName,
    )
    expect(named).toHaveLength(11)
    const retained = features.filter(f => !als3dSuppression(f, '2024-07-25.0'))
    expect(retained).toEqual(named)
    expect(features).toEqual(before)
    const p = unnamed.properties.Address.PremisesAddress
    expect(p.EngPremisesAddress?.Eng3dAddress).toHaveLength(633)
    expect(p.ChiPremisesAddress?.Chi3dAddress).toHaveLength(633)
    expect(als3dSuppression(unnamed, '2025-01-23.0')?.id).toBe(
      'tsz-lok-phase-3-unnamed-inventory',
    )
    expect(als3dSuppression(unnamed, '2025-02-25.0')).toBeUndefined()
    const changed = structuredClone(unnamed)
    requireDefined(
      changed.properties.Address.PremisesAddress.ChiPremisesAddress?.Chi3dAddress,
    ).pop()
    expect(() => als3dSuppression(changed, '2024-07-25.0')).toThrow(
      'source evidence changed',
    )
    expect(als3dSuppression(changed, '2024-07-25.0', true)).toBeUndefined()
  },
)
test('Shek Kip Mei suppression preserves both named houses and rejects changed evidence', async () => {
  const path = resolve(
    import.meta.dir,
    '../../../../../../../data/hkgov/dpo/ALS/20260819-1047-ALS-GeoJSON/als_addresses_3d_(public_rental_housing).geojson',
  )
  if (!existsSync(path)) return
  const input = JSON.parse(await readFile(path, 'utf8'))
  const features: Als3dFeature[] = input.features.filter((f: Als3dFeature) =>
    ['3532121484T20121220', '3530121496P20121220', '3527521523T20121220'].includes(
      f.properties.Address.PremisesAddress.BuildingCsuInformation?.CsuId ?? '',
    ),
  )
  expect(features).toHaveLength(3)
  for (const feature of features) {
    const p = feature.properties.Address.PremisesAddress
    if (p.BuildingCsuInformation?.CsuId !== '3532121484T20121220') {
      expect(als3dSuppression(feature, '2026-08-19.0')).toBeUndefined()
      expect(p.EngPremisesAddress?.Eng3dAddress).toHaveLength(779)
      continue
    }
    expect(als3dSuppression(feature, '2026-08-19.0')?.id).toBe(
      'shek-kip-mei-phase-2-unnamed-inventory',
    )
    expect(als3dSuppression(feature, '2026-08-20.0')).toBeUndefined()
    const changed = structuredClone(feature)
    changed.geometry.coordinates = [114, 22]
    expect(() => als3dSuppression(changed, '2026-08-19.0')).toThrow(
      'source evidence changed',
    )
    expect(als3dSuppression(changed, '2026-08-19.0', true)).toBeUndefined()
  }
})
test.skipIf(!existsSync(rawPath))(
  'retained delivery keeps raw suppressed assertions and only named building collections',
  async () => {
    const input = JSON.parse(await readFile(rawPath, 'utf8'))
    const features: Als3dFeature[] = input.features.filter((feature: Als3dFeature) =>
      ['HUNG HOM ESTATE', 'HUNG HOM ESTATE PHASE 2'].includes(
        feature.properties.Address.PremisesAddress.EngPremisesAddress?.EngEstate
          ?.EstateName ?? '',
      ),
    )
    expect(features).toHaveLength(7)
    const unnamed = features.filter(
      feature =>
        !feature.properties.Address.PremisesAddress.EngPremisesAddress?.BuildingName,
    )
    for (const feature of unnamed) {
      expect(als3dSuppression(feature, '2024-07-25.0')?.id).toBe(
        'hung-hom-phase-2-unnamed-inventory',
      )
      for (const mutate of [
        (copy: Als3dFeature) => {
          copy.geometry.coordinates = [114, 22]
        },
        (copy: Als3dFeature) => {
          requireDefined(
            requireDefined(copy.properties.Address.PremisesAddress.ChiPremisesAddress)
              .Chi3dAddress,
          ).pop()
        },
        (copy: Als3dFeature) => {
          requireDefined(
            requireDefined(copy.properties.Address.PremisesAddress.EngPremisesAddress)
              .EngStreet,
          ).BuildingNoFrom = '10'
        },
      ]) {
        const copy = structuredClone(feature)
        mutate(copy)
        expect(() => als3dSuppression(copy, '2024-07-25.0')).toThrow(
          'source evidence changed',
        )
      }
    }
    const rows = features.map((feature, index) => {
      const p = feature.properties.Address.PremisesAddress
      return {
        id: `hung-hom-${index}`,
        canonicalId: `hung-hom-${index}`,
        hkgovCsuId: p.BuildingCsuInformation?.CsuId,
        enBlockNumber: p.EngPremisesAddress?.EngBlock?.BlockNo,
        zhHantBlockNumber: p.ChiPremisesAddress?.ChiBlock?.BlockNo,
        engPremisesAddressJson: JSON.stringify(p.EngPremisesAddress),
        chiPremisesAddressJson: JSON.stringify(p.ChiPremisesAddress),
      } as PreparedHkgovAlsRow
    })
    const dir = await mkdtemp(join(tmpdir(), 'als-hung-hom-suppression-'))
    try {
      await writeFile(
        join(dir, 'als_addresses_3d_test.geojson'),
        JSON.stringify({ type: 'FeatureCollection', features }, null, 2),
      )
      const outputFile = join(dir, 'output.parquet')
      for (const skipCurationChecks of [false, true]) {
        expect(
          await prepareAls3dCollections({
            sourceDir: dir,
            sourceVersion: '2024-07-25.0',
            outputFile,
            rows,
            skipCurationChecks,
          }),
        ).toEqual({ collectionCount: 5, unitCount: 2773, sourceCount: 7 })
        const records = (await readFile(`${outputFile}.address3d.jsonl`, 'utf8'))
          .trim()
          .split('\n')
          .map(line => JSON.parse(line))
        const sources = records.filter(record => record.kind === 'source')
        expect(sources.map(record => record.rawProperties)).toEqual(
          features.map(feature => alsSourcePayload(feature).rawProperties),
        )
        expect(
          sources.filter(record =>
            record.sources.some(
              (source: { dataset: string }) =>
                source.dataset === 'saanseoi-address3d-suppression',
            ),
          ),
        ).toHaveLength(2)
        expect(rows).toHaveLength(7)
        const suppressedIds = sources
          .filter(record =>
            record.sources.some(
              (source: { dataset: string }) =>
                source.dataset === 'saanseoi-address3d-suppression',
            ),
          )
          .map(record => record.sourceRecordId)
        expect(
          records
            .filter(record => record.kind === 'collection')
            .some(record =>
              record.sourceRecordIds.some((id: string) => suppressedIds.includes(id)),
            ),
        ).toBe(false)
      }
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
)
