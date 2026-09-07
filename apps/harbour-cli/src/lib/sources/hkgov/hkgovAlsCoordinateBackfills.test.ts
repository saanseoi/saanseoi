import { expect, test } from 'bun:test'
import fixture from '../../../../../../fixtures/meta/curations/hkgov-dpo-address-coordinate-backfills.json'
import { backfillAlsCoordinates } from './hkgovAlsCoordinateBackfills'
import { applyAlsEstateNames } from './hkgovAlsEstateNames'
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

test('backfills only reviewed historic points and retains provenance', () => {
  const sourceVersion = '2026-02-04.0'
  const decisions = fixture.backfills.filter(
    decision =>
      decision.sourceVersionFrom <= sourceVersion &&
      decision.sourceVersionTo >= sourceVersion,
  )
  const rows = decisions.map(rowFor)
  expect(backfillAlsCoordinates(rows, sourceVersion)).toEqual({
    backfilled: decisions.length,
  })
  for (const [index, decision] of decisions.entries()) {
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
  expect(backfillAlsCoordinates(rows, '2030-01-01.0')).toEqual({ backfilled: 0 })
  expect(JSON.parse(firstRow.geometry).coordinates).toEqual(first.previousCoordinates)
  const changed = [rowFor(first)]
  const changedRow = changed[0]
  if (!changedRow) throw new Error('Missing changed coordinate-backfill row')
  changedRow.geometry = JSON.stringify({ type: 'Point', coordinates: [0, 0] })
  expect(() => backfillAlsCoordinates(changed, '2026-02-04.0')).toThrow(
    'source point changed',
  )
})

test('coordinate guards retain publisher estate names after HA display curation', () => {
  const version = '2024-07-25.0'
  const rows = fixture.backfills
    .filter(d => d.sourceVersionFrom <= version && d.sourceVersionTo >= version)
    .map(rowFor)
  const row = rows.find(r => r.hkgovCsuId === '4028421562T20050430')!
  row.engPremisesAddressJson = JSON.stringify({
    EngEstate: { EstateName: 'CHOI WAN (1) ESTATE' },
  })
  row.chiPremisesAddressJson = JSON.stringify({
    ChiEstate: { EstateName: '彩雲(一)邨' },
  })
  row.zhHantEstateName = '彩雲(一)邨'
  row.enFormattedAddress = 'BOON YUET HOUSE, CHOI WAN (1) ESTATE'
  row.zhHantFormattedAddress = '彩雲(一)邨伴月樓'
  applyAlsEstateNames(rows, version)
  expect(row.enEstateName).toBe('Choi Wan (I) Estate')
  expect(backfillAlsCoordinates(rows, version).backfilled).toBe(rows.length)
  expect(JSON.parse(row.geometry!).coordinates).toEqual([114.21586, 22.3331])
  expect(row.enEstateName).toBe('Choi Wan (I) Estate')
  expect(
    JSON.parse(row.sources).hkgovAlsCoordinateBackfill.publisherGeometry.coordinates,
  ).toEqual([114.21588, 22.33308])
})

test('reviewed coordinate backfill guards match their April 2026 source events', async () => {
  const audit = await Bun.file(
    'fixtures/meta/curations/hkgov-dpo-address-estate-audit.json',
  ).json()
  for (const estateName of ['AP LEI CHAU ESTATE', 'BUTTERFLY ESTATE']) {
    const estate = audit.estates.find(
      (entry: { name: string }) => entry.name === estateName,
    )
    const event = estate?.timeline.find(
      (entry: { release: string }) => entry.release === '20260403-1056-ALS-GeoJSON',
    )
    const changes = new Map<string, { previous?: number[]; current?: number[] }>(
      event.changed
        .filter((change: { before: { building: string } }) => change.before.building)
        .map(
          (change: {
            before: {
              building: string
              csu: string
              assertions: Array<{ occurrences: Array<{ coordinates: number[] }> }>
            }
            after: {
              assertions: Array<{ occurrences: Array<{ coordinates: number[] }> }>
            }
          }) =>
            [
              JSON.stringify([change.before.csu, change.before.building]),
              {
                previous: change.before.assertions[0]?.occurrences[0]?.coordinates,
                current: change.after.assertions[0]?.occurrences[0]?.coordinates,
              },
            ] as const,
        ),
    )
    const decisions = fixture.backfills.filter(
      decision =>
        decision.estate === estateName && decision.automaticPolicy === undefined,
    )
    expect(decisions).toHaveLength(6)
    for (const decision of decisions) {
      const change = changes.get(
        JSON.stringify([decision.csu, decision.enBuildingName]),
      )
      expect(change?.previous).toEqual(decision.previousCoordinates)
      expect(change?.current).toEqual(decision.currentCoordinates)
    }
  }
})

test('automatic coordinate backfills retain exact named source-event guards', async () => {
  const audit = await Bun.file(
    'fixtures/meta/curations/hkgov-dpo-address-estate-audit.json',
  ).json()
  const automatic = fixture.backfills.filter(
    decision => decision.automaticPolicy === 'coordinate-only-named-under-50m-backfill',
  )
  expect(automatic.length).toBeGreaterThan(1_000)
  for (const decision of automatic) {
    const release = `${decision.evidenceSourceVersion.replaceAll('-', '').slice(0, 8)}-`
    const estate = audit.estates.find(
      (entry: { name: string }) => entry.name === decision.estate,
    )
    const event = estate?.timeline.find((entry: { release: string }) =>
      entry.release.startsWith(release),
    )
    const change = event?.changed.find(
      (entry: {
        before: {
          csu: string
          building: string
          assertions: Array<{ occurrences: Array<{ coordinates: number[] }> }>
        }
        after: {
          assertions: Array<{ occurrences: Array<{ coordinates: number[] }> }>
        }
      }) =>
        entry.before.csu === decision.csu &&
        entry.before.building === decision.enBuildingName,
    )
    expect(change?.before.assertions[0]?.occurrences[0]?.coordinates).toEqual(
      decision.previousCoordinates,
    )
    expect(change?.after.assertions[0]?.occurrences[0]?.coordinates).toEqual(
      decision.currentCoordinates,
    )
  }
})

test('coordinate backfill ranges never overlap for the same source premise', () => {
  const byPremise = Map.groupBy(
    fixture.backfills,
    decision => `${decision.estate}/${decision.csu}/${decision.enBuildingName}`,
  )
  for (const decisions of byPremise.values()) {
    for (const [index, decision] of decisions.entries()) {
      for (const other of decisions.slice(index + 1)) {
        expect(
          decision.sourceVersionFrom > other.sourceVersionTo ||
            other.sourceVersionFrom > decision.sourceVersionTo,
        ).toBe(true)
      }
    }
  }
})
