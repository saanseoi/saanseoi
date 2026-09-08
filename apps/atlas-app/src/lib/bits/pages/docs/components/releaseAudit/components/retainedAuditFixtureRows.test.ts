import { expect, test } from 'bun:test'
import { mergeAuditFixtures, auditFixtureRows } from './retainedAuditFixtureRows'
import {
  filterAuditFixture,
  matchesFixtureRow,
  fixtureHasContents,
  loadAuditFixtures,
} from './retainedAuditFixtureRows'
import geographic from '../../../../../../../../../../fixtures/meta/divisionCodes/geographic.json'

test('searches displayed registry codes without changing retained evidence', () => {
  const registered = geographic.assignments[0]
  if (!registered) throw new Error('Expected a geographic assignment')
  const row = { canonicalId: registered.canonicalId }
  expect(matchesFixtureRow(registered.divisionCode, row)).toBe(true)
  expect(row).toEqual({ canonicalId: registered.canonicalId })
  expect(
    matchesFixtureRow('retained-only', { ...row, divisionCode: 'retained-only' }),
  ).toBe(true)
})

test('deduplicated rows retain search terms from both representations', () => {
  const value = mergeAuditFixtures([
    {
      fields: [{ sourceField: 'x', metadata: { fieldName: 'name', note: 'selected' } }],
    },
    {
      fields: [
        {
          sourceField: 'x',
          fieldName: 'name',
          localisations: [{ name: '人口' }],
          note: 'reviewed',
        },
      ],
    },
  ])
  expect(auditFixtureRows(value)).toHaveLength(1)
  for (const query of ['selected', 'reviewed', '人口', 'selected reviewed']) {
    expect(auditFixtureRows(filterAuditFixture(value, query))).toHaveLength(1)
    expect(fixtureHasContents(value, query)).toBe(true)
  }
  expect(fixtureHasContents(value, 'missing')).toBe(false)
})

test('dimension property order does not produce duplicate rows', () => {
  expect(
    auditFixtureRows(
      mergeAuditFixtures([
        {
          fields: [
            { sourceField: 'x', dimensions: { a: 1, b: 2 } },
            { sourceField: 'x', dimensions: { b: 2, a: 1 } },
          ],
        },
      ]),
    ),
  ).toHaveLength(1)
})

test('preloading bounds requests and groups tables before counting', async () => {
  let running = 0
  let peak = 0
  let calls = 0
  const groups = await loadAuditFixtures(
    [
      {
        id: 'bulk',
        fixtures: Array.from({ length: 12 }, (_, i) => ({
          type: i < 6 ? 'first' : 'second',
        })),
      },
    ],
    async () => {
      calls++
      peak = Math.max(peak, ++running)
      await new Promise(resolve => setTimeout(resolve, 1))
      running--
      return { fields: [{ sourceField: 'same' }] }
    },
  )
  expect(calls).toBe(12)
  expect(peak).toBeLessThanOrEqual(4)
  const bulkGroups = groups.bulk
  if (!bulkGroups) throw new Error('Expected bulk fixture groups')
  const tables = Object.values(bulkGroups)
  expect(tables).toHaveLength(2)
  expect(tables.flatMap(auditFixtureRows)).toHaveLength(2)
  expect(
    tables.flatMap(value => auditFixtureRows(filterAuditFixture(value, 'same'))),
  ).toHaveLength(2)
})

test('cancelled releases do not start queued requests', async () => {
  let active = true
  let calls = 0
  await loadAuditFixtures(
    [{ id: 'bulk', fixtures: Array.from({ length: 20 }, () => ({ type: 'fields' })) }],
    async () => {
      calls++
      active = false
      return {}
    },
    () => active,
  )
  expect(calls).toBe(1)
})

test('combines selected and reviewed field representations without duplicate display rows', () => {
  const field = {
    fieldName: 'livingQuarters',
    measureCode: 'livingQuarters',
    dimensions: {},
  }
  const merged = mergeAuditFixtures([
    { fields: [{ sourceField: 'LQ', metadata: field }] },
    { fields: [{ sourceField: 'LQ', ...field }] },
  ])
  expect(auditFixtureRows(merged)).toHaveLength(1)
})
test('preserves distinct mappings and conflicting field values', () => {
  expect(
    auditFixtureRows(
      mergeAuditFixtures([
        {
          fields: [
            { sourceField: 'x', fieldName: 'one' },
            { sourceField: 'x', fieldName: 'two' },
          ],
        },
      ]),
    ),
  ).toHaveLength(2)
})
