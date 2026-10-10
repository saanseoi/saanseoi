import { expect, test } from 'bun:test'
import {
  createAliasAudit,
  recordAliasAudit,
  reconstructAliasAudit,
} from './nameAliasAudit'
const rules = [{ locale: 'en', suffix: ' Tsuen', replacement: ' Village' }]
test('counts suffix matches separately from aliases already present', () => {
  const audit = createAliasAudit(rules)
  const before = [
    { locale: 'en', name: 'A Tsuen', nameAlts: 'A Village' },
    { locale: 'zh-hant', name: '村' },
  ]
  recordAliasAudit(audit, 'a', before, before)
  recordAliasAudit(
    audit,
    'b',
    [{ locale: 'en', name: 'B Tsuen' }],
    [
      {
        locale: 'en',
        name: 'B Tsuen',
        nameRules: JSON.stringify([{ value: 'B Village' }]),
      },
    ],
  )
  expect(audit[0]).toMatchObject({ matched: 2, changed: 1 })
})
test('backfill applies frozen primary-name patches before counting suffix matches', () => {
  const evidence = {
    definitions: {
      additions: { entries: [] },
      names: {
        nameAliasRules: rules,
        entries: [{ divisionId: 'a', names: { en: { name: 'A Tsuen' } } }],
      },
    },
    changes: [
      {
        id: 'a',
        names: {
          before: [{ locale: 'en', name: 'A Village', nameVariant: ['A Village'] }],
        },
      },
    ],
    names: [{ divisionId: 'a', locale: 'en', name: 'A Tsuen', nameAlts: 'A Village' }],
  }
  expect(reconstructAliasAudit(evidence)[0]).toMatchObject({ matched: 1, changed: 0 })
  evidence.changes = []
  evidence.definitions.names.entries = []
  expect(() => reconstructAliasAudit(evidence)).toThrow('No frozen alias input')
})
