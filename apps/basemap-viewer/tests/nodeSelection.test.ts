import { describe, it, expect } from 'vitest'
import {
  nodesInRectangle,
  removeSelectedNodes,
} from '../src/local-review/division-areas/nodeSelection'
describe('rectangle node selection', () => {
  it('includes border points and works in either drag direction', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 10, y: 20 },
      { x: 5, y: 10 },
      { x: 11, y: 20 },
    ]
    expect([...nodesInRectangle(points, { x: 10, y: 20 }, { x: 0, y: 0 })]).toEqual([
      0, 1, 2,
    ])
    expect([...nodesInRectangle(points, { x: 0, y: 0 }, { x: 10, y: 20 })]).toEqual([
      0, 1, 2,
    ])
  })
  it('deletes only selected indices, preserving order and the source', () => {
    const points = [
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
      [0, 1],
    ]
    expect(removeSelectedNodes(points, new Set([1, 3]))).toEqual([
      [0, 0],
      [2, 0],
      [0, 1],
    ])
    expect(points).toHaveLength(5)
  })
  it('rejects deletions that collapse the ring', () => {
    expect(() =>
      removeSelectedNodes(
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
        new Set([1, 2]),
      ),
    ).toThrow('at least three')
  })
})
