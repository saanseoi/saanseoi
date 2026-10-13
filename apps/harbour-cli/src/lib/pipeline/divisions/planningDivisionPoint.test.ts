import { expect, test } from 'bun:test'
import { normalisePreparedDivision } from './processLocalHkgovPlandDivisionSqlUploadPreparation'
import { createDivisionPointGuard } from '@repo/core/pipeline/services/divisions/divisionPoint'

test('Planning assembly derives and audits an interior Point without mutating source geometry', async () => {
  const geometry = {
    type: 'Polygon',
    coordinates: [
      [
        [114, 22],
        [114.6, 22],
        [114.6, 22.6],
        [114.4, 22.6],
        [114.4, 22.2],
        [114.2, 22.2],
        [114.2, 22.6],
        [114, 22.6],
        [114, 22],
      ],
    ],
  }
  const source = {
    id: 'planning-ppu',
    planning_level: 'ppu',
    geometry,
    source_properties: {},
    source_cell_ids: JSON.stringify(['native-cell']),
    identifiers: { 'PLAND:PPU': '1' },
    i18n: [],
  }
  const before = structuredClone(source)
  const guard = createDivisionPointGuard()
  const record = await normalisePreparedDivision(source, new Map(), guard)
  expect(record.base.geometry).toMatchObject({ type: 'Point' })
  expect(record.base.identifiers).toEqual({ 'hkgov-pland': { ppu: '1' } })
  expect(record.base.sources).toEqual([
    {
      publisher: 'hkgov-pland',
      dataset: 'ds-hk-hkgov-pland-division-pu',
      recordId: 'native-cell',
    },
  ])
  expect(source).toEqual(before)
  expect(guard.snapshot()[0]).toMatchObject({ status: 'passed', checked: 1 })
})
