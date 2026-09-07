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
  '../../../../../../data/hkgov/dpo/ALS/20240725-1048-ALS-GeoJSON/als_addresses_3d_(public_rental_housing).geojson',
)
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
        expect(sources.map(record => record.rawProperties)).toEqual(features)
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
