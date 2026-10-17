import { expect, test } from 'bun:test'
import { resolveCuratedHierarchies } from './resolveHierarchies'
const box = (w: number, e: number) => ({
  type: 'Polygon',
  coordinates: [
    [
      [w, 0],
      [e, 0],
      [e, 1],
      [w, 1],
      [w, 0],
    ],
  ],
})
const row = (id: string, category: string, klass: string, level: number | null) => ({
  id,
  category,
  class: klass,
  level,
  hierarchies: { full: [] },
})
test('cross-boundary branches retain correlated districts and neighbourhood parents without edge-only matches', () => {
  const divisions: any[] = [
    row('sar', 'administrative', 'sar', 0),
    row('area', 'administrative', 'area', 1),
    row('west', 'administrative', 'district', 2),
    row('east', 'administrative', 'district', 2),
    row('touch', 'administrative', 'district', 2),
    row('hood', 'hood', 'neighbourhood', 5),
  ]
  const areas = divisions.map(d => ({
    divisionId: d.id,
    geometry:
      d.id === 'west'
        ? box(0, 1)
        : d.id === 'east'
          ? box(1, 2)
          : d.id === 'touch'
            ? box(2, 3)
            : box(0, 2),
  }))
  resolveCuratedHierarchies(divisions, areas, [])
  expect(
    divisions[5].hierarchies.administrative.map((p: any[]) => p.map(e => e.id)),
  ).toEqual([
    ['sar', 'area', 'west'],
    ['sar', 'area', 'east'],
  ])
})
test('islands and island groups get district ancestry; Hong Kong Island stops at area', () => {
  const divisions: any[] = [
    row('sar', 'administrative', 'sar', 0),
    row('area', 'administrative', 'area', 1),
    row('district', 'administrative', 'district', 2),
    row('group', 'landform', 'island_group', null),
    row('islet', 'landform', 'islet', null),
    row('hki', 'landform', 'major_island', null),
  ]
  resolveCuratedHierarchies(
    divisions,
    divisions.map(d => ({ divisionId: d.id, geometry: box(0, 1) })),
    [
      { divisionId: 'hki', locale: 'en', name: 'Hong Kong Island' },
      { divisionId: 'hki', locale: 'zh-hant', name: '香港島' },
    ],
  )
  expect(divisions[4].hierarchies.administrative[0].map((e: any) => e.id)).toEqual([
    'sar',
    'area',
    'district',
  ])
  expect(divisions[4].hierarchies.landform[0].map((e: any) => e.id)).toEqual(['group'])
  expect(divisions[3].hierarchies.administrative[0].at(-1).id).toBe('district')
  expect(divisions[5].hierarchies.administrative[0].map((e: any) => e.id)).toEqual([
    'sar',
    'area',
  ])
})

test('an excluded island cannot regain group membership merely by overlapping its union', () => {
  const divisions: any[] = [
    row('group', 'landform', 'island_group', null),
    row('excluded', 'landform', 'minor_island', null),
  ]
  resolveCuratedHierarchies(
    divisions,
    [
      { divisionId: 'group', geometry: box(0, 2) },
      { divisionId: 'excluded', geometry: box(1, 3) },
    ],
    [],
    new Map([['group', new Set<string>()]]),
  )
  expect(divisions[1].hierarchies.landform).toEqual([])
})

test('all hierarchy paths use canonical Chinese then English labels, including retained ancestors', () => {
  const divisions: any[] = [
    row('sar', 'administrative', 'sar', 0),
    row('area', 'administrative', 'area', 1),
    row('district', 'administrative', 'district', 2),
    row('village', 'locality', 'village', 5),
    row('child', 'hood', 'microhood', 6),
    row('unmapped', 'hood', 'microhood', 6),
  ]
  const stale = { id: 'village', class: 'village', name: 'Old English' }
  divisions[4].hierarchies = { full: [[stale]] }
  divisions[5].hierarchies = JSON.stringify({ full: [[stale]] })
  resolveCuratedHierarchies(
    divisions,
    divisions
      .slice(0, 3)
      .concat(divisions[4])
      .map(d => ({ divisionId: d.id, geometry: box(0, 1) })),
    [
      { divisionId: 'sar', locale: 'en', name: 'Hong Kong' },
      { divisionId: 'sar', locale: 'zh-hant', name: '香港' },
      { divisionId: 'area', locale: 'en', name: 'New Territories' },
      { divisionId: 'area', locale: 'zh-hant', name: '新界' },
      { divisionId: 'district', locale: 'en', name: 'Yuen Long District' },
      { divisionId: 'district', locale: 'zh-hant', name: '元朗區' },
      { divisionId: 'village', locale: 'en', name: 'Village' },
      { divisionId: 'village', locale: 'zh-hant', name: '村' },
    ],
  )
  expect(divisions[4].hierarchies.full[0].map((e: any) => e.name)).toEqual([
    '香港 Hong Kong',
    '新界 New Territories',
    '元朗區 Yuen Long District',
    '村 Village',
  ])
  expect(divisions[4].hierarchies.administrative[0].map((e: any) => e.name)).toEqual([
    '香港 Hong Kong',
    '新界 New Territories',
    '元朗區 Yuen Long District',
  ])
  expect(divisions[4].hierarchies.locality[0][0].name).toBe('村 Village')
  expect(divisions[5].hierarchies.full[0][0].name).toBe('村 Village')
})

