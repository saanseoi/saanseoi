import { expect, test } from 'bun:test'
import { enrichCurationGroups, cleanCurationWording } from './auditCurations'
import { auditFixtureCatalogue, filterIndexedFixture } from './auditFixtureCatalogue'
test('island members use retained names and completed drawing markers are hidden only in presentation', () => {
  const source = {
    divisionId: 'place',
    geometryReview: 'draw-required',
    identifiers: { landsd: '3038' },
  }
  const result = enrichCurationGroups({
    'curation-definitions': {
      entries: [
        {
          section: 'islandGroups',
          definition: {
            divisionId: 'group',
            seedMemberIds: ['island', 'unknown'],
            include: [],
            exclude: [],
          },
        },
        { section: 'matches', collection: 'entries', definition: source },
      ],
    },
    'curation-record-names': { entries: [{ id: 'island', names: { en: 'Island' } }] },
  }) as any
  expect(result['curation-definitions'].entries[0].memberNames.seedMemberIds).toEqual([
    { id: 'island', names: { en: 'Island' } },
    { id: 'unknown', names: {} },
  ])
  expect(
    result['curation-definitions'].entries[1].definition.geometryReview,
  ).toBeUndefined()
  expect(source.geometryReview).toBe('draw-required')
})
test('hierarchy labels resolve from retained names while preserving original IDs', () => {
  const definition = { divisionId: 'child', paths: [['parent', 'unknown']] }
  const result = enrichCurationGroups({
    'curation-definitions': { entries: [{ section: 'decisions', definition }] },
    'curation-record-names': {
      entries: [{ id: 'parent', names: { en: 'Parent', 'zh-hant': '上層' } }],
    },
  }) as any
  expect(result['curation-definitions'].entries[0].pathNames).toEqual([
    [
      { id: 'parent', names: { en: 'Parent', 'zh-hant': '上層' } },
      { id: 'unknown', names: {} },
    ],
  ])
  expect(result['curation-definitions'].entries[0].definition).toEqual(definition)
})
test('retained names make excluded records searchable without counting the name index', () => {
  const groups = enrichCurationGroups({
    'curation-definitions': {
      entries: [
        {
          section: 'exclusions',
          collection: 'overture',
          definition: { divisionId: 'excluded' },
        },
      ],
    },
    'curation-record-names': {
      entries: [{ id: 'excluded', names: { 'zh-hant': '測試', en: 'Test place' } }],
    },
  })
  expect(groups['curation-record-names']).toBeUndefined()
  const group = auditFixtureCatalogue({ prepare: groups }, '').groups.prepare![
    'curation-definitions'
  ]!
  expect(group.rows).toHaveLength(1)
  expect(filterIndexedFixture(groups['curation-definitions']!, group, '測試')).toEqual(
    groups['curation-definitions'],
  )
})
test('geometry and withheld geometry use the division identity inside the feature', () => {
  const groups = enrichCurationGroups({
    'curation-definitions': {
      entries: [
        { definition: { feature: { id: 'stub:x', properties: { divisionId: 'x' } } } },
      ],
    },
    'prepared-division-changes': {
      entries: [{ id: 'x', names: { after: [{ locale: 'en', name: 'Place' }] } }],
    },
  })
  expect(JSON.stringify(groups['curation-definitions'])).toContain(
    '"canonicalNames":{"en":"Place"}',
  )
})
test('removes only the obsolete review sentence', () => {
  expect(cleanCurationWording('Added locality; geometry awaits local review.')).toBe(
    'Added locality.',
  )
  expect(
    cleanCurationWording(
      'Its representative point is the mapped cape and its boundary awaits local review.',
    ),
  ).toBe('Its representative point is the mapped cape.')
  expect(
    cleanCurationWording(
      'Retain reviewed ancestry where spatial evidence is incomplete.',
    ),
  ).toBe('Retain reviewed ancestry where spatial evidence is incomplete.')
})

test('preprocessing context restores publisher hierarchy without altering frozen evidence', () => {
  const original = {
    entries: [
      { id: 'x', fields: { hierarchies: { before: [], after: ['output'] } } },
      { id: 'y', fields: {} },
    ],
  }
  const groups = enrichCurationGroups({
    'curation-definitions': { entries: [] },
    'prepared-division-changes': original,
    'preprocessing-context': {
      entries: [
        {
          id: 'x',
          publisherHierarchy: ['publisher'],
          comparison: { kind: 'overture' },
        },
        { id: 'y', publisherHierarchy: ['publisher'] },
      ],
    },
  })
  expect(groups['preprocessing-context']).toBeUndefined()
  expect(groups['prepared-division-changes']).toMatchObject({
    entries: [
      { fields: { hierarchies: { before: ['publisher'], after: ['output'] } } },
      { fields: {} },
    ],
  })
  expect(original.entries[0]!.fields.hierarchies!.before).toEqual([])
})

test('boundary source IDs resolve through retained island identity matches', () => {
  const result = enrichCurationGroups({
    'curation-definitions': {
      entries: [
        {
          section: 'matches',
          collection: 'islands',
          definition: { id: 'LANDSD:PLACE_NAME:2446', matches: [{ id: 'canonical' }] },
        },
        {
          section: 'selections',
          collection: 'corrections',
          definition: { divisionId: 'LANDSD:PLACE_NAME:2446' },
        },
      ],
    },
    'prepared-division-changes': {
      entries: [
        {
          id: 'canonical',
          names: {
            after: [
              { locale: 'en', name: 'Tsing Yi' },
              { locale: 'zh-hant', name: '青衣' },
            ],
          },
        },
      ],
    },
  }) as any
  expect(result['curation-definitions'].entries[1].canonicalNames).toEqual({
    en: 'Tsing Yi',
    'zh-hant': '青衣',
  })
})

test('island review displays the selected source without changing its recorded decision', () => {
  const decision = { id: 'island', decision: 'rejected', note: 'Remove the pier.' }
  const result = enrichCurationGroups({
    'curation-definitions': {
      entries: [
        { section: 'exclusions', collection: 'islandDecisions', definition: decision },
        {
          section: 'selections',
          collection: 'entries',
          definition: { divisionId: 'island', sourceRecordId: 'OSM:123' },
        },
      ],
    },
  }) as any
  expect(result['curation-definitions'].entries[0].definition).toMatchObject({
    ...decision,
    selectedSourceRecordId: 'OSM:123',
  })
  expect(decision).not.toHaveProperty('selectedSourceRecordId')
})
