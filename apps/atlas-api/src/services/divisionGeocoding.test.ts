import { describe, expect, test } from 'bun:test'
import { createDivisionResolver, distanceMetres } from './divisionGeocoding'
import { division, area, entry } from './geocoding.fixtures'

describe('division geocoding evidence', () => {
  test('published curated polygons retain both sides of a shared boundary', () => {
    const areas = [area('a', 0, 5), area('b', 5, 10)].map(a => ({
      ...a,
      variant: 'saanseoi' as const,
    }))
    const resolver = createDivisionResolver([division('a'), division('b')], areas)
    expect(resolver.resolve([5, 2]).matchedDivisionIds).toEqual(['a', 'b'])
    expect(resolver.resolve([4.999, 2]).matchedDivisionIds).toEqual(['a'])
    expect(resolver.resolve([5.001, 2]).matchedDivisionIds).toEqual(['b'])
  })
  test('branches are selected by coordinate without crossing parent paths', () => {
    const village = division('village', 'locality', {
      full: [
        [entry('root'), entry('west')],
        [entry('root'), entry('east')],
      ],
      administrative: [
        [entry('root'), entry('west')],
        [entry('root'), entry('east')],
      ],
    })
    village.division.class = 'village'
    const resolver = createDivisionResolver(
      [division('root'), division('west'), division('east'), village],
      [area('root'), area('west', 0, 5), area('east', 5, 10), area('village')],
    )
    const result = resolver.resolve([2, 2])
    expect(result.path).toEqual(['root', 'west', 'village'])
    expect(result.memberships.map(value => value.id)).not.toContain('east')
    expect(result.status).toBe('resolved')
  })
  test('shared boundaries and overlaps preserve alternatives deterministically', () => {
    const records = [division('a'), division('b')]
    const areas = [area('a', 0, 5), area('b', 5, 10)]
    const result = createDivisionResolver(records, areas).resolve([5, 2])
    expect(result.status).toBe('ambiguous')
    expect(result.path).toBeNull()
    expect(result.matchedDivisionIds).toEqual(['a', 'b'])
    expect(
      createDivisionResolver(records.toReversed(), areas.toReversed()).resolve([5, 2]),
    ).toEqual(result)
    expect(
      createDivisionResolver(records, [area('a'), area('b')]).resolve([2, 2]).status,
    ).toBe('ambiguous')
  })
  test('polygon holes exclude interiors and include hole and outer boundaries', () => {
    const polygon = area('a')
    polygon.geometry = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [2, 2],
          [4, 2],
          [4, 4],
          [2, 4],
          [2, 2],
        ],
      ],
    }
    const resolver = createDivisionResolver([division('a')], [polygon])
    expect(resolver.resolve([3, 3]).matchedDivisionIds).toEqual([])
    expect(resolver.resolve([2, 3]).matchedDivisionIds).toEqual(['a'])
    expect(resolver.resolve([0, 3]).matchedDivisionIds).toEqual(['a'])
  })
  test('multipolygons test each component and ignore label points and other variants', () => {
    const polygon = area('a')
    polygon.geometry = {
      type: 'MultiPolygon',
      coordinates: [
        [
          [
            [0, 0],
            [2, 0],
            [2, 2],
            [0, 2],
            [0, 0],
          ],
        ],
        [
          [
            [8, 0],
            [10, 0],
            [10, 2],
            [8, 2],
            [8, 0],
          ],
        ],
      ],
    }
    const resolver = createDivisionResolver([division('a')], [polygon])
    expect(resolver.resolve([9, 1]).matchedDivisionIds).toEqual(['a'])
    expect(resolver.resolve([5, 1]).matchedDivisionIds).toEqual([])
    expect(
      createDivisionResolver(
        [division('a')],
        [{ ...polygon, variant: 'hkgov-had' }],
      ).resolve([9, 1]).matchedDivisionIds,
    ).toEqual([])
  })
  test('same-name island and village retain distinct IDs and suppressed island group ancestry', () => {
    const island = division('island', 'landform', {
      full: [[entry('group', 'island_group')]],
      landform: [[entry('group', 'island_group')]],
    })
    const group = division('group', 'landform')
    group.division.class = 'island_group'
    const village = division('village', 'locality', {
      full: [[entry('root')]],
      landform: [[entry('group', 'island_group'), entry('island', 'minor_island')]],
    })
    village.division.class = 'village'
    island.i18n.en!.name = village.i18n.en!.name = 'Same name'
    const result = createDivisionResolver(
      [division('root'), group, island, village],
      [area('root'), area('island'), area('village')],
    ).resolve([1, 1])
    expect(result.landform.memberships.map(value => value.id)).toEqual([
      'group',
      'island',
    ])
    expect(result.memberships.map(value => value.id)).toEqual([
      'group',
      'island',
      'root',
      'village',
    ])
    expect(result.coverage.missingAncestorIds).toContain('group')
    expect(result.status).toBe('incomplete')
  })
  test('empty coverage and missing ancestor records are explicit', () => {
    expect(createDivisionResolver([division('a')], []).resolve([1, 1]).status).toBe(
      'incomplete',
    )
    const result = createDivisionResolver(
      [division('a', 'administrative', { full: [[entry('missing')]] })],
      [area('a')],
    ).resolve([1, 1])
    expect(result.coverage.missingAncestorIds).toEqual(['missing'])
    expect(result.memberships.find(value => value.id === 'missing')?.evidence).toBe(
      'hierarchy',
    )
  })
  test('great-circle distance handles the antimeridian', () => {
    expect(distanceMetres([180, 0], [-180, 0])).toBeLessThan(0.000001)
    expect(distanceMetres([0, 0], [0, 1])).toBeCloseTo(111195.08, 1)
  })
  test('suppressed cities are restored through their own evidenced ancestry', () => {
    const city = division('city', 'locality', { full: [[entry('root')]] })
    city.division.class = 'city'
    const town = division('town', 'locality', {
      full: [[entry('root')]],
      locality: [[entry('city', 'city')]],
    })
    town.division.class = 'town'
    const village = division('village', 'locality', {
      full: [[entry('root'), entry('town', 'town')]],
      locality: [[entry('town', 'town')]],
    })
    village.division.class = 'village'
    const result = createDivisionResolver(
      [division('root'), city, town, village],
      [area('root'), area('city'), area('town'), area('village')],
    ).resolve([1, 1])
    expect(result.selectedAncestryIds).toEqual(['city', 'root', 'town', 'village'])
    expect(result.path).toEqual(['root', 'city', 'town', 'village'])
  })
  test('uncorrelated locality projections cannot create a selected ancestry', () => {
    const village = division('village', 'locality', {
      full: [[entry('root')]],
      locality: [[entry('a', 'town')], [entry('b', 'town')]],
    })
    village.division.class = 'village'
    const result = createDivisionResolver(
      [division('root'), village],
      [area('root'), area('village')],
    ).resolve([1, 1])
    expect(result.status).toBe('ambiguous')
    expect(result.selectedAncestryIds).toBeNull()
    expect(result.path).toBeNull()
  })
  test('landform paths remain separate when a full display branch also includes them', () => {
    const group = division('group', 'landform')
    group.division.class = 'island_group'
    const island = division('island', 'landform', {
      full: [[entry('group', 'island_group')]],
    })
    const village = division('village', 'locality', {
      full: [
        [
          entry('root'),
          entry('group', 'island_group'),
          entry('island', 'minor_island'),
        ],
      ],
      landform: [[entry('group', 'island_group'), entry('island', 'minor_island')]],
    })
    village.division.class = 'village'
    const result = createDivisionResolver(
      [division('root'), group, island, village],
      [area('root'), area('group'), area('island'), area('village'), area('village')],
    ).resolve([1, 1])
    expect(result.path).toEqual(['root', 'village'])
    expect(result.landform.paths).toEqual([['group', 'island']])
    expect(result.matchedDivisionIds).toEqual(['group', 'island', 'root', 'village'])
    expect(result.selectedAncestryIds).toEqual(['group', 'island', 'root', 'village'])
  })
  test('forward identity retains its own path without claiming label-point containment', () => {
    const village = division('village', 'locality', { full: [[entry('root')]] })
    const result = createDivisionResolver([division('root'), village], []).resolveNamed(
      'village',
      null,
    )
    expect(result.path).toEqual(['root', 'village'])
    expect(result.memberships.find(member => member.id === 'village')?.evidence).toBe(
      'name',
    )
    expect(result.status).toBe('incomplete')
  })
  test('partial stored hierarchies do not crash resolution', () => {
    const village = division('village', 'locality', { full: [[entry('root')]] })
    village.division.hierarchies = {
      full: [[entry('root')]],
    } as typeof village.division.hierarchies

    const result = createDivisionResolver(
      [division('root'), village],
      [area('root'), area('village')],
    ).resolve([1, 1])

    expect(result.path).toEqual(['root', 'village'])
    expect(result.status).toBe('resolved')
  })
})