test('stored full paths omit cities and Hong Kong Island while retaining category evidence', () => {
  const islandId = 'ss-5999ed90-1c47-51e7-b79d-80f9251c1e01'
  const divisions: any[] = [
    row('sar', 'administrative', 'sar', 0),
    row('district', 'administrative', 'district', 2),
    row('city', 'locality', 'city', 1),
    row(islandId, 'landform', 'major_island', null),
    row('rural', 'locality', 'rural_area', 4),
    row('village', 'locality', 'village', 5),
    {
      ...row('no-geometry', 'hood', 'microhood', 6),
      hierarchies: {
        full: [
          { id: 'city', class: 'city' },
          { id: islandId, class: 'major_island' },
          { id: 'rural', class: 'rural_area' },
        ].map(e => [e]),
      },
    },
  ]
  resolveCuratedHierarchies(
    divisions,
    divisions.slice(0, 6).map(d => ({
      divisionId: d.id,
      geometry: box(0, 1),
    })),
    [],
  )
  const hierarchy = divisions[5].hierarchies
  expect(hierarchy.full.flat().map((e: any) => e.id)).toEqual([
    'sar',
    'district',
    'rural',
  ])
  expect(hierarchy.locality.flat().map((e: any) => e.id)).toEqual(['city', 'rural'])
  expect(hierarchy.landform.flat().map((e: any) => e.id)).toEqual([islandId])
  expect(divisions[6].hierarchies.full).toEqual([
    [{ id: 'rural', class: 'rural_area', name: null }],
  ])
})

test('partial parent coverage retains the uncovered branch through later tiers', () => {
  const divisions: any[] = [
    row('district', 'administrative', 'district', 2),
    row('macro', 'hood', 'macrohood', 4),
    row('west', 'hood', 'neighbourhood', 5),
    row('east', 'hood', 'neighbourhood', 5),
    row('child', 'hood', 'microhood', 6),
  ]
  resolveCuratedHierarchies(
    divisions,
    [
      { divisionId: 'district', geometry: box(0, 3) },
      { divisionId: 'macro', geometry: box(0, 1) },
      { divisionId: 'west', geometry: box(0, 1) },
      { divisionId: 'east', geometry: box(1, 2) },
      { divisionId: 'child', geometry: box(0, 3) },
    ],
    [],
  )
  expect(divisions[4].hierarchies.full.map((p: any[]) => p.map(e => e.id))).toEqual([
    ['district', 'macro', 'west'],
    ['district', 'east'],
    ['district'],
  ])
})

test('overlapping parents covering the child together do not produce an uncovered path', () => {
  const divisions: any[] = [
    row('district', 'administrative', 'district', 2),
    row('a', 'hood', 'macrohood', 4),
    row('b', 'hood', 'macrohood', 4),
    row('child', 'hood', 'microhood', 6),
  ]
  resolveCuratedHierarchies(
    divisions,
    [
      { divisionId: 'district', geometry: box(0, 3) },
      { divisionId: 'a', geometry: box(0, 2) },
      { divisionId: 'b', geometry: box(1, 3) },
      { divisionId: 'child', geometry: box(0, 3) },
    ],
    [],
  )
  expect(divisions[3].hierarchies.full.map((p: any[]) => p.map(e => e.id))).toEqual([
    ['district', 'a'],
    ['district', 'b'],
  ])
})

