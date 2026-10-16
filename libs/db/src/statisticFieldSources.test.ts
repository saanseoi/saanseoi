import { expect, test } from 'bun:test'
import {
  compactStatisticFieldSources,
  expandStatisticFieldSources,
  statisticFieldProperty,
  statisticFieldSource,
} from './statisticFieldSources'
const a = { sourceReleaseId: 'a', sourceFeatureRef: 'feature-a' }
const b = { sourceReleaseId: 'b', sourceFeatureRef: 'feature-b' }
test('shared provenance is stored once and overrides resolve before the default', () => {
  const expanded = { population: b, age: a, households: a }
  const compact = compactStatisticFieldSources(expanded)
  expect(compact).toEqual([
    { property: '', ...a },
    { property: '/values/population', ...b },
  ])
  expect(expandStatisticFieldSources(compact, Object.keys(expanded))).toEqual(expanded)
  expect(
    compactStatisticFieldSources({ households: a, age: a, population: b }),
  ).toEqual(compact)
  expect(compactStatisticFieldSources({ age: a, households: a })).toEqual([
    { property: '', ...a },
  ])
})
test('default tie-breaking and JSON Pointer escaping are deterministic', () => {
  expect(compactStatisticFieldSources({ z: b, a })).toEqual([
    { property: '', ...a },
    { property: '/values/z', ...b },
  ])
  const field = 'a/b~c'
  expect(statisticFieldProperty(field)).toBe('/values/a~1b~0c')
  expect(
    statisticFieldSource(
      [
        { property: '', ...a },
        { property: statisticFieldProperty(field), ...b },
      ],
      field,
    ),
  ).toEqual(b)
})
test('rejects ambiguous, uncovered, stale and malformed provenance', () => {
  for (const sources of [
    [
      { property: '', ...a },
      { property: '', ...b },
    ],
    [{ property: '/values/absent', ...a }],
    [],
    [{ property: '', sourceReleaseId: '', sourceFeatureRef: 'feature' }],
  ])
    expect(() => expandStatisticFieldSources(sources, ['age'])).toThrow()
  expect(() => expandStatisticFieldSources({ age: a } as never, ['age'])).toThrow(
    'array',
  )
  expect(expandStatisticFieldSources([], [])).toEqual({})
})