test('unrelated missing polygons do not make a fully covered match incomplete', () => {
  const result = createDivisionResolver(
    [division('covered'), division('elsewhere')],
    [area('covered')],
  ).resolve([2, 2])
  expect(result.status).toBe('resolved')
  expect(result.coverage).toMatchObject({
    covered: 1,
    total: 2,
    missingAncestorIds: [],
  })
})

test('reverse geocoding combines containing L4 and L5 hoods on one ancestry branch', () => {
  const macro = division('mong-kok', 'hood', { full: [[entry('root')]] })
  Object.assign(macro.division, { class: 'macrohood', level: 4 })
  const hood = division('prince-edward', 'hood', { full: [[entry('root')]] })
  Object.assign(hood.division, { class: 'neighbourhood', level: 5 })
  const records = [division('root'), macro, hood]
  const areas = [area('root'), area('mong-kok', 0, 6), area('prince-edward', 3, 9)]
  const resolver = createDivisionResolver(records, areas)
  expect(resolver.resolve([4, 2])).toMatchObject({
    status: 'resolved',
    path: ['root', 'mong-kok', 'prince-edward'],
  })
  // Partial polygon overlap must not imply global parentage outside the overlap.
  expect(resolver.resolve([8, 2]).path).toEqual(['root', 'prince-edward'])
  expect(
    createDivisionResolver(records.toReversed(), areas.toReversed()).resolve([4, 2]),
  ).toEqual(resolver.resolve([4, 2]))
  const rival = division('other-hood', 'hood', { full: [[entry('root')]] })
  Object.assign(rival.division, { class: 'neighbourhood', level: 5 })
  expect(
    createDivisionResolver([...records, rival], [...areas, area('other-hood')]).resolve(
      [4, 2],
    ).status,
  ).toBe('ambiguous')
})

