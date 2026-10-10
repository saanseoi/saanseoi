import { expect, test } from 'bun:test'
import { preparationChecks } from './preparationChecks'
const feature = {
  geometry: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [2, 0],
        [2, 2],
        [0, 2],
        [0, 0],
      ],
    ],
  },
  properties: { corePoint: [0, 1] },
}
test('checks unique identities, division names, polygons and boundary-inclusive core points', () => {
  const guards = preparationChecks({
    records: [{ id: 'a' }],
    names: [{ divisionId: 'a', name: 'A' }],
    definitions: { geometry: { features: [feature] } },
  })
  expect(guards.map(g => g.status)).toEqual([
    'passed',
    'passed',
    'not-applicable',
    'passed',
    'passed',
    'not-applicable',
    'not-applicable',
  ])
})
test('rejects duplicates, unnamed divisions, invalid polygons and exterior points', () => {
  const guards = preparationChecks({
    records: [{ id: 'a' }, { id: 'a' }],
    names: [{ divisionId: 'b' }],
    definitions: {
      geometry: {
        features: [
          { ...feature, properties: { corePoint: [3, 3] } },
          { geometry: { type: 'Point', coordinates: [0, 0] } },
        ],
      },
    },
  })
  expect(guards.map(g => g.failed)).toEqual([1, 2, 0, 1, 1, 0, 0])
})

test('rejects dangling ancestor identities', () => {
  const guards = preparationChecks({
    records: [
      { id: 'a', hierarchies: JSON.stringify({ full: [[{ id: 'missing' }]] }) },
    ],
    names: [],
    definitions: {},
  })
  expect(
    guards.find(guard => guard.id === 'prepared-ancestor-references')?.failed,
  ).toBe(1)
})

test('requires a non-empty name for each division, in any locale', () => {
  const result = preparationChecks({
    records: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    names: [
      { divisionId: 'a', locale: 'zh-hant', name: '村落' },
      { divisionId: 'b', name: '  ' },
      { divisionId: 'c', name: null },
    ],
    definitions: {},
  })
  expect(result.find(guard => guard.id === 'prepared-division-names')).toMatchObject({
    checked: 3,
    failed: 2,
    status: 'failed',
  })
})

test('rejected island shapes need resolved replacement polygons, not selections or withheld drawings', () => {
  const guard = preparationChecks({
    records: [{ id: 'drawn' }],
    names: [],
    boundaryPatches: [
      {
        id: 'drawn',
        divisionId: 'drawn',
        kind: 'drawing',
        geometry: feature.geometry,
        sourceRecordIds: [],
      },
    ],
    definitions: {
      exclusions: {
        islandDecisions: ['drawn', 'selected', 'withheld', 'removed', 'pending'].map(
          id => ({ id, decision: 'rejected' }),
        ),
        islandActions: [
          { id: 'removed', action: 'exclude' },
          { id: 'pending', action: 'exclude', reviewRequired: true },
        ],
      },
      selections: { entries: [{ divisionId: 'selected', sourceRecordId: 'OSM:1' }] },
      geometry: {
        features: [{ ...feature, properties: { divisionId: 'drawn' } }],
        withheld: [{ ...feature, properties: { divisionId: 'withheld' } }],
      },
    },
  }).find(row => row.id === 'rejected-island-boundaries')
  expect(guard).toMatchObject({
    checked: 4,
    failed: 3,
    status: 'failed',
    consequence: 'block-ingestion',
  })
  expect(guard?.reason).toContain('selected, withheld, pending')
})

test('island groups require non-empty, unique members resolving to output islands', () => {
  const check = (memberIds?: string[]) =>
    preparationChecks({
      records: [
        { id: 'group', class: 'island_group' },
        { id: 'island', class: 'islet' },
        { id: 'town', class: 'town' },
      ],
      names: [],
      definitions: {},
      islandGroups: memberIds ? [{ divisionId: 'group', memberIds }] : [],
    }).find(guard => guard.id === 'prepared-island-group-members')
  expect(check(['island'])).toMatchObject({ status: 'passed', checked: 1, failed: 0 })
  for (const ids of [
    undefined,
    [],
    ['missing'],
    ['town'],
    ['group'],
    ['island', 'island'],
  ])
    expect(check(ids)).toMatchObject({
      status: 'failed',
      checked: 1,
      failed: 1,
      consequence: 'block-ingestion',
    })
})

test('replacement guard rejects empty, invalid, non-polygon and unresolved outputs', () => {
  for (const geometry of [
    { type: 'Point', coordinates: [0, 0] },
    { type: 'Polygon', coordinates: [] },
    {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [2, 2],
          [0, 2],
          [2, 0],
          [0, 0],
        ],
      ],
    },
  ]) {
    const result = preparationChecks({
      records: [{ id: 'output' }],
      names: [],
      definitions: {
        exclusions: { islandDecisions: [{ id: 'island', decision: 'rejected' }] },
      },
      boundaryPatches: [
        {
          id: 'island',
          divisionId: 'output',
          kind: 'source',
          geometry,
          sourceRecordIds: ['OSM:1'],
        },
      ],
    }).find(row => row.id === 'rejected-island-boundaries')
    expect(result?.status).toBe('failed')
  }
  for (const kind of ['drawing', 'source'] as const) {
    const evidence = {
      records: [{ id: 'output' }],
      names: [],
      definitions: {
        exclusions: { islandDecisions: [{ id: 'island', decision: 'rejected' }] },
      },
      boundaryPatches: [
        {
          id: 'island',
          divisionId: 'output',
          kind,
          geometry: feature.geometry,
          sourceRecordIds: [],
        },
      ],
    }
    expect(
      preparationChecks(evidence).find(row => row.id === 'rejected-island-boundaries')
        ?.status,
    ).toBe('passed')
    expect(
      preparationChecks({ ...evidence, records: [] }).find(
        row => row.id === 'rejected-island-boundaries',
      )?.status,
    ).toBe('failed')
  }
})
