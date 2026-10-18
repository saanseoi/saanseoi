import { expect, test } from 'bun:test'
import { mergeDataReleaseFeed } from './dataReleaseFeed'

const api = (code: string, updatedAt: string) => ({ release: { code, updatedAt } })
const basemap = (version: string) => ({ release: { code: `map-${version}`, version } })

test('loading another page appends cards without moving existing basemaps', () => {
  const firstPage = [api('new', '2026-10-01T00:00:00.000Z')]
  const maps = [basemap('2026-10-01'), basemap('2026-09-01')]
  const first = mergeDataReleaseFeed(firstPage, maps, true)
  expect(first).toEqual(firstPage)
  const secondPage = [...firstPage, api('older', '2026-09-15T00:00:00.000Z')]
  const second = mergeDataReleaseFeed(secondPage, maps, true)
  expect(second.slice(0, first.length)).toEqual(first)
  expect(second.map(item => item.release.code)).toEqual([
    'new',
    'map-2026-10-01',
    'older',
  ])
  const completed = mergeDataReleaseFeed(secondPage, maps, false)
  expect(completed.slice(0, second.length)).toEqual(second)
  expect(completed.at(-1)).toEqual(maps[1])
})

test('an older cohort updated today leads the feed by its update date', () => {
  const oldCohort = api('2025-cohort', '2026-10-18T00:00:00.000Z')
  expect(
    mergeDataReleaseFeed(
      [oldCohort, api('2026-cohort', '2026-10-01T00:00:00.000Z')],
      [basemap('2026-10-01')],
      false,
    )[0],
  ).toEqual(oldCohort)
})

test('basemaps remain available when there are no API releases', () => {
  const maps = [basemap('2026-09-01'), basemap('2026-10-01')]
  expect(mergeDataReleaseFeed([], maps, false)).toEqual([maps[1], maps[0]])
})
