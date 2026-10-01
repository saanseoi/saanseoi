import { expect, it } from 'vitest'
import { divisionLayerKey } from '../src/local-review/division-areas/layerControls'

it('separates classes sharing the same numeric level', () => {
  const key = (category: string, type: string, level: number) =>
    divisionLayerKey({ id: 'one', category, class: type, level }, new Set())
  expect(key('administrative', 'area', 1)).toBe('admin-1')
  expect(key('locality', 'city', 1)).toBe('city')
  expect(key('hood', 'neighbourhood', 5)).toBe('neighbourhood')
  expect(key('locality', 'village', 5)).toBe('village')
})

it('routes saved island geometry and groups to custom, source outlines to proto', () => {
  const island = {
    id: 'island',
    category: 'landform',
    class: 'minor_island',
    level: null,
  }
  expect(divisionLayerKey(island, new Set())).toBe('island-proto')
  expect(divisionLayerKey(island, new Set(['island']))).toBe('island-custom')
  expect(divisionLayerKey({ ...island, class: 'island_group' }, new Set())).toBe(
    'island-custom',
  )
})
