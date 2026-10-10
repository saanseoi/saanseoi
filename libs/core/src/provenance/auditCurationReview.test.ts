import { expect, test } from 'bun:test'
import { organiseCurationReview } from './auditCurationReview'
test('manual decisions join their fixture type without duplicating existing exclusions', () => {
  const result = organiseCurationReview(
    [
      {
        section: 'exclusions',
        collection: 'entries',
        definition: { divisionId: 'gone', reason: 'Existing exclusion' },
      },
      {
        section: 'updatePolicy',
        collection: 'decisions',
        definition: { fingerprint: 'old' },
      },
    ],
    [
      {
        divisionId: 'kept',
        field: '$record',
        status: 'keep',
        before: { names: { en: 'Kept place' } },
        proposed: null,
        fingerprint: 'keep',
        reason: 'Still exists',
      },
      {
        divisionId: 'gone',
        field: '$record',
        status: 'delete',
        before: {},
        proposed: null,
        fingerprint: 'delete',
        reason: 'Outside coverage',
      },
      { divisionId: 'automatic', field: '$record', status: 'added' },
      { divisionId: 'automatic', field: 'names.en.name', status: 'restored' },
      { divisionId: 'automatic', field: '$record', status: 'excluded' },
    ],
    'dr-hk-saanseoi-division-2026-10-01.0',
  )
  expect(result.entries).toHaveLength(2)
  expect(result.outcomes).toEqual({ restored: 1, excluded: 1 })
  expect(result.outcomeRecords).toEqual({
    restored: [{ divisionId: 'automatic', field: 'names.en.name', status: 'restored' }],
    excluded: [{ divisionId: 'automatic', field: '$record', status: 'excluded' }],
  })
  expect(result.entries[1]).toMatchObject({
    section: 'additions',
    definition: {
      recordedIn: 'dr-hk-saanseoi-division-2026-10-01.0',
      review: { kind: 'curation', guard: { id: 'division-source-updates' } },
    },
  })
})
test('release-scoped instructions share the normal typed collection', () => {
  const entry = {
    section: 'names',
    collection: 'releaseEntries',
    definition: { appliesFrom: '2026-10-01.0' },
  }
  expect(organiseCurationReview([entry], []).entries[0]).toEqual({
    ...entry,
    collection: 'entries',
  })
})
test('the edition bounds also govern the displayed instruction count', () => {
  const entry = {
    section: 'additions',
    collection: 'releaseEntries',
    definition: { appliesFrom: '2026-10-01.0', appliesUntil: '2026-11-01.0' },
  }
  expect(
    organiseCurationReview([entry], [], 'dr-hk-saanseoi-division-2026-09-01.0').entries,
  ).toHaveLength(0)
  expect(
    organiseCurationReview([entry], [], 'dr-hk-saanseoi-division-2026-10-01.0').entries,
  ).toHaveLength(1)
  expect(
    organiseCurationReview([entry], [], 'dr-hk-saanseoi-division-2026-11-01.0').entries,
  ).toHaveLength(0)
})
test('separate reviewed locales do not overwrite each other or an independent name patch', () => {
  const result = organiseCurationReview(
    [
      {
        section: 'names',
        collection: 'entries',
        definition: { divisionId: 'place', names: { en: { name: 'Patched name' } } },
      },
    ],
    ['en', 'zh-hant'].map(locale => ({
      divisionId: 'place',
      field: `names.${locale}.name`,
      status: 'keep',
      before: 'Accepted',
      proposed: 'Proposed',
      fingerprint: locale,
    })),
  )
  expect(result.entries).toHaveLength(3)
})

test('historical source exclusions merge into one scoped identity and retain points for reviewed additions', () => {
  const result = organiseCurationReview(
    [
      {
        section: 'exclusions',
        collection: 'entries',
        definition: { divisionId: 'x', reason: 'Outside coverage' },
      },
      {
        section: 'exclusions',
        collection: 'overture',
        definition: { divisionId: 'x' },
      },
    ],
    [
      {
        divisionId: 'kept',
        field: '$record',
        status: 'keep',
        before: { names: { en: 'Kept' }, point: [114, 22] },
        proposed: null,
      },
    ],
  )
  expect(result.entries).toHaveLength(2)
  expect(result.entries[0]).toMatchObject({
    collection: 'entries',
    definition: { scopes: ['result', 'overture'] },
  })
  expect(result.entries[1]).toMatchObject({ definition: { point: [114, 22] } })
})