test('a containing L5 crossing its stored district resolves without an L4 parent', () => {
  const west = division('west', 'administrative', { full: [[entry('root')]] })
  const east = division('east', 'administrative', { full: [[entry('root')]] })
  const hood = division('hood', 'hood', {
    full: [[entry('root'), entry('west')]],
    administrative: [[entry('root'), entry('west')]],
  })
  Object.assign(hood.division, { class: 'neighbourhood', level: 5 })
  const resolver = createDivisionResolver(
    [division('root'), west, east, hood],
    [area('root'), area('west', 0, 5), area('east', 5, 10), area('hood', 3, 9)],
  )
  expect(resolver.resolve([8, 2])).toMatchObject({
    status: 'resolved',
    path: ['root', 'east', 'hood'],
  })
  expect(resolver.resolve([4, 2])).toMatchObject({
    status: 'resolved',
    path: ['root', 'west', 'hood'],
  })
  expect(resolver.resolve([5, 2]).status).toBe('ambiguous')
})

test('partial district and city/hood paths are complementary point memberships', () => {
  const district = division('wan-chai', 'administrative', { full: [[entry('root')]] })
  const city = division('hong-kong-city', 'locality', { full: [[entry('root')]] })
  Object.assign(city.division, { class: 'city', level: 1 })
  const hood = division('mid-levels', 'hood', {
    full: [[entry('root'), entry('hong-kong-city', 'city')]],
  })
  Object.assign(hood.division, { class: 'macrohood', level: 4 })
  const records = [division('root'), district, city, hood]
  const areas = records.map(record => area(record.division.id))
  const result = createDivisionResolver(records, areas).resolve([2, 2])
  expect(result).toMatchObject({
    status: 'resolved',
    path: ['root', 'wan-chai', 'hong-kong-city', 'mid-levels'],
  })
  expect(
    createDivisionResolver(records.toReversed(), areas.toReversed()).resolve([2, 2]),
  ).toEqual(result)
  const other = division('other-district', 'administrative', {
    full: [[entry('root')]],
  })
  expect(
    createDivisionResolver(
      [...records, other],
      [...areas, area('other-district')],
    ).resolve([2, 2]).status,
  ).toBe('ambiguous')
})
