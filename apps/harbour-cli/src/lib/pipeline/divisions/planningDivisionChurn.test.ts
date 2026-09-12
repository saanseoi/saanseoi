import { expect, test } from 'bun:test'
import {
  planningDivisionChurn,
  planningDivisionContentHash,
} from './planningDivisionChurn'

test('division churn ignores geometry and provenance but detects hierarchy changes', () => {
  const base = {
    id: 'a',
    level: 5,
    hierarchies: {
      administrative: [],
      locality: [],
      full: [[{ id: 'parent', class: 'region', name: 'Parent' }]],
    },
    identifiers: { tpu: '1' },
  }
  const before = planningDivisionContentHash({
    ...base,
    geometry: 'old',
    sources: { sourceVersion: '2016' },
  })
  expect(
    planningDivisionContentHash({
      ...base,
      geometry: 'new',
      sources: { sourceVersion: '2021' },
    }),
  ).toBe(before)
  expect(
    planningDivisionContentHash({
      ...base,
      hierarchies: {
        administrative: [],
        locality: [],
        full: [[{ id: 'other', class: 'region', name: 'Other' }]],
      },
    }),
  ).not.toBe(before)
  expect(
    planningDivisionContentHash({
      ...base,
      hierarchies: JSON.stringify(base.hierarchies),
      identifiers: JSON.stringify(base.identifiers),
    }),
  ).toBe(before)
})

test('distinguishes added, changed, removed and unchanged division identities', () => {
  const rows = planningDivisionChurn(
    [
      { id: 'a', versionHash: '1' },
      { id: 'b', versionHash: '1' },
      { id: 'c', versionHash: '1' },
    ],
    [
      { id: 'a', versionHash: '1' },
      { id: 'b', versionHash: '2' },
      { id: 'd', versionHash: '1' },
    ],
  )
  expect(Object.fromEntries(rows.map(row => [row.dimension, row.value]))).toEqual({
    count: 3,
    added_count: 1,
    changed_count: 1,
    removed_count: 1,
    unchanged_count: 1,
  })
})
