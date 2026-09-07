import { expect, test } from 'bun:test'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-coordinate-backfills.json'
import { backfillAlsCoordinates } from './hkgovAlsCoordinateBackfills'
import type { PreparedHkgovAlsRow } from './hkgovAlsTypes'

const rowFor = (decision: (typeof fixture.backfills)[number]) =>
  ({
    enBuildingName: decision.enBuildingName,
    enEstateName: decision.estate,
    geometry: JSON.stringify({
      type: 'Point',
      coordinates: decision.previousCoordinates,
    }),
    hkgovCsuId: decision.csu,
    sources: '{}',
  }) as PreparedHkgovAlsRow

test('backfills only the reviewed Cheung Hong historic points and retains provenance', () => {
  const rows = fixture.backfills.map(rowFor)
  expect(backfillAlsCoordinates(rows, '2026-02-04.0')).toEqual({ backfilled: 13 })
  for (const [index, decision] of fixture.backfills.entries()) {
    const row = rows[index]
    if (!row?.geometry) throw new Error('Missing coordinate-backfill test row')
    expect(JSON.parse(row.geometry).coordinates).toEqual(decision.currentCoordinates)
    const provenance = JSON.parse(row.sources).hkgovAlsCoordinateBackfill
    expect(provenance.publisherGeometry.coordinates).toEqual(
      decision.previousCoordinates,
    )
    expect(provenance.derivedGeometry.coordinates).toEqual(decision.currentCoordinates)
  }
})

test('does not apply outside the approved history or after source geometry changes', () => {
  const rows = fixture.backfills.map(rowFor)
  const first = fixture.backfills[0]
  const firstRow = rows[0]
  if (!first || !firstRow?.geometry)
    throw new Error('Missing coordinate-backfill fixture')
  expect(backfillAlsCoordinates(rows, '2026-04-03.0')).toEqual({ backfilled: 0 })
  expect(JSON.parse(firstRow.geometry).coordinates).toEqual(first.previousCoordinates)
  const changed = [rowFor(first)]
  const changedRow = changed[0]
  if (!changedRow) throw new Error('Missing changed coordinate-backfill row')
  changedRow.geometry = JSON.stringify({ type: 'Point', coordinates: [0, 0] })
  expect(() => backfillAlsCoordinates(changed, '2026-02-04.0')).toThrow(
    'source point changed',
  )
})
