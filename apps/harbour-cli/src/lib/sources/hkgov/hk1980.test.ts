import { expect, test } from 'bun:test'
import { projectHk80Geometry } from './hk1980'

test('HK1980 datum transformation matches independent PROJ EPSG:2326 to EPSG:4326 controls', () => {
  // PROJ: Inverse Hong Kong 1980 Grid + Hong Kong 1980 to WGS 84 (1).
  // These controls must not be regenerated from the implementation under test.
  for (const [input, expected] of [
    [
      [836694.05, 819069.8],
      [114.18100932670514, 22.310602433882],
    ],
    [
      [834877.4981000004, 813336.0230999999],
      [114.1633839870595, 22.258822297319306],
    ],
    [
      [827251.0000999998, 839734.0000999998],
      [114.08924430073009, 22.497186746725173],
    ],
  ]) {
    const actual = projectHk80Geometry({
      type: 'Point',
      coordinates: [input![0]!, input![1]!],
    }) as { coordinates: number[] }
    expect(actual.coordinates[0]).toBeCloseTo(expected![0]!, 7)
    expect(actual.coordinates[1]).toBeCloseTo(expected![1]!, 7)
  }
})
