import { expect, test } from 'bun:test'
import { auditFixtureCatalogue, catalogueGroupMatches } from './auditFixtureCatalogue'
import { mergeAuditFixtures } from './auditFixtureRows'

test('compact metadata preserves deduplicated counts and search across representations', () => {
  const merged = mergeAuditFixtures([
    {
      fields: [{ sourceField: 'x', metadata: { fieldName: 'name', note: 'selected' } }],
    },
    {
      fields: [
        {
          sourceField: 'x',
          fieldName: 'name',
          note: 'reviewed',
          localisations: [{ name: '人口' }],
        },
      ],
    },
  ])
  const result = auditFixtureCatalogue({ bulk: { fields: merged } }, '2026-09-10.0')
  const group = result.groups.bulk?.fields
  if (!group) throw new Error('Expected field search metadata')
  expect(group.rows).toHaveLength(1)
  expect(group.text).toBeNull()
  expect(catalogueGroupMatches(group, 'selected reviewed 人口')).toBe(true)
  expect(catalogueGroupMatches(group, 'missing')).toBe(false)
  expect(catalogueGroupMatches(group, '')).toBe(true)
  expect(typeof group.rows[0]).toBe('string')
})

test('empty row groups remain hidden and non-tabular fixtures remain searchable', () => {
  const result = auditFixtureCatalogue(
    { bulk: { empty: { entries: [] }, rule: { note: 'Evidence' } } },
    '',
  )
  const { empty, rule } = result.groups.bulk ?? {}
  if (!empty || !rule) throw new Error('Expected fixture search metadata')
  expect(catalogueGroupMatches(empty, '')).toBe(false)
  expect(catalogueGroupMatches(rule, 'evidence')).toBe(true)
})
