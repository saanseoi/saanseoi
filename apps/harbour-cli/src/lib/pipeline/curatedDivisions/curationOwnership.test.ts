import { expect, test } from 'bun:test'
import { divisionCuration as c } from './curationInputs'

test('authored geometry, source selections and independent overrides have separate owners', () => {
  for (const key of ['points', 'bounds', 'islandSelections', 'islandCorrections'])
    expect(c.geometry).not.toHaveProperty(key)
  const hasCoordinates = (value: unknown): boolean => {
    if (!value || typeof value !== 'object') return false
    return Object.entries(value).some(
      ([key, child]) => key === 'coordinates' || hasCoordinates(child),
    )
  }
  expect(hasCoordinates(c.selections)).toBe(false)
  for (const fixture of [c.geometry, c.selections, c.points, c.bounds])
    expect(fixture.purpose.length).toBeGreaterThan(20)
  const corePoints = new Map(
    c.geometry.features.map(feature => [
      feature.properties.divisionId,
      (feature.properties as any).corePoint,
    ]),
  )
  for (const entry of c.points.entries)
    expect(entry.point).not.toEqual(corePoints.get(entry.divisionId))
})