test('multipart intersections discard boundary lines before subtracting covered area', () => {
  const divisions: any[] = [
    row('district', 'administrative', 'district', 2),
    row('macro', 'hood', 'macrohood', 4),
    row('child', 'hood', 'microhood', 6),
  ]
  const multi = (...parts: ReturnType<typeof box>[]) => ({
    type: 'MultiPolygon',
    coordinates: parts.map(p => p.coordinates),
  })
  resolveCuratedHierarchies(
    divisions,
    [
      { divisionId: 'district', geometry: box(0, 3) },
      { divisionId: 'macro', geometry: multi(box(0, 0.5), box(1, 2)) },
      { divisionId: 'child', geometry: multi(box(0, 1), box(2, 3)) },
    ],
    [],
  )
  expect(divisions[2].hierarchies.full.map((p: any[]) => p.map(e => e.id))).toEqual([
    ['district', 'macro'],
    ['district'],
  ])
})

test('point-only children do not acquire a remainder branch', () => {
  const divisions: any[] = [
    row('district', 'administrative', 'district', 2),
    row('macro', 'hood', 'macrohood', 4),
    {
      ...row('child', 'hood', 'microhood', 6),
      geometry: { type: 'Point', coordinates: [0.5, 0.5] },
    },
  ]
  resolveCuratedHierarchies(
    divisions,
    [
      { divisionId: 'district', geometry: box(0, 3) },
      { divisionId: 'macro', geometry: box(0, 1) },
    ],
    [],
  )
  expect(divisions[2].hierarchies.full.map((p: any[]) => p.map(e => e.id))).toEqual([
    ['district', 'macro'],
  ])
})

const hkBox = (w: number, e: number, north = 22.001) => ({
  type: 'Polygon',
  coordinates: [
    [
      [w, 22],
      [e, 22],
      [e, north],
      [w, north],
      [w, 22],
    ],
  ],
})

test('tiny incidental overlap is audited, while a meaningful overlap remains a parent', () => {
  const divisions: any[] = [
    row('sliver', 'hood', 'macrohood', 4),
    row('real', 'hood', 'macrohood', 4),
    row('child', 'hood', 'neighbourhood', 5),
  ]
  const audit = resolveCuratedHierarchies(
    divisions,
    [
      { divisionId: 'child', geometry: hkBox(114, 114.001) },
      { divisionId: 'sliver', geometry: hkBox(114.001 - 0.0000004, 114.002) },
      { divisionId: 'real', geometry: hkBox(114.001 - 0.000002, 114.002) },
    ],
    [],
  )
  expect(divisions[2].hierarchies.full.flat().map((e: any) => e.id)).toEqual(['real'])
  expect(audit).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        divisionId: 'child',
        ancestorIds: ['sliver'],
        reason: 'small-overlap',
      }),
    ]),
  )
  expect(
    audit.find(e => e.divisionId === 'child' && e.reason === 'small-overlap')!
      .areaSquareMetres,
  ).toBeLessThan(10)
})

test('a tiny island wholly inside a broad town retains its island relationship', () => {
  const divisions: any[] = [
    row('islet', 'landform', 'islet', null),
    row('town', 'locality', 'town', 3),
  ]
  resolveCuratedHierarchies(
    divisions,
    [
      { divisionId: 'islet', geometry: hkBox(114.0001, 114.00012, 22.00002) },
      { divisionId: 'town', geometry: hkBox(114, 114.001) },
    ],
    [],
  )
  expect(divisions[1].hierarchies.landform.flat().map((e: any) => e.id)).toEqual([
    'islet',
  ])
})

test('a small remainder is audited instead of creating a parentless branch', () => {
  const divisions: any[] = [
    row('parent', 'hood', 'macrohood', 4),
    row('child', 'hood', 'neighbourhood', 5),
  ]
  const audit = resolveCuratedHierarchies(
    divisions,
    [
      { divisionId: 'parent', geometry: hkBox(114, 114.001) },
      { divisionId: 'child', geometry: hkBox(114, 114.0010004) },
    ],
    [],
  )
  expect(divisions[1].hierarchies.full.map((p: any[]) => p.map(e => e.id))).toEqual([
    ['parent'],
  ])
  expect(audit).toEqual([
    expect.objectContaining({
      divisionId: 'child',
      reason: 'small-remainder',
      ancestorIds: ['parent'],
    }),
  ])
})
