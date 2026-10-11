import { describe, expect, test } from 'bun:test'
import { mergeAuditFixtures } from './auditFixtureRows'
import { auditFixtureCatalogue, filterIndexedFixture } from './auditFixtureCatalogue'

describe('retained ordered JSON evidence', () => {
  test('reassembles partitions before counting and searching definition records', () => {
    const document = JSON.stringify({
      additions: {
        schemaVersion: 1,
        purpose: 'Reviewed additions',
        entries: [
          { id: 'one', names: { en: 'Tai Tam Gap' } },
          { id: 'two', names: { en: 'Thirty Houses' } },
        ],
      },
      updatePolicy: { coreLocales: ['en', 'zh-hant'], decisions: [] },
    })
    const value = mergeAuditFixtures([
      {
        encoding: 'ordered-json-text',
        parts: [{ ordinal: 1, json: document.slice(50) }],
      },
      {
        encoding: 'ordered-json-text',
        parts: [{ ordinal: 0, json: document.slice(0, 50) }],
      },
    ])
    const catalogue = auditFixtureCatalogue({ prepare: { definitions: value } }, '')
    const group = catalogue.groups.prepare!.definitions!
    expect(group.rows).toHaveLength(2)
    expect(filterIndexedFixture(value, group, 'Tai Tam')).toEqual({
      metadata: { updatePolicy: { coreLocales: ['en', 'zh-hant'] } },
      entries: [
        {
          section: 'additions',
          collection: 'entries',
          definition: { id: 'one', names: { en: 'Tai Tam Gap' } },
        },
      ],
    })
  })
  test('rejects missing parts rather than displaying partial evidence', () => {
    expect(() =>
      mergeAuditFixtures([
        { encoding: 'ordered-json-text', parts: [{ ordinal: 1, json: '{}' }] },
      ]),
    ).toThrow('Incomplete ordered JSON')
  })
})
