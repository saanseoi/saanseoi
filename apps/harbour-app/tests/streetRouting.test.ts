import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  buildStreetGraph,
  shortestStreetRoute,
} from '../src/tools/division-areas/streetRouting'
import { extendPencilPath } from '../src/tools/division-areas/pencilGeometry'
import { nearestStreetSelection } from '../src/tools/division-areas/streetRouting'

describe('Leighton Road pencil regression', () => {
  it('retains the bend between Caroline Hill Road and Hoi Ping Road', () => {
    const roads = JSON.parse(
      readFileSync(
        new URL('./fixtures/leightonRoadCentrelines.json', import.meta.url),
        'utf8',
      ),
    )
    const graph = buildStreetGraph(roads)
    const start = [114.1850664, 22.2771848],
      end = [114.1853495, 22.2771378]
    const path = extendPencilPath(
      [start],
      end,
      false,
      p => nearestStreetSelection(p, graph)?.position ?? null,
      (a, b) => shortestStreetRoute(graph, a, b),
    )
    expect(path.length).toBeGreaterThan(2)
    expect(path).toContainEqual([114.1852845, 22.2771302])
    expect(path[0]).toEqual(start)
    expect(path.at(-1)).toEqual(end)
  })
})
