import { expect, test } from 'bun:test'
import {
  curationCategory,
  curationMatchesResource,
  curationOrigin,
  curationSection,
} from './auditCurationSections'
test('boundary corrections and island geometry reviews belong only to DivisionArea', () => {
  for (const row of [
    { section: 'selections', collection: 'corrections' },
    { section: 'geometry', collection: 'features' },
    { section: 'geometry', collection: 'withheld' },
    { section: 'exclusions', collection: 'islandDecisions' },
  ]) {
    expect(curationMatchesResource(row, 'division')).toBe(false)
    expect(curationMatchesResource(row, 'divisionArea')).toBe(true)
    expect(curationMatchesResource(row, 'divisionBoundary')).toBe(false)
  }
  expect(curationMatchesResource({ section: 'names' }, 'division')).toBe(true)
})
test('guard labels require retained guard evidence', () => {
  expect(
    curationOrigin({
      definition: {
        review: { kind: 'curation', guard: { id: 'division-source-updates' } },
      },
    }),
  ).toBe('Guard')
  expect(curationOrigin({ section: 'additions' })).toBe('Custom')
  expect(curationOrigin({ definition: { review: { kind: 'curation' } } })).toBe(
    'Custom',
  )
})
test('instruction semantics determine the category, not its retaining operation', () => {
  expect(curationCategory({ section: 'classifications', collection: 'entries' })).toBe(
    'patches',
  )
  expect(curationCategory({ section: 'names', collection: 'entries' })).toBe('patches')
  expect(curationCategory({ section: 'names', collection: 'nameAliasRules' })).toBe(
    'rules',
  )
  expect(curationCategory({ section: 'additions', collection: 'entries' })).toBe(
    'curations',
  )
  expect(
    curationCategory({
      section: 'additions',
      collection: 'entries',
      definition: { review: { kind: 'curation' } },
    }),
  ).toBe('curations')
  expect(curationCategory({ section: 'exclusions', collection: 'islandActions' })).toBe(
    'curations',
  )
  expect(
    curationCategory({ section: 'exclusions', collection: 'islandDecisions' }),
  ).toBe('curations')
})

test('identity curations appear only under Division and distinguish disappearance from new records', () => {
  expect(curationMatchesResource({ section: 'additions' }, 'divisionArea')).toBe(false)
  const entry = (
    section: string,
    before: null | Record<string, never>,
    proposed: null | Record<string, never>,
  ) => ({
    section,
    definition: {
      review: {
        field: '$record',
        guard: { id: 'division-source-updates' },
        before,
        proposed,
      },
    },
  })
  expect(curationSection(entry('additions', {}, null)).title).toBe(
    'Removed upstream, but retained',
  )
  expect(curationSection(entry('exclusions', {}, null)).title).toBe(
    'Removed upstream, confirmed removal',
  )
  expect(curationSection(entry('additions', null, {})).title).toBe(
    'New upstream divisions, accepted',
  )
  expect(curationSection(entry('exclusions', null, {})).title).toBe(
    'New upstream divisions, rejected',
  )
})

test('island source selections are details, not separate audit entries', () => {
  for (const resource of ['division', 'divisionArea'])
    expect(
      curationMatchesResource(
        { section: 'selections', collection: 'entries' },
        resource,
      ),
    ).toBe(false)
})

test('drawn and replacement-source patches share the Boundaries section', () => {
  const drawn = { section: 'geometry', collection: 'features' }
  const replacement = { section: 'selections', collection: 'corrections' }
  expect(curationSection(drawn)).toEqual(curationSection(replacement))
  expect(curationCategory(drawn)).toBe('patches')
  expect(curationCategory(replacement)).toBe('patches')
})
