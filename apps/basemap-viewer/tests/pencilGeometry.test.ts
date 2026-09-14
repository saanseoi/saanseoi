import { describe, it, expect } from 'vitest'
import {
  extendPencilPath,
  pencilPolygon,
  validatePencilPath,
} from '../src/local-review/division-areas/pencilGeometry'
import type { Position } from 'geojson'
const snap = (p: Position) => p
const route = (a: Position, b: Position) => [a, [1, 0.5], b]
describe('road pencil', () => {
  it('adds all road bends without mutating the accepted drawing', () => {
    const points = [[0, 0]]
    expect(extendPencilPath(points, [2, 1], false, snap, route)).toEqual([
      [0, 0],
      [1, 0.5],
      [2, 1],
    ])
    expect(points).toEqual([[0, 0]])
  })
  it('Ctrl draws a straight segment without consulting roads', () => {
    const unavailable = () => {
      throw Error('Road lookup must not run')
    }
    expect(extendPencilPath([[0, 0]], [2, 1], true, unavailable, unavailable)).toEqual([
      [0, 0],
      [2, 1],
    ])
  })
  it('refuses unavailable roads and disconnected routes', () => {
    expect(() => extendPencilPath([], [0, 0], false, () => null, route)).toThrow(
      'No road',
    )
    expect(() => extendPencilPath([[0, 0]], [1, 1], false, snap, () => null)).toThrow(
      'No connected road',
    )
  })
  it('accepts crossing, retracing and touching strokes for polygonisation', () => {
    for (const points of [
      [
        [0, 0],
        [2, 2],
        [0, 2],
        [2, 0],
      ],
      [
        [0, 0],
        [2, 0],
        [1, 0],
      ],
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [1, 0],
      ],
    ]) {
      expect(() => validatePencilPath(points)).not.toThrow()
    }
  })
  it('validates the closing edge as well as the open path', () => {
    const valid = [
      [0, 0],
      [2, 0],
      [2, 2],
      [0, 2],
    ]
    expect(
      pencilPolygon(extendPencilPath(valid, valid[0]!, true, snap, route, true))
        .coordinates[0],
    ).toHaveLength(5)
    const crossingClose = [
      [0, 0],
      [2, 0],
      [0, 2],
      [2, 2],
    ]
    validatePencilPath(crossingClose)
    expect(() =>
      pencilPolygon(extendPencilPath(crossingClose, [0, 0], true, snap, route, true)),
    ).toThrow()
  })
})
